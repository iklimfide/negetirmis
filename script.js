(function () {
  "use strict";

  const CEYREK_GRAM = 1.63;
  const CUMHURIYET_GRAM = 6.60;
  const STOPAJ = 0.15;

  let supabase;
  let piyasaCache = new Map();
  let faizCache = [];
  let growthChart = null;

  function formatMiktar(val) {
    const digits = String(val).replace(/\D/g, "");
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function parseMiktar(val) {
    const n = parseInt(String(val).replace(/\D/g, ""), 10);
    return isNaN(n) ? 1000000 : Math.max(0, n);
  }

  function init() {
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;
    if (!url || !key || url.includes("%%") || key.includes("%%")) {
      console.error("Supabase URL ve ANON_KEY tanımlı değil.");
      showError("Bağlantı yapılandırması eksik. Lütfen tekrar deneyin.");
      return;
    }
    supabase = window.supabase.createClient(url, key);

    const tarihEl = document.getElementById("tarih");
    const miktarEl = document.getElementById("miktar");
    const filterBtns = document.querySelectorAll(".filter-btn");

    applyUrlParams();
    setDefaultDate();

    miktarEl.addEventListener("input", function () {
      const raw = this.value.replace(/\D/g, "");
      this.value = formatMiktar(raw);
    });

    const refresh = () => {
      const tarih = tarihEl.value;
      const miktar = parseMiktar(miktarEl.value);
      if (!tarih) return;
      hideError();
      updateUI(tarih, miktar);
      updateBrowserUrl(miktar, tarih);
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

    setupShareCopy();
    setupTermsModal();
    refresh();
  }

  function setupTermsModal() {
    const link = document.getElementById("terms-link");
    const modal = document.getElementById("terms-modal");
    const overlay = document.getElementById("terms-overlay");
    const closeBtn = document.getElementById("terms-close");
    if (!link || !modal) return;
    const open = () => {
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    };
    const close = () => {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    };
    link.addEventListener("click", open);
    if (overlay) overlay.addEventListener("click", close);
    if (closeBtn) closeBtn.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.classList.contains("hidden")) close();
    });
  }

  function showError(msg) {
    const el = document.getElementById("hata-mesaji");
    if (el) {
      el.textContent = msg;
      el.classList.remove("hidden");
    }
  }

  function hideError() {
    const el = document.getElementById("hata-mesaji");
    if (el) el.classList.add("hidden");
  }

  function setDefaultDate() {
    const tarihEl = document.getElementById("tarih");
    if (tarihEl && !tarihEl.value) {
      tarihEl.value = "2016-01-01";
    }
  }

  function getUrlParams() {
    const p = new URLSearchParams(window.location.search);
    return {
      tutar: p.get("tutar"),
      tarih: p.get("tarih"),
    };
  }

  function applyUrlParams() {
    const { tutar, tarih } = getUrlParams();
    const miktarEl = document.getElementById("miktar");
    const tarihEl = document.getElementById("tarih");
    if (!miktarEl || !tarihEl) return false;
    let applied = false;
    if (tutar) {
      const n = parseInt(String(tutar).replace(/\D/g, ""), 10);
      if (!isNaN(n) && n > 0) {
        miktarEl.value = formatMiktar(n);
        applied = true;
      }
    }
    if (tarih) {
      const d = tarih.match(/^\d{4}-\d{2}-\d{2}$/);
      if (d) {
        tarihEl.value = tarih;
        applied = true;
      }
    }
    if (!applied) {
      miktarEl.value = formatMiktar(1000000);
      tarihEl.value = "2016-01-01";
    }
    return applied;
  }

  function getShareableUrl(miktar, tarih) {
    const base = typeof window !== "undefined" ? window.location.origin : "https://negetirmis.com";
    return `${base}/?tutar=${miktar}&tarih=${tarih}`;
  }

  function updateBrowserUrl(miktar, tarih) {
    const url = getShareableUrl(miktar, tarih);
    window.history.replaceState(null, "", url);
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

  function formatMiktarForShare(miktar) {
    if (miktar >= 1e6) {
      const m = miktar / 1e6;
      return (m % 1 === 0 ? m : m.toFixed(1)) + " Milyon";
    }
    return fmt(miktar, 0);
  }

  function generateShareText() {
    const miktarEl = document.getElementById("miktar");
    const tarihEl = document.getElementById("tarih");
    const miktar = miktarEl ? parseMiktar(miktarEl.value) : 1000000;
    const tarih = tarihEl ? tarihEl.value : "2016-01-01";
    const miktarStr = formatMiktarForShare(miktar);
    const link = getShareableUrl(miktar, tarih);
    return `${tarih} tarihinde ${miktarStr} TL ne getirmiş bak: ${link}`;
  }

  function updateShareButtons() {
    const text = generateShareText();
    const encoded = encodeURIComponent(text);
    const waEl = document.getElementById("share-whatsapp");
    const twEl = document.getElementById("share-twitter");
    if (waEl) waEl.href = "https://wa.me/?text=" + encoded;
    if (twEl) twEl.href = "https://twitter.com/intent/tweet?text=" + encoded;
  }

  function setupShareCopy() {
    const btn = document.getElementById("share-copy");
    const lbl = document.getElementById("share-copy-text");
    if (!btn || !lbl) return;
    btn.addEventListener("click", async () => {
      const text = generateShareText();
      try {
        await navigator.clipboard.writeText(text);
        const orig = lbl.textContent;
        lbl.textContent = "Link Kopyalandı!";
        setTimeout(() => { lbl.textContent = orig; }, 2000);
      } catch (_) {
        lbl.textContent = "Kopyalanamadı";
        setTimeout(() => { lbl.textContent = "Bağlantıyı Kopyala"; }, 2000);
      }
    });
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

  async function getPiyasaRange(startDate, endDate) {
    const { data, error } = await supabase
      .from("piyasa_arsivi")
      .select("tarih, usd_kur, eur_kur, altin_gram")
      .gte("tarih", startDate)
      .lte("tarih", endDate)
      .order("tarih", { ascending: true });
    if (error) throw new Error("Piyasa verisi alınamadı: " + error.message);
    return data || [];
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

  function compoundMevduat(principal, faizList) {
    let balance = principal;
    for (const r of faizList) {
      const monthlyRate = (r.faiz_orani || 0) / 12 / 100;
      balance *= 1 + monthlyRate;
    }
    const interest = balance - principal;
    const tax = interest * STOPAJ;
    return principal + interest - tax;
  }

  function sampleEveryN(arr, n) {
    if (!arr || arr.length === 0) return [];
    if (arr.length <= n) return arr;
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr[i]);
    if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
    return out;
  }

  function drawChart(labels, altinData, usdData, eurData, mevduatData, miktar) {
    const ctx = document.getElementById("growthChart");
    if (!ctx) return;

    if (growthChart) growthChart.destroy();

    const base = miktar;
    const altinNorm = altinData.map((v) => (v / base) * 100);
    const usdNorm = usdData.map((v) => (v / base) * 100);
    const eurNorm = eurData.map((v) => (v / base) * 100);
    const mevduatNorm = mevduatData.map((v) => (v / base) * 100);

    growthChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Gram Altın",
            data: altinNorm,
            borderColor: "#eab308",
            backgroundColor: "rgba(234, 179, 8, 0.1)",
            fill: true,
            tension: 0.3,
          },
          {
            label: "Dolar",
            data: usdNorm,
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59, 130, 246, 0.15)",
            fill: true,
            tension: 0.3,
          },
          {
            label: "Euro",
            data: eurNorm,
            borderColor: "#6366f1",
            backgroundColor: "rgba(99, 102, 241, 0.1)",
            fill: true,
            tension: 0.3,
          },
          {
            label: "Mevduat",
            data: mevduatNorm,
            borderColor: "#ef4444",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" },
        },
        scales: {
          y: {
            beginAtZero: false,
            title: { display: true, text: "Değer (% başlangıç)" },
            ticks: {
              callback: (v) => v + "%",
            },
          },
          x: {
            title: { display: true, text: "Tarih" },
            ticks: { maxTicksLimit: 10 },
          },
        },
      },
    });
  }

  async function buildChartData(tarih, miktar, baslangic, bugun) {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await getPiyasaRange(tarih, today);
    if (!rows || rows.length < 2) return;

    const sampled = sampleEveryN(rows, 7);
    const labels = sampled.map((r) => r.tarih);
    const altinGramBaslangic = baslangic.altin_gram;
    const usdBaslangic = baslangic.usd_kur;
    const eurBaslangic = baslangic.eur_kur || usdBaslangic * 1.1;

    const gramMiktar = miktar / altinGramBaslangic;
    const usdMiktar = miktar / usdBaslangic;
    const eurMiktar = miktar / eurBaslangic;

    const altinData = sampled.map((r) => gramMiktar * r.altin_gram);
    const usdData = sampled.map((r) => usdMiktar * r.usd_kur);
    const eurData = sampled.map((r) => eurMiktar * (r.eur_kur || r.usd_kur * 1.1));

    const faizList = await getFaizForPeriod(tarih, today);
    const mevduatData = [];
    for (const r of sampled) {
      const monthKey = r.tarih.slice(0, 7) + "-01";
      const faizRows = faizList.filter((f) => f.aylik_tarih <= monthKey);
      const balance = compoundMevduat(miktar, faizRows);
      mevduatData.push(balance);
    }

    drawChart(labels, altinData, usdData, eurData, mevduatData, miktar);
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

      if (!baslangic || !bugun) {
        showError("Bu tarih için veri henüz yüklenmedi.");
        set("altin_deger", "—");
        set("usd_deger", "—");
        set("eur_deger", "—");
        set("mevduat_deger", "—");
        if (growthChart) {
          growthChart.destroy();
          growthChart = null;
        }
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

      const mevduatDeger = compoundMevduat(miktar, faizList);

      const pct = (v) => ((v / miktar - 1) * 100).toFixed(1);
      const fark = (v) => "+" + fmtShort(v - miktar) + " TL";

      set("altin_deger", fmt(altinDeger, 0) + " TL");
      set("altin_degisim", "▲ %" + pct(altinDeger));
      set("altin_fark", "(" + fark(altinDeger) + ")");
      set("altin_gram", fmt(gramMiktar, 2));
      set("altin_ceyrek_adet", fmt(ceyrekAdet, 0));
      set("altin_cumhuriyet_adet", fmt(cumhuriyetAdet, 0));
      set("altin_gunluk_fiyat", fmt(altinGramBaslangic, 2));

      set("usd_deger", fmt(usdDeger, 0) + " TL");
      set("usd_degisim", "▲ %" + pct(usdDeger));
      set("usd_fark", "(" + fark(usdDeger) + ")");
      set("usd_alim", fmt(usdMiktar, 0));
      set("usd_gunluk_kur", fmt(usdBaslangic, 2));

      set("eur_deger", fmt(eurDeger, 0) + " TL");
      set("eur_degisim", "▲ %" + pct(eurDeger));
      set("eur_fark", "(" + fark(eurDeger) + ")");
      set("eur_alim", fmt(eurMiktar, 0));
      set("eur_gunluk_kur", fmt(eurBaslangic, 2));

      set("mevduat_deger", fmt(mevduatDeger, 0) + " TL");
      set("mevduat_degisim", "▲ %" + pct(mevduatDeger) + " (Net Getiri)");
      set("mevduat_alim", fmt(miktar, 0));
      set("mevduat_gunluk_faiz", faizList.length ? fmt(faizList[0].faiz_orani, 2) : "—");

      updateShareButtons();

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

      await buildChartData(tarih, miktar, baslangic, bugun);
    } catch (err) {
      console.error(err);
      showError("Veri yüklenirken bir hata oluştu. Lütfen tekrar deneyin.");
      set("altin_deger", "—");
      set("usd_deger", "—");
      set("eur_deger", "—");
      set("mevduat_deger", "—");
      if (growthChart) {
        growthChart.destroy();
        growthChart = null;
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
