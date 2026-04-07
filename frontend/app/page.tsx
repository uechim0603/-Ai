"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { listMeetings, MeetingListItem, STATUS_LABEL, STATUS_COLOR, formatDuration } from "@/lib/api";
import { Upload, Mic, Clock, Users, ChevronRight, Plus, Radio } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMeetings()
      .then(setMeetings)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const completedCount = meetings.filter((m) => m.status === "completed").length;
  const processingCount = meetings.filter(
    (m) => m.status === "transcribing" || m.status === "summarizing"
  ).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Mic className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">MeetFlow</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/record")}
              className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
            >
              <Radio className="w-4 h-4" />
              今すぐ録音
            </button>
            <button
              onClick={() => router.push("/upload")}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              ファイル追加
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="text-sm text-gray-500 mb-1">総会議数</div>
            <div className="text-3xl font-bold text-gray-900">{meetings.length}</div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="text-sm text-gray-500 mb-1">議事録完成</div>
            <div className="text-3xl font-bold text-green-600">{completedCount}</div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="text-sm text-gray-500 mb-1">処理中</div>
            <div className="text-3xl font-bold text-blue-600">{processingCount}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div
            onClick={() => router.push("/record")}
            className="bg-white border-2 border-dashed border-red-300 rounded-xl p-8 text-center cursor-pointer hover:border-red-500 hover:bg-red-50 transition-all"
          >
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Mic className="w-6 h-6 text-red-500" />
            </div>
            <div className="text-base font-medium text-gray-700">リアルタイム録音</div>
            <div className="text-sm text-gray-500 mt-1">マイクで今すぐ録音開始</div>
          </div>
          <div
            onClick={() => router.push("/upload")}
            className="bg-white border-2 border-dashed border-blue-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Upload className="w-6 h-6 text-blue-500" />
            </div>
            <div className="text-base font-medium text-gray-700">ファイルアップロード</div>
            <div className="text-sm text-gray-500 mt-1">mp3, mp4, m4a, wav 対応</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">会議一覧</h2>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-400">読み込み中...</div>
          ) : meetings.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Mic className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <div>まだ会議がありません</div>
              <div className="text-sm mt-1">音声ファイルをアップロードして始めましょう</div>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {meetings.map((meeting) => (
                <li
                  key={meeting.id}
                  className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => router.push(`/meetings/${meeting.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-medium text-gray-900 truncate">{meeting.title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[meeting.status]}`}>
                          {STATUS_LABEL[meeting.status]}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        {meeting.participants && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {meeting.participants}
                          </span>
                        )}
                        {meeting.duration_seconds > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {formatDuration(meeting.duration_seconds)}
                          </span>
                        )}
                        {meeting.created_at && (
                          <span>{new Date(meeting.created_at).toLocaleDateString("ja-JP")}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
