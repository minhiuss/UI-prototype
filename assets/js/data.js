/* TradeUp web: API client for the TradeUp engine + agent, and display helpers.
   Contract: docs/ui-integration.md. Every money figure comes from the server (integer VND);
   this file only formats numbers, it never adds, subtracts or recomputes money (§5.8). */
(function () {
  "use strict";

  /* ---------- static UI data (labels only, no prices) ---------- */
  var DEALERS = ["VinFast Demo Long Biên", "VinFast Demo Phạm Văn Đồng", "VinFast Demo Quận 7"];
  var SLOTS = ["09:00", "10:30", "14:00", "15:30", "17:00"];
  // Condition is sent to the API (`car.condition`); the engine does not price it yet (§6), the appraiser does.
  var ACCIDENT = { none: { label: "Không va chạm", api: "none" }, light: { label: "Va chạm nhẹ, đã sửa", api: "light" }, heavy: { label: "Va chạm nặng", api: "heavy" } };
  var FLOOD = { no: { label: "Không ngập nước", api: false }, yes: { label: "Từng ngập nước", api: true } };
  var OWNERS = { "1": { label: "1 đời chủ", api: 1 }, "2": { label: "2 đời chủ", api: 2 }, "3": { label: "3 đời chủ trở lên", api: 3 } };
  var DAMAGE_PARTS = ["Cản trước", "Cản sau", "Cửa trái", "Cửa phải", "Nắp capo", "Đèn", "Kính lái", "Nội thất"];
  var DAMAGE_TYPES = ["Xước", "Móp", "Nứt, vỡ"];
  var LEVELS = ["Nhẹ", "Vừa", "Nặng"];
  var IMG = { "VF 3": "vf3", "VF 5": "vf5", "VF 6": "vf6", "VF 7": "vf7", "VF 8": "vf8", "VF 9": "vf9" };
  var DESC = { "VF 2": "Nhỏ gọn đô thị", "VF 3": "Đô thị linh hoạt", "VF 5": "Nhỏ gọn, hiện đại", "VF 6": "Cân bằng đa dụng", "VF 7": "Mạnh mẽ, cá tính", "VF 8": "Tiện nghi vượt trội", "VF 9": "Rộng rãi, đẳng cấp", "VF MPV 7": "Gia đình 7 chỗ", "VF Wild": "Bán tải điện" };
  var TIER_LABEL = { member: "Thành viên", gold: "Gold", platinum: "Platinum", diamond: "Diamond" };
  var AUDIENCE_LABEL = { normal: "Khách thường", caqd: "Công an, quân đội" };
  var DEFAULT_TARGET = "Products-Car-VF7"; // no default province: on-road fees depend on it, so the customer must choose it
  var NOW_YEAR = new Date().getFullYear();

  function imgFor(label) {
    var m = String(label || "").match(/^VF \d/);
    return "assets/img/" + (m && IMG[m[0]] ? IMG[m[0]] : "vf7") + ".jpg";
  }
  function descFor(label) { var k = Object.keys(DESC).filter(function (x) { return String(label).indexOf(x) === 0; }).sort(function (a, b) { return b.length - a.length; })[0]; return k ? DESC[k] : "Xe điện VinFast"; }

  /* ---------- API base ----------
     Order: same origin when this page is served by the API (/web/...) → window.TRADEUP_API (set by whoever deploys the
     page) → ?api=<url> / saved choice → http://localhost:8000. A hosted copy (GitHub Pages) sets window.TRADEUP_API and
     needs its origin in CORS_ORIGINS.
     ?api= and the "Máy chủ API" field only accept a LOCAL server (localhost, 127.0.0.1, [::1]): a link such as
     ?api=https://other-host must not be able to send the customer's car details and chat to another server, and must not
     stay remembered for later visits. */
  var API_KEY = "tradeup.api";
  var DEFAULT_API = "http://localhost:8000";
  function clean(u) { return String(u).replace(/\/+$/, ""); }
  function localApi(u) {
    try {
      var x = new URL(String(u));
      return /^https?:$/.test(x.protocol) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(x.hostname) ? clean(x.origin) : null;
    } catch (e) { return null; }
  }
  function servedByApi() { return /^https?:$/.test(location.protocol) && /^\/web(\/|$)/.test(location.pathname); }
  function readApiBase() {
    var saved = null; try { saved = localStorage.getItem(API_KEY); } catch (e) { /* ignore */ }
    var fromSaved = saved ? localApi(saved) : null;
    if (saved && !fromSaved) { try { localStorage.removeItem(API_KEY); } catch (e) { /* ignore */ } }  // drop an old non-local value
    if (servedByApi()) return location.origin;
    if (window.TRADEUP_API) return clean(window.TRADEUP_API);
    var q = null;
    try { q = new URLSearchParams(location.search).get("api"); } catch (e) { /* old browser */ }
    var fromQuery = q ? localApi(q) : null;
    if (fromQuery) { try { localStorage.setItem(API_KEY, fromQuery); } catch (e) { /* private mode */ } return fromQuery; }
    return fromSaved || DEFAULT_API;
  }
  var apiBase = readApiBase();
  /* Returns true when the new base is used; a non-local URL is refused (the current base stays). */
  function setApiBase(u) {
    if (!u) {
      try { localStorage.removeItem(API_KEY); } catch (e) { /* ignore */ }
      apiBase = readApiBase();
      return true;
    }
    var local = localApi(u);
    if (!local || servedByApi() || window.TRADEUP_API) return false;
    apiBase = local;
    try { localStorage.setItem(API_KEY, apiBase); } catch (e) { /* ignore */ }
    return true;
  }

  /* fetch wrapper: resolves {status, data, headers} for any HTTP answer, rejects {kind:"network"} when the API is unreachable. */
  function request(method, path, body, timeoutMs) {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 20000) : null;
    return fetch(apiBase + path, {
      method: method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      return r.text().then(function (t) {
        var data = null; try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
        return { status: r.status, data: data, headers: r.headers };
      });
    }, function (err) {
      throw { kind: "network", message: err && err.name === "AbortError" ? "timeout" : "unreachable" };
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  var cache = {};
  function cached(key, fn) {
    if (cache[key]) return cache[key];
    cache[key] = fn().then(function (r) { if (r.status !== 200 || !r.data || !r.data.ok) { delete cache[key]; throw { kind: "http", status: r.status, data: r.data }; } return r.data; }, function (e) { delete cache[key]; throw e; });
    return cache[key];
  }
  var api = {
    base: function () { return apiBase; },
    setBase: function (u) { var ok = setApiBase(u); cache = {}; return ok; },
    health: function () { return request("GET", "/health", null, 4000); },
    options: function () { return cached("options", function () { return request("GET", "/api/v1/options"); }); },
    vinfastModels: function () { return cached("vf", function () { return request("GET", "/api/v1/vinfast-models"); }); },
    checkInput: function (car) { return request("POST", "/api/v1/valuations/check-input", { car: car }); },
    valuate: function (body) { return request("POST", "/api/v1/valuations", body, 30000); },
    chat: function (body) { return request("POST", "/api/v1/trade-in/chat", body, 60000); }
  };

  /* ---------- request bodies (draft → API) ---------- */
  function carBody(d) {
    var car = { brand: d.brand, model: d.model };
    if (d.year) car.year = Number(d.year);
    if (d.km !== "" && d.km != null) car.mileage_km = Number(d.km);
    if (d.trim && d.trim !== "Không rõ") car.variant = d.trim;
    if (d.fuel) car.fuel = d.fuel;
    var cond = {};
    if (ACCIDENT[d.accident]) cond.accident = ACCIDENT[d.accident].api;
    if (FLOOD[d.flood]) cond.flooded = FLOOD[d.flood].api;
    if (OWNERS[d.owners]) cond.owner_count = OWNERS[d.owners].api;
    if (Object.keys(cond).length) car.condition = cond;
    return car;
  }
  function quoteBody(d) {
    var body = { car: carBody(d), target: { model_id: d.targetId, edition_code: d.edition } };
    if (d.province) body.target.province = d.province;
    var c = d.customer || {}, cust = {};
    Object.keys(c).forEach(function (k) { if (c[k] !== null && c[k] !== undefined && c[k] !== "") cust[k] = c[k]; });
    if (Object.keys(cust).length) body.customer = cust;
    body.loan = { down_payment_pct: Number(d.down), term_months: Number(d.term) };
    return body;
  }
  function outcome(resp) { return (resp && resp.result && resp.result.outcome) || {}; }

  /* Edition helpers over GET /vinfast-models. */
  function findModel(models, id) { for (var i = 0; i < models.length; i++) if (models[i].model_id === id) return models[i]; return null; }
  function activeEditions(m) { return (m && m.editions || []).filter(function (e) { return e.active !== false; }); }
  function defaultEdition(m) { var e = activeEditions(m); return e.length ? e[0].edition_code : ""; }

  /* ---------- free text → fields (structure only, no money) ---------- */
  function strip(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d"); }
  /* brands: GET /options result.brands ([{brand, models:[{model}]}]). Only fills what it finds. */
  function parseFreeText(text, brands) {
    var t = strip(text), out = {};
    (brands || []).forEach(function (b) {
      (b.models || []).forEach(function (m) {
        var name = strip(m.model);
        if (new RegExp("(^|[^a-z0-9])" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)").test(t) && (!out.model || m.model.length > out.model.length)) { out.brand = b.brand; out.model = m.model; }
      });
      if (!out.brand && new RegExp("\\b" + strip(b.brand) + "\\b").test(t)) out.brand = b.brand;
    });
    var y = t.match(/\b(19[89]\d|20[0-4]\d)\b/); if (y) out.year = Number(y[1]);
    var van = t.match(/(\d+(?:[.,]\d+)?)\s*van\b/), km = t.match(/(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(?:km|cay so|cay)\b/), k = t.match(/\b(\d{2,3})\s?k\b/);
    if (van) out.km = Math.round(parseFloat(van[1].replace(",", ".")) * 10000);
    else if (km) out.km = Number(km[1].replace(/[.,]/g, ""));
    else if (k) out.km = Number(k[1]) * 1000;
    var bm = String(text).match(/b[aả]n\s+([A-Za-z0-9.\- ]{1,12}?)(?=[,.;]|\s+(?:đi|di|chạy|chay|xe|muốn|muon|\d)|$)/i);
    if (bm) out.trim = bm[1].trim();
    var fuel = readFuel(t); if (fuel) out.fuel = fuel;
    return out;
  }
  function readFuel(t) {
    if (/\bhybrid\b|\bhev\b/.test(t)) return "hybrid";
    if (/\bxe (chay )?dau\b|\bmay dau\b|\bdiesel\b|\bchay dau\b/.test(t)) return "dau";
    if (/\bxang\b/.test(t)) return "xang";
    return "";
  }
  /* "trả trước 30%", "vay 5 năm", "60 tháng" → loan selector. These are the customer's inputs, not money. */
  function parseLoan(text) {
    var t = strip(text), out = {};
    var dp = t.match(/tra truoc\s*(\d{1,2})\s*(%|phan tram)/) || t.match(/(\d{1,2})\s*%\s*tra truoc/);
    if (dp) out.down = Number(dp[1]);
    var yr = t.match(/(?:vay|trong|ky han|tra gop)\s*(\d{1,2})\s*nam/), mo = t.match(/(\d{2,3})\s*thang/);
    if (yr) out.term = Number(yr[1]) * 12; else if (mo) out.term = Number(mo[1]);
    return out;
  }

  /* ---------- formatting only ---------- */
  function fmtInt(n) { return n == null || n === "" || isNaN(n) ? "—" : new Intl.NumberFormat("vi-VN").format(Math.round(Number(n))); }
  function fmtVnd(n) { return n == null ? "—" : fmtInt(n) + " đ"; }
  function fmtRange(a, b) { return a == null || b == null ? "—" : a === b ? fmtVnd(a) : fmtInt(a) + " – " + fmtInt(b) + " đ"; }
  function fmtTr(n) { return n == null ? "—" : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(Number(n) / 1e6) + " triệu"; }
  function fmtTrRange(a, b) { return a == null || b == null ? "—" : a === b ? fmtTr(a) : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(a / 1e6) + " – " + fmtTr(b); }
  function fmtPct(n) { return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n) + "%"; }
  /* Customer-facing name of the data behind a quote. The API's data_source is an internal label (fixtures / CAR_DATA_DIR), never shown. */
  function sourceLabel(q) { return q && q.is_synthetic ? "Dữ liệu mẫu để thử nghiệm" : "Dữ liệu tin rao công khai"; }
  function fmtDate(iso) { if (!iso) return ""; var p = String(iso).slice(0, 10).split("-"); return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : String(iso); }
  function fmtDec(n) { return new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  /* Server text → paragraphs, always escaped (agent answers are shown verbatim, §7 rule 1). */
  function paras(text) { return String(text || "").split(/\n{2,}/).map(function (p) { return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>"; }).join(""); }
  /* Only official VinFast / press links from the engine are shown; never listing URLs (§5.5). */
  function safeUrl(u) { return /^https:\/\/[^\s"'<>]+$/.test(String(u || "")) ? u : ""; }

  window.TU = {
    NOW_YEAR: NOW_YEAR, DEALERS: DEALERS, SLOTS: SLOTS, ACCIDENT: ACCIDENT, FLOOD: FLOOD, OWNERS: OWNERS,
    DAMAGE_PARTS: DAMAGE_PARTS, DAMAGE_TYPES: DAMAGE_TYPES, LEVELS: LEVELS, TIER_LABEL: TIER_LABEL, AUDIENCE_LABEL: AUDIENCE_LABEL,
    DEFAULT_TARGET: DEFAULT_TARGET,
    api: api, carBody: carBody, quoteBody: quoteBody, outcome: outcome,
    findModel: findModel, activeEditions: activeEditions, defaultEdition: defaultEdition, imgFor: imgFor, descFor: descFor,
    parseFreeText: parseFreeText, parseLoan: parseLoan, strip: strip,
    fmtInt: fmtInt, fmtVnd: fmtVnd, fmtRange: fmtRange, fmtTr: fmtTr, fmtTrRange: fmtTrRange, fmtPct: fmtPct, fmtDate: fmtDate, sourceLabel: sourceLabel, fmtDec: fmtDec,
    esc: esc, paras: paras, safeUrl: safeUrl
  };
})();
