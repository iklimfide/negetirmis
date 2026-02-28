(function () {
  "use strict";

  const CEYREK_GRAM = 1.75;
  const CUMHURIYET_GRAM = 7.216;
  const STOPAJ = 0.15;

  let supabase;
  let piyasaCache = new Map();
  let faizCache = [];

  function formatMiktar(val) {
    const digits = String(val).replace(/\D/g, "");
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function parseMiktar(val) {
    const n = parseInt(String(val).replace(/\D/g, ""), 10);
    return isNaN(n) ? 1000000 : Math.max(0, n);
  }

  function init() {
    if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_ANON_KEY === "undefined") {
      console.error("config.js eksik. Önce: python generate_config.py");
      return;
    }
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const tarihEl = document.getElementById("tarih");
    const miktarEl = document.getElementById("miktar");
    const filterBtns = document.querySelectorAll(".filter-btn");

    setDefaultDate();

    miktarEl.addEventListener("input", function () {
      const raw = this.value.replace(/\D/g, "");
      this.value = formatMiktar(raw);
    });

    const refresh = () => {
      const tarih = tarihEl.value;
      const miktar = parseMiktar(miktarEl.value);
      if (!tarih) return;
      updateUI(tarih, miktar);
    };

    tarihEl.addEventListener("change", refresh);
    miktarEl.addEventListener("input", refresh);
    miktarEl.addEventListener("change", refresh);

    filterBtns.forEach((btn) => {
      btn.addEventListener("click", function () {
        filterBtns.forEach((b) => b.classList.remove("active"));
        this.classList.add("active");
        const years = parseInt(this.dataset.years || "1", 10);
        const d = new Date();
        d.setFullYear(d.getFullYear() - years);
        tarihEl.value = d.toISOString().slice(0, 10);
        refresh();
      });
    });

    refresh();
  }

  function setDefaultDate() {
    const tarihEl = document.getElementById("tarih");
    if (tarihEl && !tarihEl.value) {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      tarihEl.value = d.toISOString().slice(0, 10);
    }
  }

  function fmt(num, decimals) {
    if (num == null || isNaN(num)) return "—";
    return new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: decimals ?? 0,
      maximumFractionDigits: decimals ?? 0,
    }).format(num);
  }

  function fmtShort(num) {
    if (num == null || isNaN(num)) return "—";
    if (Math.abs(num) >= 1e6) return fmt(num / 1e6, 1) + "M";
    if (Math.abs(num) >= 1e3) return fmt(num / 1e3, 1) + "K";
    return fmt(num);
  }

  async function getPiyasaForDate(dateStr) {
    if (piyasaCache.has(dateStr)) return piyasaCache.get(dateStr);
    const { data, error } = await supabase
      .from("piyasa_arsivi")
      .select("tarih, usd_kur, eur_kur, altin_gram")
      .lte("tarih", dateStr)
      .order("tarih", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Piyasa verisi alınamadı: " + error.message);
    if (data) piyasaCache.set(dateStr, data);
    return data;
  }

  async function getPiyasaToday() {
    const today = new Date().toISOString().slice(0, 10);
    return getPiyasaForDate(today);
  }

  async function getFaizForPeriod(startDate, endDate) {
    const start = startDate.slice(0, 7) + "-01";
    const end = endDate.slice(0, 7) + "-01";
    if (faizCache.length === 0) {
      const { data, error } = await supabase
        .from("faiz_arsivi")
        .select("aylik_tarih, faiz_orani")
        .order("aylik_tarih", { ascending: true });
      if (error) throw new Error("Faiz verisi alınamadı: " + error.message);
      faizCache = data || [];
    }
    return faizCache.filter(
      (r) => r.aylik_tarih >= start && r.aylik_tarih <= end
    );
  }

  function compoundMevduat(principal, startDate, endDate, faizList) {
    let balance = principal;
    for (const r of faizList) {
      const monthlyRate = (r.faiz_orani || 0) / 12 / 100;
      balance *= 1 + monthlyRate;
    }
    const interest = balance - principal;
    const tax = interest * STOPAJ;
    return principal + interest - tax;
  }

  async function updateUI(tarih, miktar) {
    const el = (id) => document.getElementById(id);
    const set = (id, text) => {
      const e = el(id);
      if (e) e.textContent = text;
    };

    set("altin_deger", "…");
    set("usd_deger", "…");
    set("eur_deger", "…");
    set("mevduat_deger", "…");

    try {
      const [baslangic, bugun, faizList] = await Promise.all([
        getPiyasaForDate(tarih),
        getPiyasaToday(),
        getFaizForPeriod(tarih, new Date().toISOString().slice(0, 10)),
      ]);

      if (!baslangic) {
        set("altin_deger", "Veri yok");
        set("usd_deger", "Veri yok");
        set("eur_deger", "Veri yok");
        set("mevduat_deger", "Veri yok");
        return;
      }

      if (!bugun) {
        set("altin_deger", "Bugün verisi yok");
        set("usd_deger", "Bugün verisi yok");
        set("eur_deger", "Bugün verisi yok");
        set("mevduat_deger", "Bugün verisi yok");
        return;
      }

      const altinGramBaslangic = baslangic.altin_gram;
      const altinGramBugun = bugun.altin_gram;
      const usdBaslangic = baslangic.usd_kur;
      const usdBugun = bugun.usd_kur;
      const eurBaslangic = baslangic.eur_kur || usdBaslangic * 1.1;
      const eurBugun = bugun.eur_kur || usdBugun * 1.1;

      const gramMiktar = miktar / altinGramBaslangic;
      const altinDeger = gramMiktar * altinGramBugun;
      const ceyrekAdet = gramMiktar / CEYREK_GRAM;
      const cumhuriyetAdet = gramMiktar / CUMHURIYET_GRAM;

      const usdMiktar = miktar / usdBaslangic;
      const usdDeger = usdMiktar * usdBugun;

      const eurMiktar = miktar / eurBaslangic;
      const eurDeger = eurMiktar * eurBugun;

      const mevduatDeger = compoundMevduat(
        miktar,
        tarih,
        new Date().toISOString().slice(0, 10),
        faizList
      );

      const pct = (v) => ((v / miktar - 1) * 100).toFixed(1);
      const fark = (v) => "+" + fmtShort(v - miktar) + " TL";

      set("altin_deger", fmt(altinDeger, 0) + " TL");
      set("altin_degisim", "▲ %" + pct(altinDeger));
      set("altin_fark", "(" + fark(altinDeger) + ")");
      set("altin_ceyrek_adet", fmt(ceyrekAdet, 0) + " Adet");
      set("altin_cumhuriyet_adet", fmt(cumhuriyetAdet, 0) + " Adet");

      set("usd_deger", fmt(usdDeger, 0) + " TL");
      set("usd_degisim", "▲ %" + pct(usdDeger));
      set("usd_fark", "(" + fark(usdDeger) + ")");
      set("usd_alim", fmt(usdMiktar, 0) + " $");

      set("eur_deger", fmt(eurDeger, 0) + " TL");
      set("eur_degisim", "▲ %" + pct(eurDeger));
      set("eur_fark", "(" + fark(eurDeger) + ")");
      set("eur_alim", fmt(eurMiktar, 0) + " €");

      set("mevduat_deger", fmt(mevduatDeger, 0) + " TL");
      set("mevduat_degisim", "▲ %" + pct(mevduatDeger) + " (Net Getiri)");
      set("mevduat_alim", fmt(miktar, 0) + " TL");

      const degisimEls = ["altin_degisim", "usd_degisim", "eur_degisim", "mevduat_degisim"];
      degisimEls.forEach((id) => {
        const e = el(id);
        if (e) {
          e.classList.remove("text-emerald-600", "text-red-600");
          const pctVal = parseFloat(e.textContent.replace(/[^0-9.-]/g, "")) || 0;
          e.classList.add(pctVal >= 0 ? "text-emerald-600" : "text-red-600");
          if (pctVal < 0) e.textContent = e.textContent.replace("▲", "▼");
        }
      });
    } catch (err) {
      console.error(err);
      set("altin_deger", "Hata");
      set("usd_deger", "Hata");
      set("eur_deger", "Hata");
      set("mevduat_deger", "Hata");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
