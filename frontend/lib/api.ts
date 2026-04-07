const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export type MeetingStatus =
  | "uploaded"
  | "transcribing"
  | "summarizing"
  | "completed"
  | "failed";

export interface Meeting {
  id: string;
  title: string;
  participants: string;
  status: MeetingStatus;
  transcript: string;
  minutes: string;
  decisions: { content: string; detail: string }[];
  todos: { assignee: string; task: string; deadline: string }[];
  issues: { topic: string; content: string }[];
  duration_seconds: number;
  meeting_date: string | null;
  created_at: string | null;
  error_message: string;
}

export interface MeetingListItem {
  id: string;
  title: string;
  participants: string;
  status: MeetingStatus;
  duration_seconds: number;
  meeting_date: string | null;
  created_at: string | null;
}

export async function uploadMeeting(formData: FormData): Promise<{ id: string; status: string }> {
  const res = await fetch(`${API_BASE}/meetings/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "アップロードに失敗しました");
  }
  return res.json();
}

export async function getMeeting(id: string): Promise<Meeting> {
  const res = await fetch(`${API_BASE}/meetings/${id}`);
  if (!res.ok) throw new Error("会議が見つかりません");
  return res.json();
}

export async function getMeetingStatus(id: string): Promise<{ status: MeetingStatus; error_message: string }> {
  const res = await fetch(`${API_BASE}/meetings/${id}/status`);
  if (!res.ok) throw new Error("取得失敗");
  return res.json();
}

export async function listMeetings(): Promise<MeetingListItem[]> {
  const res = await fetch(`${API_BASE}/meetings/`);
  if (!res.ok) throw new Error("一覧取得失敗");
  return res.json();
}

export async function deleteMeeting(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/meetings/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("削除失敗");
}

export function formatDuration(seconds: number): string {
  if (!seconds) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

export const STATUS_LABEL: Record<MeetingStatus, string> = {
  uploaded: "待機中",
  transcribing: "文字起こし中...",
  summarizing: "議事録生成中...",
  completed: "完了",
  failed: "エラー",
};

export const STATUS_COLOR: Record<MeetingStatus, string> = {
  uploaded: "bg-gray-100 text-gray-600",
  transcribing: "bg-blue-100 text-blue-700",
  summarizing: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};
