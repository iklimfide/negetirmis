"""
Türkiye ortalama mevduat faiz oranlarını (TCMB ağırlıklı ortalamaya yakın tahmini)
faiz_arsivi tablosuna yükler. 2016-01 → 2026-02.
"""

import os

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY .env.local'da tanımlı olmalı.")

# TCMB mevduat faiz geçmişine yakın tahmini aylık oranlar (% yıllık)
# Kaynak: TCMB politika faizi ve piyasa ortalamaları esas alınmıştır
FAIZ_VERISI: list[dict] = [
    # 2016 - Düşük/orta (politika ~7.25-7.5%)
    {"aylik_tarih": "2016-01-01", "faiz_orani": 7.25},
    {"aylik_tarih": "2016-02-01", "faiz_orani": 7.25},
    {"aylik_tarih": "2016-03-01", "faiz_orani": 7.50},
    {"aylik_tarih": "2016-04-01", "faiz_orani": 7.50},
    {"aylik_tarih": "2016-05-01", "faiz_orani": 7.25},
    {"aylik_tarih": "2016-06-01", "faiz_orani": 7.25},
    {"aylik_tarih": "2016-07-01", "faiz_orani": 7.50},
    {"aylik_tarih": "2016-08-01", "faiz_orani": 7.50},
    {"aylik_tarih": "2016-09-01", "faiz_orani": 7.50},
    {"aylik_tarih": "2016-10-01", "faiz_orani": 7.50},
    {"aylik_tarih": "2016-11-01", "faiz_orani": 7.50},
    {"aylik_tarih": "2016-12-01", "faiz_orani": 7.50},
    # 2017 - Orta seviye (indirimler)
    {"aylik_tarih": "2017-01-01", "faiz_orani": 8.00},
    {"aylik_tarih": "2017-02-01", "faiz_orani": 8.00},
    {"aylik_tarih": "2017-03-01", "faiz_orani": 8.50},
    {"aylik_tarih": "2017-04-01", "faiz_orani": 9.00},
    {"aylik_tarih": "2017-05-01", "faiz_orani": 9.00},
    {"aylik_tarih": "2017-06-01", "faiz_orani": 8.00},
    {"aylik_tarih": "2017-07-01", "faiz_orani": 8.00},
    {"aylik_tarih": "2017-08-01", "faiz_orani": 8.00},
    {"aylik_tarih": "2017-09-01", "faiz_orani": 8.00},
    {"aylik_tarih": "2017-10-01", "faiz_orani": 8.00},
    {"aylik_tarih": "2017-11-01", "faiz_orani": 8.25},
    {"aylik_tarih": "2017-12-01", "faiz_orani": 8.00},
    # 2018 - Dalgalı, Ağustos krizinde sıçrama
    {"aylik_tarih": "2018-01-01", "faiz_orani": 8.00},
    {"aylik_tarih": "2018-02-01", "faiz_orani": 8.00},
    {"aylik_tarih": "2018-03-01", "faiz_orani": 8.00},
    {"aylik_tarih": "2018-04-01", "faiz_orani": 8.00},
    {"aylik_tarih": "2018-05-01", "faiz_orani": 8.00},
    {"aylik_tarih": "2018-06-01", "faiz_orani": 8.00},
    {"aylik_tarih": "2018-07-01", "faiz_orani": 8.00},
    {"aylik_tarih": "2018-08-01", "faiz_orani": 22.00},
    {"aylik_tarih": "2018-09-01", "faiz_orani": 24.00},
    {"aylik_tarih": "2018-10-01", "faiz_orani": 24.00},
    {"aylik_tarih": "2018-11-01", "faiz_orani": 24.00},
    {"aylik_tarih": "2018-12-01", "faiz_orani": 24.00},
    # 2019 - Düşüş trendi
    {"aylik_tarih": "2019-01-01", "faiz_orani": 24.00},
    {"aylik_tarih": "2019-02-01", "faiz_orani": 24.00},
    {"aylik_tarih": "2019-03-01", "faiz_orani": 24.00},
    {"aylik_tarih": "2019-04-01", "faiz_orani": 24.00},
    {"aylik_tarih": "2019-05-01", "faiz_orani": 24.00},
    {"aylik_tarih": "2019-06-01", "faiz_orani": 24.00},
    {"aylik_tarih": "2019-07-01", "faiz_orani": 23.50},
    {"aylik_tarih": "2019-08-01", "faiz_orani": 19.75},
    {"aylik_tarih": "2019-09-01", "faiz_orani": 16.50},
    {"aylik_tarih": "2019-10-01", "faiz_orani": 14.00},
    {"aylik_tarih": "2019-11-01", "faiz_orani": 14.00},
    {"aylik_tarih": "2019-12-01", "faiz_orani": 12.00},
    # 2020 - COVID dönemi, agresif indirim
    {"aylik_tarih": "2020-01-01", "faiz_orani": 12.00},
    {"aylik_tarih": "2020-02-01", "faiz_orani": 10.75},
    {"aylik_tarih": "2020-03-01", "faiz_orani": 9.75},
    {"aylik_tarih": "2020-04-01", "faiz_orani": 8.75},
    {"aylik_tarih": "2020-05-01", "faiz_orani": 8.25},
    {"aylik_tarih": "2020-06-01", "faiz_orani": 8.25},
    {"aylik_tarih": "2020-07-01", "faiz_orani": 8.25},
    {"aylik_tarih": "2020-08-01", "faiz_orani": 8.25},
    {"aylik_tarih": "2020-09-01", "faiz_orani": 8.25},
    {"aylik_tarih": "2020-10-01", "faiz_orani": 8.25},
    {"aylik_tarih": "2020-11-01", "faiz_orani": 8.25},
    {"aylik_tarih": "2020-12-01", "faiz_orani": 8.25},
    # 2021 - Dalgalı, artış başlangıcı
    {"aylik_tarih": "2021-01-01", "faiz_orani": 8.25},
    {"aylik_tarih": "2021-02-01", "faiz_orani": 8.25},
    {"aylik_tarih": "2021-03-01", "faiz_orani": 8.25},
    {"aylik_tarih": "2021-04-01", "faiz_orani": 8.25},
    {"aylik_tarih": "2021-05-01", "faiz_orani": 8.25},
    {"aylik_tarih": "2021-06-01", "faiz_orani": 8.25},
    {"aylik_tarih": "2021-07-01", "faiz_orani": 8.25},
    {"aylik_tarih": "2021-08-01", "faiz_orani": 8.25},
    {"aylik_tarih": "2021-09-01", "faiz_orani": 9.00},
    {"aylik_tarih": "2021-10-01", "faiz_orani": 10.50},
    {"aylik_tarih": "2021-11-01", "faiz_orani": 12.00},
    {"aylik_tarih": "2021-12-01", "faiz_orani": 14.00},
    # 2022 - Yükseliş devam
    {"aylik_tarih": "2022-01-01", "faiz_orani": 14.00},
    {"aylik_tarih": "2022-02-01", "faiz_orani": 14.00},
    {"aylik_tarih": "2022-03-01", "faiz_orani": 14.00},
    {"aylik_tarih": "2022-04-01", "faiz_orani": 14.00},
    {"aylik_tarih": "2022-05-01", "faiz_orani": 14.00},
    {"aylik_tarih": "2022-06-01", "faiz_orani": 14.00},
    {"aylik_tarih": "2022-07-01", "faiz_orani": 14.00},
    {"aylik_tarih": "2022-08-01", "faiz_orani": 13.00},
    {"aylik_tarih": "2022-09-01", "faiz_orani": 12.00},
    {"aylik_tarih": "2022-10-01", "faiz_orani": 10.50},
    {"aylik_tarih": "2022-11-01", "faiz_orani": 9.00},
    {"aylik_tarih": "2022-12-01", "faiz_orani": 9.00},
    # 2023 - Sert artış, yüksek seviyeler
    {"aylik_tarih": "2023-01-01", "faiz_orani": 9.00},
    {"aylik_tarih": "2023-02-01", "faiz_orani": 9.00},
    {"aylik_tarih": "2023-03-01", "faiz_orani": 9.00},
    {"aylik_tarih": "2023-04-01", "faiz_orani": 9.00},
    {"aylik_tarih": "2023-05-01", "faiz_orani": 8.50},
    {"aylik_tarih": "2023-06-01", "faiz_orani": 15.00},
    {"aylik_tarih": "2023-07-01", "faiz_orani": 17.50},
    {"aylik_tarih": "2023-08-01", "faiz_orani": 25.00},
    {"aylik_tarih": "2023-09-01", "faiz_orani": 30.00},
    {"aylik_tarih": "2023-10-01", "faiz_orani": 35.00},
    {"aylik_tarih": "2023-11-01", "faiz_orani": 40.00},
    {"aylik_tarih": "2023-12-01", "faiz_orani": 42.50},
    # 2024 - Yüksek seviyede
    {"aylik_tarih": "2024-01-01", "faiz_orani": 45.00},
    {"aylik_tarih": "2024-02-01", "faiz_orani": 45.00},
    {"aylik_tarih": "2024-03-01", "faiz_orani": 50.00},
    {"aylik_tarih": "2024-04-01", "faiz_orani": 50.00},
    {"aylik_tarih": "2024-05-01", "faiz_orani": 50.00},
    {"aylik_tarih": "2024-06-01", "faiz_orani": 50.00},
    {"aylik_tarih": "2024-07-01", "faiz_orani": 50.00},
    {"aylik_tarih": "2024-08-01", "faiz_orani": 50.00},
    {"aylik_tarih": "2024-09-01", "faiz_orani": 50.00},
    {"aylik_tarih": "2024-10-01", "faiz_orani": 50.00},
    {"aylik_tarih": "2024-11-01", "faiz_orani": 50.00},
    {"aylik_tarih": "2024-12-01", "faiz_orani": 50.00},
    # 2025 - Yüksek seviyede devam
    {"aylik_tarih": "2025-01-01", "faiz_orani": 45.00},
    {"aylik_tarih": "2025-02-01", "faiz_orani": 45.00},
    {"aylik_tarih": "2025-03-01", "faiz_orani": 45.00},
    {"aylik_tarih": "2025-04-01", "faiz_orani": 45.00},
    {"aylik_tarih": "2025-05-01", "faiz_orani": 45.00},
    {"aylik_tarih": "2025-06-01", "faiz_orani": 45.00},
    {"aylik_tarih": "2025-07-01", "faiz_orani": 45.00},
    {"aylik_tarih": "2025-08-01", "faiz_orani": 45.00},
    {"aylik_tarih": "2025-09-01", "faiz_orani": 45.00},
    {"aylik_tarih": "2025-10-01", "faiz_orani": 45.00},
    {"aylik_tarih": "2025-11-01", "faiz_orani": 45.00},
    {"aylik_tarih": "2025-12-01", "faiz_orani": 45.00},
    # 2026 - Tahmini
    {"aylik_tarih": "2026-01-01", "faiz_orani": 45.00},
    {"aylik_tarih": "2026-02-01", "faiz_orani": 45.00},
]


def upsert_to_supabase(rows: list[dict]) -> int:
    """Verileri faiz_arsivi tablosuna upsert eder."""
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    if not rows:
        return 0

    try:
        result = supabase.table("faiz_arsivi").upsert(
            rows,
            on_conflict="aylik_tarih",
            ignore_duplicates=False,
        ).execute()
        return len(result.data)
    except Exception as e:
        raise RuntimeError(f"Supabase upsert hatası: {e}") from e


def main() -> None:
    print("Faiz verileri yükleniyor (2016-01 → 2026-02)...")
    count = upsert_to_supabase(FAIZ_VERISI)
    print(f"  → {count} satır veri eklendi/güncellendi.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"HATA: {e}")
        raise SystemExit(1)
