"""
Piyasa verilerini Yahoo Finance'dan çekip Supabase piyasa_arsivi tablosuna yükler.
2016-01-01'den bugüne USD/TL, EUR/TL ve Altın Gram fiyatları.
"""

import os
from datetime import date

from dotenv import load_dotenv
import pandas as pd
import yfinance as yf
from supabase import create_client

# .env.local'dan değişkenleri oku
load_dotenv(".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GRAMS_PER_OUNCE = 31.1035

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY .env.local'da tanımlı olmalı.")


def fetch_market_data() -> list[dict]:
    """Yahoo Finance'dan piyasa verilerini çeker, forward fill ile eksikleri doldurur."""
    start = "2016-01-01"
    end = date.today().isoformat()

    try:
        usd = yf.download("USDTRY=X", start=start, end=end, progress=False, auto_adjust=True)
        eur = yf.download("EURTRY=X", start=start, end=end, progress=False, auto_adjust=True)
        gold = yf.download("GC=F", start=start, end=end, progress=False, auto_adjust=True)
    except Exception as e:
        raise RuntimeError(f"Yahoo Finance veri çekme hatası: {e}") from e

    # Close sütununu al (yfinance tek/çoklu ticker farklı format döner)
    def close_col(df):
        if df is None or df.empty:
            return None
        cols = df.columns
        if isinstance(cols, pd.MultiIndex):
            close_candidates = [c for c in cols if c[0] == "Close"]
            return df[close_candidates[0]] if close_candidates else df.iloc[:, 3]
        return df["Close"] if "Close" in cols else df.iloc[:, 3]

    usd_close = close_col(usd)
    eur_close = close_col(eur)
    gold_close = close_col(gold)

    if usd_close is None or usd_close.empty:
        raise RuntimeError("USD/TRY verisi alınamadı.")

    # Tüm tarihleri birleştir
    df = pd.DataFrame(index=pd.date_range(start=start, end=end, freq="D"))
    df.index.name = "tarih"
    df["usd_kur"] = usd_close.reindex(df.index)
    df["eur_kur"] = eur_close.reindex(df.index) if eur_close is not None else None
    df["gold_oz"] = gold_close.reindex(df.index) if gold_close is not None else None

    # Forward fill (önceki günün verisiyle doldur)
    df = df.ffill()

    # Altın gram = (Ons fiyatı / 31.1035) * USD kur
    df["altin_gram"] = (df["gold_oz"] / GRAMS_PER_OUNCE) * df["usd_kur"]
    df = df.drop(columns=["gold_oz"], errors="ignore")

    # NaN kalan satırları at
    df = df.dropna(subset=["usd_kur", "altin_gram"])

    rows = []
    for idx, row in df.iterrows():
        eur_val = row["eur_kur"]
        eur_final = round(float(eur_val), 4) if pd.notna(eur_val) and eur_val and eur_val != 0 else None
        rows.append({
            "tarih": idx.strftime("%Y-%m-%d"),
            "usd_kur": round(float(row["usd_kur"]), 4),
            "eur_kur": eur_final,
            "altin_gram": round(float(row["altin_gram"]), 2),
        })

    return rows


def upsert_to_supabase(rows: list[dict]) -> int:
    """Verileri piyasa_arsivi tablosuna upsert eder."""
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    if not rows:
        return 0

    try:
        result = supabase.table("piyasa_arsivi").upsert(
            rows,
            on_conflict="tarih",
            ignore_duplicates=False,
        ).execute()
        return len(result.data)
    except Exception as e:
        raise RuntimeError(f"Supabase upsert hatası: {e}") from e


def main() -> None:
    print("Piyasa verileri çekiliyor (2016-01-01 → bugün)...")
    rows = fetch_market_data()
    print(f"  → {len(rows)} günlük veri hazır.")

    print("Supabase'e yükleniyor...")
    count = upsert_to_supabase(rows)
    print(f"  → {count} satır veri eklendi/güncellendi.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"HATA: {e}")
        raise SystemExit(1)
