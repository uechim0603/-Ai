"""
音声文字起こしサービス
OpenAI Whisper API を使用（日本語特化）
"""
import os
from openai import AsyncOpenAI
from app.core.config import settings

client = AsyncOpenAI(api_key=settings.openai_api_key)

# 日本語でよく出るフィラー
FILLERS = [
    "えー", "えーと", "えっと", "あー", "あのー", "あの",
    "うーん", "うん、", "まあ、", "そのー", "なんか、", "なんか",
    "ちょっとー", "やっぱり、", "やっぱ、",
]


def remove_fillers(text: str) -> str:
    """フィラーワードを除去する"""
    for filler in FILLERS:
        text = text.replace(filler, "")
    # 連続スペースを整理
    import re
    text = re.sub(r"  +", " ", text)
    text = re.sub(r"、、+", "、", text)
    return text.strip()


async def transcribe_audio(audio_path: str) -> dict:
    """
    音声ファイルを文字起こしする
    Returns:
        {
            "text": "全文テキスト",
            "segments": [...],  # タイムスタンプ付きセグメント
            "duration": 秒数
        }
    """
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"音声ファイルが見つかりません: {audio_path}")

    file_size = os.path.getsize(audio_path)
    max_size = settings.max_file_size_mb * 1024 * 1024
    if file_size > max_size:
        raise ValueError(f"ファイルサイズが上限({settings.max_file_size_mb}MB)を超えています")

    with open(audio_path, "rb") as audio_file:
        response = await client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language="ja",
            response_format="verbose_json",
            timestamp_granularities=["segment"],
            prompt=(
                "これはビジネス会議の録音です。"
                "専門用語、会社名、人名を正確に書き起こしてください。"
                "句読点を適切に使用してください。"
            ),
        )

    # フィラー除去
    clean_text = remove_fillers(response.text)

    # セグメントも整形
    segments = []
    if hasattr(response, "segments") and response.segments:
        for seg in response.segments:
            segments.append({
                "start": round(seg.start, 1),
                "end": round(seg.end, 1),
                "text": remove_fillers(seg.text.strip()),
                "speaker": "話者A",  # 話者分離は別サービスで実施
            })

    duration = 0
    if segments:
        duration = int(segments[-1]["end"])

    return {
        "text": clean_text,
        "segments": segments,
        "duration": duration,
    }
