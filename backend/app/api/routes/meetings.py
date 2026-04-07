"""
会議APIルーター
"""
import os
import json
import asyncio
import aiofiles
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import get_db
from app.models.meeting import Meeting, MeetingStatus
from app.services.transcription import transcribe_audio
from app.services.minutes_generator import generate_minutes
from app.core.config import settings

router = APIRouter(prefix="/meetings", tags=["meetings"])

ALLOWED_EXTENSIONS = {".mp3", ".mp4", ".m4a", ".wav", ".webm", ".ogg", ".flac"}


async def process_meeting(meeting_id: str, audio_path: str, title: str, participants: str):
    """バックグラウンドで文字起こし→議事録生成を実行"""
    from app.models.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        meeting = await db.get(Meeting, meeting_id)
        if not meeting:
            return

        try:
            # Step 1: 文字起こし
            meeting.status = MeetingStatus.transcribing
            await db.commit()

            transcription = await transcribe_audio(audio_path)
            meeting.transcript = transcription["text"]
            meeting.duration_seconds = transcription["duration"]
            await db.commit()

            # Step 2: 議事録生成
            meeting.status = MeetingStatus.summarizing
            await db.commit()

            result = await generate_minutes(
                transcript=transcription["text"],
                title=title,
                participants=participants,
                meeting_date=meeting.meeting_date.strftime("%Y/%m/%d") if meeting.meeting_date else "",
            )

            meeting.minutes = result["markdown"]
            meeting.decisions = json.dumps(result["decisions"], ensure_ascii=False)
            meeting.todos = json.dumps(result["todos"], ensure_ascii=False)
            meeting.issues = json.dumps(result["issues"], ensure_ascii=False)
            meeting.status = MeetingStatus.completed
            await db.commit()

        except Exception as e:
            meeting.status = MeetingStatus.failed
            meeting.error_message = str(e)
            await db.commit()


@router.post("/upload")
async def upload_meeting(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(default="無題の会議"),
    participants: str = Form(default=""),
    meeting_date: Optional[str] = Form(default=None),
    db: AsyncSession = Depends(get_db),
):
    """音声ファイルをアップロードして処理を開始する"""
    # 拡張子チェック
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"対応形式: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # ファイル保存
    os.makedirs(settings.upload_dir, exist_ok=True)
    meeting = Meeting(
        title=title,
        participants=participants,
        meeting_date=datetime.strptime(meeting_date, "%Y-%m-%d") if meeting_date else None,
    )
    db.add(meeting)
    await db.flush()  # IDを確定

    audio_path = os.path.join(settings.upload_dir, f"{meeting.id}{ext}")
    meeting.audio_path = audio_path
    await db.commit()

    async with aiofiles.open(audio_path, "wb") as out:
        content = await file.read()
        await out.write(content)

    # バックグラウンド処理開始
    background_tasks.add_task(
        process_meeting,
        meeting.id,
        audio_path,
        title,
        participants,
    )

    return {"id": meeting.id, "status": meeting.status, "message": "処理を開始しました"}


@router.get("/{meeting_id}")
async def get_meeting(meeting_id: str, db: AsyncSession = Depends(get_db)):
    """会議詳細を取得"""
    meeting = await db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="会議が見つかりません")

    return {
        "id": meeting.id,
        "title": meeting.title,
        "participants": meeting.participants,
        "status": meeting.status,
        "transcript": meeting.transcript,
        "minutes": meeting.minutes,
        "decisions": json.loads(meeting.decisions) if meeting.decisions else [],
        "todos": json.loads(meeting.todos) if meeting.todos else [],
        "issues": json.loads(meeting.issues) if meeting.issues else [],
        "duration_seconds": meeting.duration_seconds,
        "meeting_date": meeting.meeting_date.isoformat() if meeting.meeting_date else None,
        "created_at": meeting.created_at.isoformat() if meeting.created_at else None,
        "error_message": meeting.error_message,
    }


@router.get("/{meeting_id}/status")
async def get_status(meeting_id: str, db: AsyncSession = Depends(get_db)):
    """処理ステータスのみ取得（ポーリング用）"""
    meeting = await db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="会議が見つかりません")
    return {"status": meeting.status, "error_message": meeting.error_message}


@router.get("/")
async def list_meetings(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """会議一覧を取得"""
    result = await db.execute(
        select(Meeting).order_by(Meeting.created_at.desc()).offset(skip).limit(limit)
    )
    meetings = result.scalars().all()

    return [
        {
            "id": m.id,
            "title": m.title,
            "participants": m.participants,
            "status": m.status,
            "duration_seconds": m.duration_seconds,
            "meeting_date": m.meeting_date.isoformat() if m.meeting_date else None,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in meetings
    ]


@router.delete("/{meeting_id}")
async def delete_meeting(meeting_id: str, db: AsyncSession = Depends(get_db)):
    """会議を削除"""
    meeting = await db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="会議が見つかりません")

    # 音声ファイル削除
    if meeting.audio_path and os.path.exists(meeting.audio_path):
        os.remove(meeting.audio_path)

    await db.delete(meeting)
    await db.commit()
    return {"message": "削除しました"}
