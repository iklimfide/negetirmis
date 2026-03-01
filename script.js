(function () {
  "use strict";

  const CEYREK_GRAM = 1.63;
  const CUMHURIYET_GRAM = 6.60;
  const STOPAJ = 0.15;

  let supabase;
  let piyasaCache = new Map();
  let faizCache = [];
  let growthChart = null;
  let lastShareResult = null;
  let lastPortfolioTotal = null;
  let lastPortfolioUrl = null;
  let lastInvestmentValues = {};
  let syncTarihToMobileSelects = function () {};

  function recordRefVisit() {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (!ref || !supabase) return;
      supabase.from("ziyaretler").insert({ ref }).then(() => {}).catch(() => {});
    } catch (_) {}
  }

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

    recordRefVisit();

    const tarihEl = document.getElementById("tarih");
    const miktarEl = document.getElementById("miktar");
    const filterBtns = document.querySelectorAll(".filter-btn");

    applyUrlParams();
    setDefaultDate();
    setDateInputBounds();
    setupMobileDateSelects();

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
        filterBtns.forEach((b) => b.classList.remove("filter-selected"));
        this.classList.add("filter-selected");
        const years = parseInt(this.dataset.years || "1", 10);
        const d = new Date();
        d.setFullYear(d.getFullYear() - years);
        tarihEl.value = d.toISOString().slice(0, 10);
        syncTarihToMobileSelects();
        refresh();
      });
    });

    setupShareCopy();
    setupCardShareButtons();
    setupPortfolio();
    setupPortfolioShare();
    applyPortfolioUrlParams();
    refresh();
  }

  function parsePortfolioNum(val) {
    const n = parseFloat(String(val).replace(/\D/g, "")) || 0;
    return Math.max(0, n);
  }

  function applyPortfolioUrlParams() {
    const p = new URLSearchParams(window.location.search);
    const defDate = getDefaultDate();
    const ids = ["Gold", "GramAltin", "Usd", "Eur", "Cash"];
    const keys = ["altin", "gramaltin", "dolar", "eur", "nakit"];
    const amountIds = ["Gold", "GramAltin", "Usd", "Eur", "Cash"];
    ids.forEach((id, i) => {
      const dateEl = document.getElementById("portfolio" + id + "Date");
      const amountEl = document.getElementById("portfolio" + amountIds[i]);
      if (!dateEl || !amountEl) return;
      const t = p.get("portfolio_" + keys[i] + "_tarih") || p.get(keys[i] + "_tarih");
      const v = p.get("portfolio_" + keys[i]) || p.get(keys[i]);
      if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) dateEl.value = t < "2006-01-01" ? "2006-01-01" : t;
      else if (!dateEl.value) dateEl.value = defDate;
      if (v && !isNaN(parseFloat(v))) {
        if (id === "Cash") amountEl.value = formatMiktar(parseInt(String(v).replace(/\D/g, ""), 10) || 0);
        else amountEl.value = Math.max(0, parseFloat(v));
      }
    });
    calculatePortfolio();
  }

  function setupPortfolio() {
    const ids = ["Gold", "GramAltin", "Usd", "Eur", "Cash"];
    const amountIds = ["Gold", "GramAltin", "Usd", "Eur", "Cash"];
    const defDate = getDefaultDate();
    ids.forEach((id, i) => {
      const dateEl = document.getElementById("portfolio" + id + "Date");
      const amountEl = document.getElementById("portfolio" + amountIds[i]);
      if (dateEl && !dateEl.value) dateEl.value = defDate;
      if (amountEl) {
        if (id === "Cash") {
          amountEl.addEventListener("input", function () {
            this.value = formatMiktar(this.value.replace(/\D/g, ""));
          });
        }
        const trigger = () => calculatePortfolio();
        amountEl.addEventListener("input", trigger);
        amountEl.addEventListener("change", trigger);
      }
      if (dateEl) {
        dateEl.addEventListener("change", () => calculatePortfolio());
      }
    });
    calculatePortfolio();
  }

  async function calculatePortfolio() {
    const today = new Date().toISOString().slice(0, 10);
    const goldDate = document.getElementById("portfolioGoldDate")?.value;
    const goldAmt = parsePortfolioNum(document.getElementById("portfolioGold")?.value);
    const gramAltinDate = document.getElementById("portfolioGramAltinDate")?.value;
    const gramAltinAmt = parseFloat(document.getElementById("portfolioGramAltin")?.value) || 0;
    const usdDate = document.getElementById("portfolioUsdDate")?.value;
    const usdAmt = parsePortfolioNum(document.getElementById("portfolioUsd")?.value);
    const eurDate = document.getElementById("portfolioEurDate")?.value;
    const eurAmt = parsePortfolioNum(document.getElementById("portfolioEur")?.value);
    const cashDate = document.getElementById("portfolioCashDate")?.value;
    const cashAmt = parsePortfolioNum(document.getElementById("portfolioCash")?.value);

    const set = (id, text) => { const e = document.getElementById(id); if (e) e.textContent = text; };
    const allIds = ["portfolioGoldCost", "portfolioGoldValue", "portfolioGoldReturn", "portfolioGramAltinCost", "portfolioGramAltinValue", "portfolioGramAltinReturn", "portfolioUsdCost", "portfolioUsdValue", "portfolioUsdReturn", "portfolioEurCost", "portfolioEurValue", "portfolioEurReturn", "portfolioCashCost", "portfolioCashValue", "portfolioCashReturn", "portfolioTotalCost", "portfolioTotal", "portfolioTotalReturn"];
    allIds.forEach((id) => set(id, "…"));

    const dates = [goldDate, gramAltinDate, usdDate, eurDate, cashDate].filter(Boolean);
    const amounts = [goldAmt, gramAltinAmt, usdAmt, eurAmt, cashAmt];
    if (dates.length === 0 || amounts.every((a) => a === 0)) {
      allIds.forEach((id) => set(id, "—"));
      lastPortfolioTotal = null;
      lastPortfolioUrl = null;
      const shareBtn = document.getElementById("share-portfolio");
      if (shareBtn) shareBtn.disabled = true;
      return;
    }

    try {
      const bugun = await getPiyasaToday();
      if (!bugun) {
        allIds.forEach((id) => set(id, "—"));
        lastPortfolioTotal = null;
        const shareBtn = document.getElementById("share-portfolio");
        if (shareBtn) shareBtn.disabled = true;
        return;
      }
      const altinGramBugun = bugun.altin_gram;
      const usdBugun = bugun.usd_kur;
      const eurBugun = bugun.eur_kur || usdBugun * 1.1;

      let toplamDeger = 0;
      let toplamMaliyet = 0;

      if (goldAmt > 0 && goldDate) {
        const basla = await getPiyasaForDate(goldDate);
        if (basla) {
          if (basla.tarih !== goldDate) {
            const goldDateEl = document.getElementById("portfolioGoldDate");
            if (goldDateEl) goldDateEl.value = basla.tarih;
          }
          const eski = goldAmt * CUMHURIYET_GRAM * basla.altin_gram;
          const deger = goldAmt * CUMHURIYET_GRAM * altinGramBugun;
          const fark = deger - eski;
          set("portfolioGoldCost", fmt(eski, 0) + " TL");
          set("portfolioGoldValue", fmt(deger, 0) + " TL");
          set("portfolioGoldReturn", (fark >= 0 ? "+" : "") + fmt(fark, 0) + " TL");
          toplamDeger += deger;
          toplamMaliyet += eski;
        } else {
          set("portfolioGoldCost", "—");
          set("portfolioGoldValue", "—");
          set("portfolioGoldReturn", "—");
        }
      } else {
        set("portfolioGoldCost", "—");
        set("portfolioGoldValue", "—");
        set("portfolioGoldReturn", "—");
      }

      if (gramAltinAmt > 0 && gramAltinDate) {
        const basla = await getPiyasaForDate(gramAltinDate);
        if (basla) {
          if (basla.tarih !== gramAltinDate) {
            const gramAltinDateEl = document.getElementById("portfolioGramAltinDate");
            if (gramAltinDateEl) gramAltinDateEl.value = basla.tarih;
          }
          const eski = gramAltinAmt * basla.altin_gram;
          const deger = gramAltinAmt * altinGramBugun;
          const fark = deger - eski;
          set("portfolioGramAltinCost", fmt(eski, 0) + " TL");
          set("portfolioGramAltinValue", fmt(deger, 0) + " TL");
          set("portfolioGramAltinReturn", (fark >= 0 ? "+" : "") + fmt(fark, 0) + " TL");
          toplamDeger += deger;
          toplamMaliyet += eski;
        } else {
          set("portfolioGramAltinCost", "—");
          set("portfolioGramAltinValue", "—");
          set("portfolioGramAltinReturn", "—");
        }
      } else {
        set("portfolioGramAltinCost", "—");
        set("portfolioGramAltinValue", "—");
        set("portfolioGramAltinReturn", "—");
      }

      if (usdAmt > 0 && usdDate) {
        const basla = await getPiyasaForDate(usdDate);
        if (basla) {
          if (basla.tarih !== usdDate) {
            const usdDateEl = document.getElementById("portfolioUsdDate");
            if (usdDateEl) usdDateEl.value = basla.tarih;
          }
          const eski = usdAmt * basla.usd_kur;
          const deger = usdAmt * usdBugun;
          const fark = deger - eski;
          set("portfolioUsdCost", fmt(eski, 0) + " TL");
          set("portfolioUsdValue", fmt(deger, 0) + " TL");
          set("portfolioUsdReturn", (fark >= 0 ? "+" : "") + fmt(fark, 0) + " TL");
          toplamDeger += deger;
          toplamMaliyet += eski;
        } else {
          set("portfolioUsdCost", "—");
          set("portfolioUsdValue", "—");
          set("portfolioUsdReturn", "—");
        }
      } else {
        set("portfolioUsdCost", "—");
        set("portfolioUsdValue", "—");
        set("portfolioUsdReturn", "—");
      }

      if (eurAmt > 0 && eurDate) {
        const basla = await getPiyasaForDate(eurDate);
        if (basla) {
          if (basla.tarih !== eurDate) {
            const eurDateEl = document.getElementById("portfolioEurDate");
            if (eurDateEl) eurDateEl.value = basla.tarih;
          }
          const eurEski = basla.eur_kur || basla.usd_kur * 1.1;
          const eski = eurAmt * eurEski;
          const deger = eurAmt * eurBugun;
          const fark = deger - eski;
          set("portfolioEurCost", fmt(eski, 0) + " TL");
          set("portfolioEurValue", fmt(deger, 0) + " TL");
          set("portfolioEurReturn", (fark >= 0 ? "+" : "") + fmt(fark, 0) + " TL");
          toplamDeger += deger;
          toplamMaliyet += eski;
        } else {
          set("portfolioEurCost", "—");
          set("portfolioEurValue", "—");
          set("portfolioEurReturn", "—");
        }
      } else {
        set("portfolioEurCost", "—");
        set("portfolioEurValue", "—");
        set("portfolioEurReturn", "—");
      }

      if (cashAmt > 0 && cashDate) {
        const faizList = await getFaizForPeriod(cashDate, today);
        const eski = cashAmt;
        const deger = compoundMevduat(cashAmt, faizList);
        const fark = deger - eski;
        set("portfolioCashCost", fmt(eski, 0) + " TL");
        set("portfolioCashValue", fmt(deger, 0) + " TL");
        set("portfolioCashReturn", (fark >= 0 ? "+" : "") + fmt(fark, 0) + " TL");
        toplamDeger += deger;
        toplamMaliyet += eski;
      } else {
        set("portfolioCashCost", "—");
        set("portfolioCashValue", "—");
        set("portfolioCashReturn", "—");
      }

      const toplamFark = toplamDeger - toplamMaliyet;
      set("portfolioTotalCost", fmt(toplamMaliyet, 0) + " TL");
      set("portfolioTotal", fmt(toplamDeger, 0) + " TL");
      set("portfolioTotalReturn", (toplamFark >= 0 ? "+" : "") + fmt(toplamFark, 0) + " TL");
      lastPortfolioTotal = toplamDeger;
      lastPortfolioUrl = getPortfolioShareableUrl();
      const shareBtn = document.getElementById("share-portfolio");
      if (shareBtn) shareBtn.disabled = false;
    } catch (err) {
      console.error("Portföy hesaplama hatası:", err);
      allIds.forEach((id) => set(id, "—"));
    }
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

  function getDefaultDate() {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 5);
    return d.toISOString().slice(0, 10);
  }

  function setDefaultDate() {
    const tarihEl = document.getElementById("tarih");
    if (tarihEl && !tarihEl.value) {
      tarihEl.value = getDefaultDate();
    }
  }

  function setDateInputBounds() {
    const today = new Date().toISOString().slice(0, 10);
    const ids = ["tarih", "portfolioGoldDate", "portfolioGramAltinDate", "portfolioUsdDate", "portfolioEurDate", "portfolioCashDate"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.setAttribute("min", "2006-01-01");
        el.setAttribute("max", today);
      }
    });
  }

  function setupMobileDateSelects() {
    const tarihEl = document.getElementById("tarih");
    const gunEl = document.getElementById("tarih-gun");
    const ayEl = document.getElementById("tarih-ay");
    const yilEl = document.getElementById("tarih-yil");
    if (!tarihEl || !gunEl || !ayEl || !yilEl) return;

    const AYLAR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
    const today = new Date();
    const maxYil = today.getFullYear();
    const minYil = 2006;

    const selects = { gun: gunEl, ay: ayEl, yil: yilEl };
    const dropdowns = document.querySelectorAll(".custom-tarih-dropdown");

    function buildOptions(part) {
      const opts = [];
      if (part === "gun") {
        for (let d = 1; d <= 31; d++) {
          opts.push({ value: String(d).padStart(2, "0"), label: String(d) });
        }
      } else if (part === "ay") {
        AYLAR.forEach((ay, i) => {
          opts.push({ value: String(i + 1).padStart(2, "0"), label: ay });
        });
      } else if (part === "yil") {
        for (let y = maxYil; y >= minYil; y--) {
          opts.push({ value: String(y), label: String(y) });
        }
      }
      return opts;
    }

    dropdowns.forEach((dd) => {
      const part = dd.dataset.tarihPart;
      const sel = selects[part];
      const triggerBtn = dd.querySelector(".custom-tarih-trigger");
      const triggerSpan = dd.querySelector(".custom-tarih-trigger .custom-tarih-value");
      const panel = dd.querySelector(".custom-tarih-panel");

      const opts = buildOptions(part);
      opts.forEach((o) => {
        const opt = document.createElement("option");
        opt.value = o.value;
        opt.textContent = o.label;
        sel.appendChild(opt);
      });

      opts.forEach((o) => {
        const div = document.createElement("div");
        div.className = "custom-tarih-option";
        div.setAttribute("role", "option");
        div.dataset.value = o.value;
        div.textContent = o.label;
        div.addEventListener("click", () => {
          sel.value = o.value;
          triggerSpan.textContent = o.label;
          panel.querySelectorAll(".custom-tarih-option").forEach((opt) => opt.classList.toggle("selected", opt.dataset.value === o.value));
          panel.classList.remove("open");
          syncSelectsToTarih();
        });
        panel.appendChild(div);
      });

      triggerBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll(".custom-tarih-panel.open").forEach((p) => p.classList.remove("open"));
        panel.classList.toggle("open");
        if (panel.classList.contains("open")) {
          panel.querySelectorAll(".custom-tarih-option").forEach((opt) => opt.classList.toggle("selected", opt.dataset.value === sel.value));
          const selOpt = panel.querySelector(".custom-tarih-option[data-value='" + sel.value + "']");
          if (selOpt) selOpt.scrollIntoView({ block: "nearest", behavior: "auto" });
        }
      });
    });

    document.addEventListener("click", () => {
      document.querySelectorAll(".custom-tarih-panel.open").forEach((p) => p.classList.remove("open"));
    });
    document.querySelectorAll(".custom-tarih-dropdown").forEach((dd) => {
      dd.addEventListener("click", (e) => e.stopPropagation());
    });

    syncTarihToMobileSelects = function () {
      const v = tarihEl.value;
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
      const parts = v.split("-");
      yilEl.value = parts[0];
      ayEl.value = parts[1];
      gunEl.value = parts[2];
      dropdowns.forEach((dd) => {
        const part = dd.dataset.tarihPart;
        const sel = selects[part];
        const triggerSpan = dd.querySelector(".custom-tarih-trigger .custom-tarih-value");
        const opt = sel.options[sel.selectedIndex];
        triggerSpan.textContent = opt ? opt.textContent : "—";
      });
    };

    function syncSelectsToTarih() {
      const y = parseInt(yilEl.value, 10);
      const m = parseInt(ayEl.value, 10);
      let d = parseInt(gunEl.value, 10);
      if (isNaN(y) || isNaN(m) || isNaN(d)) return;
      const lastDay = new Date(y, m, 0).getDate();
      if (d > lastDay) d = lastDay;
      const dateStr = String(y) + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      const maxDate = today.toISOString().slice(0, 10);
      if (dateStr >= "2006-01-01" && dateStr <= maxDate) {
        tarihEl.value = dateStr;
        tarihEl.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    syncTarihToMobileSelects();

    gunEl.addEventListener("change", syncSelectsToTarih);
    ayEl.addEventListener("change", syncSelectsToTarih);
    yilEl.addEventListener("change", syncSelectsToTarih);
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
        tarihEl.value = tarih < "2006-01-01" ? "2006-01-01" : tarih;
        applied = true;
      }
    }
    if (!applied) {
      miktarEl.value = formatMiktar(1000000);
      tarihEl.value = getDefaultDate();
    }
    return applied;
  }

  function getShareableUrl(miktar, tarih, ref) {
    const base = typeof window !== "undefined" ? window.location.origin : "https://negetirmis.com";
    let url = `${base}/?tutar=${miktar}&tarih=${tarih}`;
    if (ref) url += "&ref=" + encodeURIComponent(ref);
    return url;
  }

  function updateBrowserUrl(miktar, tarih) {
    const url = getShareableUrl(miktar, tarih);
    window.history.replaceState(null, "", url);
    document.title = getDynamicTitle(miktar, tarih);
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

  function getDynamicTitle(miktar, tarih) {
    const m = typeof miktar === "number" ? miktar : parseMiktar(String(miktar));
    const miktarStr = formatMiktar(m);
    return `${miktarStr} TL Bugün Ne Getirmiş? | negetirmis.com`;
  }

  function generateShareTextForInvestment(investmentKey, deger, ref) {
    const miktarEl = document.getElementById("miktar");
    const tarihEl = document.getElementById("tarih");
    const miktar = miktarEl ? parseMiktar(miktarEl.value) : 1000000;
    const tarih = tarihEl ? tarihEl.value : getDefaultDate();
    const link = getShareableUrl(miktar, tarih, ref || "share");
    const miktarStr = formatMiktar(miktar);
    const sonucStr = fmt(Math.round(deger || 0), 0);
    const labels = { altin: "altın", usd: "dolar", eur: "euro", mevduat: "mevduat" };
    const yatirimAdi = labels[investmentKey] || "yatırım";
    return `${miktarStr} TL ${yatirimAdi} yatırımıyla bugün ${sonucStr} TL olmuş! Sen de hesapla: ${link}`;
  }

  function generateShareText(bestDeger, ref) {
    const miktarEl = document.getElementById("miktar");
    const tarihEl = document.getElementById("tarih");
    const miktar = miktarEl ? parseMiktar(miktarEl.value) : 1000000;
    const tarih = tarihEl ? tarihEl.value : getDefaultDate();
    const sonuc = bestDeger != null ? bestDeger : lastShareResult != null ? lastShareResult : miktar;
    const sonucStr = fmt(Math.round(sonuc), 0);
    const link = getShareableUrl(miktar, tarih, ref);
    const miktarStr = formatMiktar(miktar);
    return `${miktarStr} TL bugün tam ${sonucStr} TL olmuş! Sen de hesapla: ${link}`;
  }

  function getPortfolioShareableUrl(ref) {
    const base = typeof window !== "undefined" ? window.location.origin : "https://negetirmis.com";
    const p = new URLSearchParams();
    const ids = ["Gold", "GramAltin", "Usd", "Eur", "Cash"];
    const keys = ["altin", "gramaltin", "dolar", "eur", "nakit"];
    const amountIds = ["Gold", "GramAltin", "Usd", "Eur", "Cash"];
    ids.forEach((id, i) => {
      const dateEl = document.getElementById("portfolio" + id + "Date");
      const amountEl = document.getElementById("portfolio" + amountIds[i]);
      if (dateEl?.value) p.set("portfolio_" + keys[i] + "_tarih", dateEl.value);
      const val = amountEl ? (id === "Cash" ? parsePortfolioNum(amountEl.value) : parsePortfolioNum(amountEl.value)) : 0;
      if (val > 0) p.set("portfolio_" + keys[i], val);
    });
    if (ref) p.set("ref", ref);
    const qs = p.toString();
    return qs ? `${base}/?${qs}` : base + "/";
  }

  function generatePortfolioShareText(toplamDeger) {
    const toplamStr = fmt(Math.round(toplamDeger || 0), 0);
    const baseLink = lastPortfolioUrl || getPortfolioShareableUrl();
    const link = baseLink + (baseLink.includes("?") ? "&" : "?") + "ref=share";
    return `Elimdeki varlıkların (altın, döviz, nakit) geçmişten bugüne serüvenini hesapladım. Toplam değer: ${toplamStr} TL. Sen de portföyünü test et: ${link}`;
  }

  function updateShareButtons(bestDeger) {
    if (bestDeger != null) lastShareResult = bestDeger;
    const waEl = document.getElementById("share-whatsapp");
    const twEl = document.getElementById("share-twitter");
    if (waEl) waEl.href = "https://wa.me/?text=" + encodeURIComponent(generateShareText(bestDeger, "wa"));
    if (twEl) twEl.href = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(generateShareText(bestDeger, "x"));
  }

  function setupPortfolioShare() {
    const btn = document.getElementById("share-portfolio");
    const lbl = document.getElementById("share-portfolio-text");
    if (!btn || !lbl) return;
    btn.addEventListener("click", async () => {
      if (lastPortfolioTotal == null) return;
      const text = generatePortfolioShareText(lastPortfolioTotal);
      try {
        await navigator.clipboard.writeText(text);
        const orig = lbl.textContent;
        lbl.textContent = "Kopyalandı!";
        setTimeout(() => { lbl.textContent = orig; }, 2000);
      } catch (_) {
        lbl.textContent = "Kopyalanamadı";
        setTimeout(() => { lbl.textContent = "Portföyü Paylaş"; }, 2000);
      }
    });
  }

  function setupCardShareButtons() {
    document.querySelectorAll(".card-share-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const key = btn.dataset.investment;
        const deger = lastInvestmentValues[key];
        if (deger == null || deger <= 0) return;
        const text = generateShareTextForInvestment(key, deger, "share");
        try {
          await navigator.clipboard.writeText(text);
          const span = btn.querySelector(".card-share-text");
          if (span) {
            const orig = span.textContent;
            span.textContent = "Kopyalandı!";
            setTimeout(() => { span.textContent = orig; }, 2000);
          }
        } catch (_) {}
      });
    });
  }

  function setupShareCopy() {
    const btn = document.getElementById("share-copy");
    const lbl = document.getElementById("share-copy-text");
    if (!btn || !lbl) return;
    btn.addEventListener("click", async () => {
      const text = generateShareText(null, "share");
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
    let data = null;
    const { data: prevData, error: prevErr } = await supabase
      .from("piyasa_arsivi")
      .select("tarih, usd_kur, eur_kur, altin_gram")
      .gte("tarih", "2006-01-01")
      .lte("tarih", dateStr)
      .order("tarih", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prevErr) throw new Error("Piyasa verisi alınamadı: " + prevErr.message);
    data = prevData;
    if (!data) {
      const { data: nextData, error: nextErr } = await supabase
        .from("piyasa_arsivi")
        .select("tarih, usd_kur, eur_kur, altin_gram")
        .gte("tarih", dateStr)
        .order("tarih", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (nextErr) throw new Error("Piyasa verisi alınamadı: " + nextErr.message);
      data = nextData;
    }
    if (!data) {
      const { data: anyData, error: anyErr } = await supabase
        .from("piyasa_arsivi")
        .select("tarih, usd_kur, eur_kur, altin_gram")
        .gte("tarih", "2006-01-01")
        .order("tarih", { ascending: dateStr < new Date().toISOString().slice(0, 10) })
        .limit(1)
        .maybeSingle();
      if (!anyErr && anyData) data = anyData;
    }
    if (data) piyasaCache.set(dateStr, data);
    return data;
  }

  async function getPiyasaToday() {
    const today = new Date().toISOString().slice(0, 10);
    return getPiyasaForDate(today);
  }

  async function getPiyasaRange(startDate, endDate) {
    const effStart = startDate < "2006-01-01" ? "2006-01-01" : startDate;
    const { data, error } = await supabase
      .from("piyasa_arsivi")
      .select("tarih, usd_kur, eur_kur, altin_gram")
      .gte("tarih", effStart)
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

  function aggregateByMonth(rows) {
    if (!rows || rows.length === 0) return [];
    const byMonth = new Map();
    for (const r of rows) {
      const key = r.tarih.slice(0, 7);
      if (!byMonth.has(key)) {
        byMonth.set(key, { tarih: r.tarih, sumUsd: 0, sumEur: 0, sumAltin: 0, count: 0 });
      }
      const acc = byMonth.get(key);
      acc.sumUsd += r.usd_kur || 0;
      acc.sumEur += r.eur_kur || r.usd_kur * 1.1 || 0;
      acc.sumAltin += r.altin_gram || 0;
      acc.count += 1;
      if (r.tarih > acc.tarih) acc.tarih = r.tarih;
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, acc]) => ({
        tarih: acc.tarih,
        usd_kur: acc.count > 0 ? acc.sumUsd / acc.count : 0,
        eur_kur: acc.count > 0 ? acc.sumEur / acc.count : 0,
        altin_gram: acc.count > 0 ? acc.sumAltin / acc.count : 0,
      }));
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

    const startYear = parseInt(tarih.slice(0, 4), 10);
    const endYear = parseInt(today.slice(0, 4), 10);
    const yearsSpan = endYear - startYear + 1;
    const sampled = yearsSpan > 5 ? aggregateByMonth(rows) : sampleEveryN(rows, 7);
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

  function updateAlimBaslik(tarih, miktar) {
    const [y, m, d] = (tarih || "").split("-");
    const tarihStr = y && m && d ? `${d}.${m}.${y}` : "—";
    const miktarStr = miktar ? formatMiktar(Math.round(miktar)) : "—";
    const metin = `${tarihStr} tarihinde ${miktarStr} liraya alınabilecekler`;
    document.querySelectorAll(".alim-baslik-dinamik").forEach((e) => { e.textContent = metin; });
  }

  async function updateUI(tarih, miktar) {
    const el = (id) => document.getElementById(id);
    const set = (id, text) => {
      const e = el(id);
      if (e) e.textContent = text;
    };

    updateAlimBaslik(tarih, miktar);
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
        hideError();
        lastInvestmentValues = {};
        updateAlimBaslik(tarih, miktar);
        set("altin_deger", "—");
        set("usd_deger", "—");
        set("eur_deger", "—");
        set("mevduat_deger", "—");
        document.querySelectorAll("[data-investment]").forEach((card) => {
          card.classList.remove("ring-4", "ring-yellow-400");
          card.querySelector(".champion-badge")?.remove();
        });
        if (growthChart) {
          growthChart.destroy();
          growthChart = null;
        }
        return;
      }

      if (baslangic.tarih !== tarih) {
        tarih = baslangic.tarih;
        const tarihEl = document.getElementById("tarih");
        if (tarihEl) {
          tarihEl.value = baslangic.tarih;
          updateBrowserUrl(parseMiktar(document.getElementById("miktar")?.value || 0), baslangic.tarih);
        }
        updateAlimBaslik(tarih, miktar);
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

      const results = [
        { key: "altin", deger: altinDeger },
        { key: "usd", deger: usdDeger },
        { key: "eur", deger: eurDeger },
        { key: "mevduat", deger: mevduatDeger },
      ];
      results.forEach((r) => { lastInvestmentValues[r.key] = r.deger; });
      const best = results.reduce((a, b) => (b.deger > a.deger ? b : a));
      updateShareButtons(best.deger);
      document.querySelectorAll("[data-investment]").forEach((card) => {
        card.classList.remove("ring-4", "ring-yellow-400");
        card.classList.remove("ring-4", "ring-amber-400");
        let badge = card.querySelector(".champion-badge");
        if (badge) badge.remove();
        if (card.dataset.investment === best.key) {
          card.classList.add("ring-4", "ring-yellow-400");
          const b = document.createElement("div");
          b.className = "champion-badge absolute -top-2 right-3 px-2 py-0.5 rounded-lg bg-amber-400 text-slate-900 text-xs font-bold shadow";
          b.textContent = "👑 En Çok Kazandıran";
          card.appendChild(b);
        }
      });
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

      await buildChartData(baslangic.tarih, miktar, baslangic, bugun);
    } catch (err) {
      console.error(err);
      showError("Veri yüklenirken bir hata oluştu. Lütfen tekrar deneyin.");
      set("altin_deger", "—");
      set("usd_deger", "—");
      set("eur_deger", "—");
      set("mevduat_deger", "—");
      document.querySelectorAll("[data-investment]").forEach((card) => {
        card.classList.remove("ring-4", "ring-yellow-400");
        card.querySelector(".champion-badge")?.remove();
      });
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
