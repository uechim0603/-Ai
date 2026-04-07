import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MeetFlow - 会議の意思決定を加速する",
  description: "AIが文字起こし・議事録を自動生成。決定事項・ToDo・論点を即座に整理。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className={geist.className}>{children}</body>
    </html>
  );
}
