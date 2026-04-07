"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Mic, MicOff, Square, ArrowLeft, Loader2,
  AlertCircle, CheckCircle, Circle
} from "lucide-react";

// HTTP → WS、HTTPS → WSS に自動変換
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const WS_URL = API_URL.replace(/^https/, "wss").replace(/^http/, "ws");

// 20秒ごとにセグメントを区切ってWhisperへ送る
const SEGMENT_DURATION_MS = 20_000;

type RecordingState = "idle" | "recording" | "finalizing" | "done" | "error";

interface TranscriptSegment {
  index: number;
  text: string;
}

export default function RecordPage() {
  const router = useRouter();
  const [state, setState] = useState<RecordingState>("idle");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [processingSegment, setProcessingSegment] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [title, setTitle] = useState("");
  const [participants, setParticipants] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [sessionId] = useState(() => crypto.randomUUID());

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // 自動スクロール
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments, processingSegment]);

  const connectWS = useCallback((): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}/recording/ws/${sessionId}`);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => resolve(ws);
      ws.onerror = () => reject(new Error("WebSocket接続に失敗しました"));

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string);

        if (msg.type === "processing") {
          setProcessingSegment(true);
        } else if (msg.type === "transcript") {
          setProcessingSegment(false);
          setSegments((prev) => [...prev, { index: msg.segment_index, text: msg.text }]);
        } else if (msg.type === "meeting_id") {
          setState("done");
          router.push(`/meetings/${msg.id}`);
        } else if (msg.type === "error") {
          setProcessingSegment(false);
          setErrorMsg(msg.message);
          // エラーは表示するが録音は継続
        }
      };

      wsRef.current = ws;
    });
  }, [sessionId, router]);

  // 現在の MediaRecorder を停止してセグメントを送信し、新しいセグメントを開始
  const rotateSegment = useCallback((stream: MediaStream) => {
    const currentRecorder = recorderRef.current;
    if (!currentRecorder || currentRecorder.state === "inactive") return;

    const chunks: BlobPart[] = [];
    const nextRecorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm",
    });

    // 次のレコーダーを先に準備してすき間なく録音
    nextRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    nextRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      if (blob.size > 1000 && wsRef.current?.readyState === WebSocket.OPEN) {
        blob.arrayBuffer().then((buf) => wsRef.current?.send(buf));
      }
    };
    nextRecorder.start();
    recorderRef.current = nextRecorder;

    // 旧レコーダーを止めて送信トリガー
    currentRecorder.stop();
  }, []);

  const startRecording = async () => {
    setErrorMsg("");
    setSegments([]);
    setElapsedSec(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      streamRef.current = stream;

      const ws = await connectWS();

      // 会議情報を送信
      ws.send(JSON.stringify({ type: "set_info", title, participants }));

      // 最初のセグメント録音開始
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        if (blob.size > 1000 && ws.readyState === WebSocket.OPEN) {
          blob.arrayBuffer().then((buf) => ws.send(buf));
        }
      };
      recorder.start();
      recorderRef.current = recorder;

      // 経過時間タイマー
      timerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);

      // 20秒ごとにセグメント切り替え
      segmentTimerRef.current = setInterval(() => rotateSegment(stream), SEGMENT_DURATION_MS);

      setState("recording");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "マイクへのアクセスに失敗しました");
    }
  };

  const stopRecording = async () => {
    setState("finalizing");

    // タイマー停止
    if (timerRef.current) clearInterval(timerRef.current);
    if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);

    // 最後のセグメントを送信（recorder.stop() で ondataavailable → onstop が発火）
    const finalChunks: BlobPart[] = [];
    const finalRecorder = recorderRef.current;

    if (finalRecorder && finalRecorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        finalRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) finalChunks.push(e.data);
        };
        finalRecorder.onstop = async () => {
          const blob = new Blob(finalChunks, { type: "audio/webm" });
          if (blob.size > 1000 && wsRef.current?.readyState === WebSocket.OPEN) {
            const buf = await blob.arrayBuffer();
            wsRef.current.send(buf);
          }
          resolve();
        };
        finalRecorder.stop();
      });
    }

    // マイク停止
    streamRef.current?.getTracks().forEach((t) => t.stop());

    // finalizeコマンド送信 → バックエンドが議事録生成 → meeting_idを返す
    // 最後のセグメントが処理される時間を少し待つ
    await new Promise((r) => setTimeout(r, 2000));
    wsRef.current?.send(JSON.stringify({ type: "finalize", title, participants }));
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const fullTranscript = segments.map((s) => s.text).join(" ");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            disabled={state === "recording" || state === "finalizing"}
            className="text-gray-500 hover:text-gray-700 disabled:opacity-30"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-semibold text-gray-900">リアルタイム録音</h1>
          {state === "recording" && (
            <div className="ml-auto flex items-center gap-2 text-red-500 font-mono text-sm font-medium">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              {formatTime(elapsedSec)}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 flex-1 flex flex-col gap-6 w-full">
        {/* 会議情報入力（録音前のみ） */}
        {state === "idle" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">会議情報（任意）</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">会議タイトル</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：月次定例会"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">参加者</label>
              <input
                type="text"
                value={participants}
                onChange={(e) => setParticipants(e.target.value)}
                placeholder="例：田中、鈴木、山田"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* ライブ文字起こし表示エリア */}
        {(state === "recording" || state === "finalizing" || segments.length > 0) && (
          <div className="bg-white rounded-xl border border-gray-200 flex-1 flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">ライブ文字起こし</span>
              <span className="text-xs text-gray-400">{segments.length}セグメント完了</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-48 max-h-96">
              {segments.length === 0 && !processingSegment && (
                <p className="text-sm text-gray-400 text-center pt-8">
                  話し始めると、ここに文字が表示されます
                </p>
              )}
              {segments.map((seg) => (
                <div key={seg.index} className="flex gap-3">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-800 leading-relaxed">{seg.text}</p>
                </div>
              ))}
              {processingSegment && (
                <div className="flex gap-3 items-center">
                  <Loader2 className="w-4 h-4 text-blue-500 flex-shrink-0 animate-spin" />
                  <p className="text-sm text-gray-400">認識中...</p>
                </div>
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        )}

        {/* エラー表示 */}
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {errorMsg}
          </div>
        )}

        {/* finalizing 表示 */}
        {state === "finalizing" && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-3" />
            <div className="font-medium text-purple-800">議事録を生成中...</div>
            <div className="text-sm text-purple-600 mt-1">全文テキストをAIが分析しています</div>
          </div>
        )}

        {/* コントロールボタン */}
        <div className="flex flex-col items-center gap-4">
          {state === "idle" && (
            <>
              <button
                onClick={startRecording}
                className="w-24 h-24 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg hover:shadow-xl transition-all active:scale-95"
              >
                <Mic className="w-10 h-10" />
              </button>
              <span className="text-sm text-gray-500">タップして録音開始</span>
            </>
          )}

          {state === "recording" && (
            <>
              <button
                onClick={stopRecording}
                className="w-24 h-24 rounded-full bg-gray-800 hover:bg-gray-900 text-white flex items-center justify-center shadow-lg hover:shadow-xl transition-all active:scale-95"
              >
                <Square className="w-10 h-10" fill="white" />
              </button>
              <span className="text-sm text-gray-500">タップして録音停止・議事録生成</span>

              {/* セグメント進捗バー */}
              <div className="w-full max-w-xs">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>次のセグメント処理まで</span>
                  <span>{SEGMENT_DURATION_MS / 1000 - (elapsedSec % (SEGMENT_DURATION_MS / 1000))}秒</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                    style={{
                      width: `${((elapsedSec % (SEGMENT_DURATION_MS / 1000)) / (SEGMENT_DURATION_MS / 1000)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </>
          )}

          {state === "finalizing" && (
            <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-gray-400 animate-spin" />
            </div>
          )}
        </div>

        {/* 使い方ヒント */}
        {state === "idle" && (
          <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700 space-y-1">
            <div className="font-medium mb-2">使い方</div>
            <div className="flex gap-2"><Circle className="w-3 h-3 mt-1 flex-shrink-0" />録音ボタンを押して会議開始</div>
            <div className="flex gap-2"><Circle className="w-3 h-3 mt-1 flex-shrink-0" />20秒ごとに自動で文字起こし（リアルタイム表示）</div>
            <div className="flex gap-2"><Circle className="w-3 h-3 mt-1 flex-shrink-0" />会議終了後に停止ボタン → AIが議事録を自動生成</div>
          </div>
        )}
      </main>
    </div>
  );
}
