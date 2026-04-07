"""
AI議事録生成サービス
Claude API (claude-sonnet-4-6) を使用
"""
import json
import re
from anthropic import AsyncAnthropic
from app.core.config import settings

client = AsyncAnthropic(api_key=settings.anthropic_api_key)

SYSTEM_PROMPT = """あなたはビジネス会議の議事録作成の専門家です。
会議の文字起こしを分析し、以下の観点で正確・簡潔に整理してください。

出力は必ず以下のJSON形式で返してください：
{
  "summary": "会議全体の概要（3〜5文）",
  "decisions": [
    {"content": "決定事項の内容", "detail": "詳細・背景"}
  ],
  "issues": [
    {"topic": "論点のタイトル", "content": "議論された内容と結論"}
  ],
  "todos": [
    {"assignee": "担当者名", "task": "タスク内容", "deadline": "期限（例: 4/15, 来週中, 不明）"}
  ],
  "next_meeting": "次回会議の情報（なければ空文字）",
  "markdown": "そのまま社内共有できるMarkdown形式の議事録全文"
}

ルール：
- 決定事項は「〜することを決定」「〜で合意」などを必ず含める
- ToDoは担当者名が明示されていない場合は「未定」とする
- markdownは見やすく、箇条書き中心で作成する
- 情報が不足している項目は空配列または空文字にする
- フィラーや冗長な表現は省く
- 「そのまま共有できる」ビジネス文書として出力する"""


async def generate_minutes(
    transcript: str,
    title: str = "",
    participants: str = "",
    meeting_date: str = "",
) -> dict:
    """
    文字起こしテキストから議事録を生成する
    Returns:
        {
            "summary": str,
            "decisions": list,
            "issues": list,
            "todos": list,
            "next_meeting": str,
            "markdown": str,
        }
    """
    user_content = f"""以下の会議の文字起こしから議事録を作成してください。

【会議情報】
タイトル: {title or "（タイトルなし）"}
参加者: {participants or "（不明）"}
日時: {meeting_date or "（不明）"}

【文字起こし全文】
{transcript}

上記をもとに、指定のJSON形式で議事録を出力してください。"""

    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )

    raw_text = response.content[0].text

    # JSON部分を抽出
    json_match = re.search(r"\{[\s\S]*\}", raw_text)
    if not json_match:
        raise ValueError("AIからの応答をパースできませんでした")

    result = json.loads(json_match.group())

    # 必須キーの補完
    result.setdefault("summary", "")
    result.setdefault("decisions", [])
    result.setdefault("issues", [])
    result.setdefault("todos", [])
    result.setdefault("next_meeting", "")
    result.setdefault("markdown", "")

    return result
