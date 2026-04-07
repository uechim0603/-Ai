@echo off
echo ========================================
echo   MeetFlow 起動スクリプト
echo ========================================
echo.

REM バックエンド起動（新しいウィンドウ）
echo [1/2] バックエンド起動中...
start "MeetFlow Backend" cmd /k "cd /d %~dp0backend && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000"

REM 少し待つ
timeout /t 5 /nobreak > nul

REM フロントエンド起動（新しいウィンドウ）
echo [2/2] フロントエンド起動中...
start "MeetFlow Frontend" cmd /k "cd /d %~dp0frontend && npm install && npm run dev"

echo.
echo ========================================
echo 起動完了！
echo バックエンド: http://localhost:8000
echo フロントエンド: http://localhost:3000
echo API ドキュメント: http://localhost:8000/docs
echo ========================================
echo.
echo ブラウザで http://localhost:3000 を開いてください
pause
