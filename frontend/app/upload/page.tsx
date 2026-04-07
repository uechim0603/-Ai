"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { uploadMeeting } from "@/lib/api";
import { Upload, Mic, ArrowLeft, FileAudio, X, Loader2 } from "lucide-react";

const ACCEPTED = ".mp3,.mp4,.m4a,.wav,.webm,.ogg,.flac";

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [participants, setParticipants] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = (f: File) => {
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
    setError("");
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [title]);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const handleSubmit = async () => {
    if (!file) { setError("音声ファイルを選択してください"); return; }
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title || file.name);
      fd.append("participants", participants);
      if (meetingDate) fd.append("meeting_date", meetingDate);
      const { id } = await uploadMeeting(fd);
      router.push(`/meetings/${id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "アップロードに失敗しました");
      setUploading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => router.push("/")} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-semibold text-gray-900">新しい会議をアップロード</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* ドロップゾーン */}
        <div
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
            dragging
              ? "border-blue-500 bg-blue-50"
              : file
              ? "border-green-400 bg-green-50"
              : "border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50"
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileAudio className="w-8 h-8 text-green-600" />
              <div className="text-left">
                <div className="font-medium text-gray-900">{file.name}</div>
                <div className="text-sm text-gray-500">{formatSize(file.size)}</div>
              </div>
              <button
                className="ml-2 text-gray-400 hover:text-red-500"
                onClick={(e) => { e.stopPropagation(); setFile(null); setTitle(""); }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <div className="font-medium text-gray-700">ここにファイルをドラッグ&ドロップ</div>
              <div className="text-sm text-gray-500 mt-1">またはクリックして選択</div>
              <div className="text-xs text-gray-400 mt-2">mp3, mp4, m4a, wav, webm, flac 対応 / 最大500MB</div>
            </>
          )}
        </div>

        {/* 会議情報フォーム */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">会議情報（任意）</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">会議タイトル</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：Q2営業戦略会議"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">参加者</label>
            <input
              type="text"
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              placeholder="例：田中、鈴木、山田（カンマ区切り）"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">会議日</label>
            <input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!file || uploading}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              アップロード中...
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              文字起こし・議事録作成を開始
            </>
          )}
        </button>

        <p className="text-xs text-center text-gray-400">
          処理には録音時間の約1/20の時間がかかります（60分 → 約3分）
        </p>
      </main>
    </div>
  );
}
