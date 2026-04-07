from sqlalchemy import Column, String, Text, DateTime, Integer, Enum as SAEnum
from sqlalchemy.sql import func
from app.models.database import Base
import enum
import uuid


class MeetingStatus(str, enum.Enum):
    uploaded = "uploaded"
    transcribing = "transcribing"
    summarizing = "summarizing"
    completed = "completed"
    failed = "failed"


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False)
    participants = Column(Text, default="")          # カンマ区切り
    audio_path = Column(String(500), nullable=True)
    transcript = Column(Text, default="")            # 全文テキスト
    minutes = Column(Text, default="")               # AI生成議事録（Markdown）
    decisions = Column(Text, default="")             # 決定事項（JSON）
    todos = Column(Text, default="")                 # ToDo（JSON）
    issues = Column(Text, default="")                # 論点（JSON）
    status = Column(SAEnum(MeetingStatus), default=MeetingStatus.uploaded)
    error_message = Column(Text, default="")
    duration_seconds = Column(Integer, default=0)
    meeting_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
