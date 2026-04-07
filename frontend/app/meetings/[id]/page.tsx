"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getMeeting, Meeting, STATUS_LABEL, STATUS_COLOR, formatDuration } from "@/lib/api";
import {
  ArrowLeft, CheckSquare, MessageSquare, ListTodo,
  Clock, Users, Copy, Check, Loader2, AlertCircle
} from "lucide-react";

const POLL_STATUSES = new Set(["uploaded", "transcribing", "summarizing"]);

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"minutes" | "transcript">("minutes");
  const [copied, setCopied] = useState(false);

  const fetchMeeting = useCallback(async () => {
    const data = await getMeeting(id);
    setMeeting(data);
    setLoading(false);
    return data;
  }, [id]);

  useEffect(() => {
    fetchMeeting();
  }, [fetchMeeting]);

  // ポーリング（処理中のみ）
  useEffect(() => {
    if (!meeting || !POLL_STATUSES.has(meeting.status)) return;
    const timer = setInterval(async () => {
      const data = await fetchMeeting();
      if (!POLL_STATUSES.has(data.status)) clearInterval(timer);
    }, 3000);
    return () => clearInterval(timer);
  }, [meeting?.status, fetchMeeting]);

  const copyToClipboard = async () => {
    if (!meeting?.minutes) return;
    await navigator.clipboard.writeText(meeting.minutes);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!meeting) return null;

  const isProcessing = POLL_STATUSES.has(meeting.status);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => router.push("/")} className="text-gray-500 hover:text-gray-700 flex-shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-semibold text-gray-900 truncate">{meeting.title}</h1>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {meeting.participants && (
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />{meeting.participants}
                  </span>
                )}
                {meeting.duration_seconds > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />{formatDuration(meeting.duration_seconds)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLOR[meeting.status]}`}>
              {isProcessing && <Loader2 className="w-3 h-3 animate-spin inline mr-1" />}
              {STATUS_LABEL[meeting.status]}
            </span>
            {meeting.status === "completed" && (
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "コピー済み" : "コピー"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* 処理中表示 */}
        {isProcessing && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center mb-6">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
            <div className="font-medium text-blue-800">
              {meeting.status === "transcribing" ? "文字起こし中..." : "議事録を生成中..."}
            </div>
            <div className="text-sm text-blue-600 mt-1">完了後に自動で表示されます（このページはそのままでOK）</div>
          </div>
        )}

        {/* エラー表示 */}
        {meeting.status === "failed" && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-red-800">処理に失敗しました</div>
              <div className="text-sm text-red-600 mt-1">{meeting.error_message || "不明なエラー"}</div>
            </div>
          </div>
        )}

        {meeting.status === "completed" && (
          <>
            {/* 決定事項・ToDo・論点 カード */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* 決定事項 */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <CheckSquare className="w-4 h-4 text-green-600" />
                  <h2 className="font-semibold text-gray-800">決定事項</h2>
                  <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    {meeting.decisions.length}件
                  </span>
                </div>
                {meeting.decisions.length === 0 ? (
                  <p className="text-sm text-gray-400">なし</p>
                ) : (
                  <ul className="space-y-2">
                    {meeting.decisions.map((d, i) => (
                      <li key={i} className="text-sm">
                        <span className="text-green-600 font-bold mr-1">✓</span>
                        <span className="text-gray-800">{d.content}</span>
                        {d.detail && <div className="text-xs text-gray-500 mt-0.5 ml-4">{d.detail}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ToDo */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <ListTodo className="w-4 h-4 text-blue-600" />
                  <h2 className="font-semibold text-gray-800">ToDo</h2>
                  <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    {meeting.todos.length}件
                  </span>
                </div>
                {meeting.todos.length === 0 ? (
                  <p className="text-sm text-gray-400">なし</p>
                ) : (
                  <ul className="space-y-2">
                    {meeting.todos.map((t, i) => (
                      <li key={i} className="text-sm">
                        <div className="flex items-start gap-1.5">
                          <span className="text-blue-500 mt-0.5">□</span>
                          <div>
                            <span className="font-medium text-gray-800">{t.assignee}</span>
                            <span className="text-gray-600">：{t.task}</span>
                            {t.deadline && (
                              <div className="text-xs text-orange-600 mt-0.5">期限: {t.deadline}</div>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 論点 */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-4 h-4 text-purple-600" />
                  <h2 className="font-semibold text-gray-800">論点</h2>
                  <span className="ml-auto text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    {meeting.issues.length}件
                  </span>
                </div>
                {meeting.issues.length === 0 ? (
                  <p className="text-sm text-gray-400">なし</p>
                ) : (
                  <ul className="space-y-2">
                    {meeting.issues.map((issue, i) => (
                      <li key={i} className="text-sm">
                        <div className="font-medium text-gray-800">{issue.topic}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{issue.content}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* タブ：議事録 / 全文テキスト */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex border-b border-gray-200">
                <button
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === "minutes"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  onClick={() => setActiveTab("minutes")}
                >
                  AI議事録
                </button>
                <button
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === "transcript"
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                  onClick={() => setActiveTab("transcript")}
                >
                  全文テキスト
                </button>
              </div>

              <div className="p-6">
                {activeTab === "minutes" ? (
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">
                    {meeting.minutes || "議事録がありません"}
                  </pre>
                ) : (
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
                    {meeting.transcript || "テキストがありません"}
                  </pre>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
