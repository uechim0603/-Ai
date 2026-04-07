"""
リアルタイム録音 WebSocket エンドポイント

フロー:
  1. ブラウザが20秒ごとに完結した webm 音声セグメントを送信
  2. バックエンドが Whisper で文字起こし → テキストを返す
  3. 録音停止後、蓄積テキストで議事録を生成
"""
import os
import uuid
import tempfile
import json
import aiofiles
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db, AsyncSessionLocal
from app.models.meeting import Meeting, MeetingStatus
from app.services.transcription import transcribe_audio, remove_fillers
from app.services.minutes_generator import generate_minutes
from app.core.config import settings

router = APIRouter(prefix="/recording", tags=["recording"])


@router.websocket("/ws/{session_id}")
async def recording_ws(websocket: WebSocket, session_id: str):
    """
    WebSocket で音声セグメントを受け取り、リアルタイムで文字起こしを返す。

    クライアントから受け取るメッセージ:
      - binary: 音声セグメント (webm)
      - text JSON {"type": "finalize", "title": "...", "participants": "..."}

    サーバーから送るメッセージ:
      - {"type": "transcript", "text": "...", "segment_index": N}
      - {"type": "processing"}
      - {"type": "meeting_id", "id": "..."}
      - {"type": "error", "message": "..."}
    """
    await websocket.accept()

    accumulated_text = ""
    segment_index = 0
    meeting_title = "リアルタイム録音"
    meeting_participants = ""

    try:
        while True:
            message = await websocket.receive()

            # --- バイナリ = 音声セグメント ---
            if "bytes" in message and message["bytes"]:
                audio_data = message["bytes"]
                await websocket.send_json({"type": "processing"})

                # 一時ファイルに保存してWhisper処理
                suffix = ".webm"
                tmp_path = None
                try:
                    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                        tmp.write(audio_data)
                        tmp_path = tmp.name

                    result = await transcribe_audio(tmp_path)
                    text = result["text"].strip()

                    if text:
                        accumulated_text += (" " if accumulated_text else "") + text
                        await websocket.send_json({
                            "type": "transcript",
                            "text": text,
                            "segment_index": segment_index,
                        })
                        segment_index += 1

                except Exception as e:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"文字起こしエラー: {str(e)}",
                    })
                finally:
                    if tmp_path and os.path.exists(tmp_path):
                        os.unlink(tmp_path)

            # --- テキスト = コントロールメッセージ ---
            elif "text" in message and message["text"]:
                data = json.loads(message["text"])

                if data.get("type") == "set_info":
                    meeting_title = data.get("title", meeting_title)
                    meeting_participants = data.get("participants", "")

                elif data.get("type") == "finalize":
                    # 録音終了 → DB保存 → 議事録生成
                    meeting_title = data.get("title", meeting_title)
                    meeting_participants = data.get("participants", "")

                    await websocket.send_json({"type": "processing", "message": "議事録を生成中..."})

                    async with AsyncSessionLocal() as db:
                        meeting = Meeting(
                            title=meeting_title,
                            participants=meeting_participants,
                            transcript=accumulated_text,
                            status=MeetingStatus.summarizing,
                        )
                        db.add(meeting)
                        await db.flush()
                        meeting_id = meeting.id
                        await db.commit()

                    # 議事録生成（WebSocketは維持したまま非同期実行）
                    try:
                        result = await generate_minutes(
                            transcript=accumulated_text,
                            title=meeting_title,
                            participants=meeting_participants,
                        )
                        async with AsyncSessionLocal() as db:
                            m = await db.get(Meeting, meeting_id)
                            if m:
                                m.minutes = result["markdown"]
                                m.decisions = json.dumps(result["decisions"], ensure_ascii=False)
                                m.todos = json.dumps(result["todos"], ensure_ascii=False)
                                m.issues = json.dumps(result["issues"], ensure_ascii=False)
                                m.status = MeetingStatus.completed
                                await db.commit()

                        await websocket.send_json({
                            "type": "meeting_id",
                            "id": meeting_id,
                        })

                    except Exception as e:
                        async with AsyncSessionLocal() as db:
                            m = await db.get(Meeting, meeting_id)
                            if m:
                                m.status = MeetingStatus.failed
                                m.error_message = str(e)
                                await db.commit()
                        await websocket.send_json({
                            "type": "error",
                            "message": f"議事録生成エラー: {str(e)}",
                        })
                    break

    except WebSocketDisconnect:
        pass
