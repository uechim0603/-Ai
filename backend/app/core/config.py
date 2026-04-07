from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    secret_key: str = "dev-secret-key-change-in-production"
    # Render の永続ディスクは /app/data にマウント
    database_url: str = "sqlite+aiosqlite:////app/data/meetflow.db"
    upload_dir: str = "/app/data/uploads"
    max_file_size_mb: int = 500
    # カンマ区切りで複数オリジン許可（本番フロントエンドURLを環境変数で渡す）
    frontend_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"


settings = Settings()
