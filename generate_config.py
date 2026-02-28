""" .env.local'dan config.js oluşturur (client-side Supabase bilgileri). """
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env.local")

url = __import__("os").environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
key = __import__("os").environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

Path(__file__).parent.joinpath("config.js").write_text(
    f'const SUPABASE_URL = "{url}";\nconst SUPABASE_ANON_KEY = "{key}";\n',
    encoding="utf-8",
)
print("config.js oluşturuldu.")
