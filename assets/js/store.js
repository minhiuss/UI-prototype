/* TradeUp prototype: state in localStorage so the customer and appraiser pages share cases.
   Cases (bookings) are still local: there is no case API yet (web/README.md). Prices inside a case are a snapshot of
   the engine's answer at booking time. */
(function () {
  "use strict";
  var KEY = "tradeup.prototype.v3"; // v3: no default province (a saved "Hà Nội" from v2 was a default, not a choice)

  function blankDraft() {
    return { step: 0, brand: "", model: "", year: "", trim: "", km: "", fuel: "", accident: "", flood: "", owners: "", targetId: TU.DEFAULT_TARGET, edition: "", province: "", customer: {}, down: 20, term: 60, quote: null, damages: [], photos: {}, consent: false, booking: { dealer: "", date: "", time: "", name: "", phone: "" } };
  }

  /* Keep only what the case page needs from POST /valuations (offer band, sources), never listing URLs. */
  function snapshot(resp) {
    var v = TU.outcome(resp).valuation, t = TU.outcome(resp).topup;
    if (!v || v.status !== "ok") return { ok: false, reason: (v && v.user_message) || "Chưa có khoảng giá tạm tính." };
    return {
      ok: true, low: v.offer_low_vnd, suggested: v.offer_suggested_vnd, high: v.offer_high_vnd,
      compsCount: v.comparable_count, source: v.comps_source, dataDate: v.data_date, confidence: v.confidence,
      explanation: (v.offer && v.offer.explanation) || [], label: v.provisional_label,
      target: t ? t.target_model + " " + t.target_variant : "", synthetic: !!resp.is_synthetic
    };
  }
  /* Seeded demo cases: fixed snapshots, clearly marked as sample data (not computed in the browser). */
  function seedSnap(low, suggested, high) {
    return { ok: true, low: low, suggested: suggested, high: high, compsCount: 7, source: "Hồ sơ mẫu của bản thử", dataDate: "2026-11-10", confidence: "low", explanation: ["Hồ sơ mẫu: số liệu cố định để thử bàn thẩm định, không phải kết quả engine."], label: "Tạm tính — giá chính thức do thẩm định viên quyết định", synthetic: true };
  }
  function seed() {
    var cases = {
      "TU-000124": { id: "TU-000124", createdAt: "16/11/2026", car: { brand: "Mazda", model: "Mazda3", year: 2020, trim: "1.5 Luxury", km: 58000, fuel: "xang", accident: "none", flood: "no", owners: "1", damages: [] }, target: "VF 8 Eco", estimate: seedSnap(452000000, 481000000, 510000000), booking: { dealer: TU.DEALERS[0], date: today(), time: "15:30", name: "Khách mẫu B", phone: "09xx xxx 124" }, status: "waiting", official: null, seeded: true },
      "TU-000119": { id: "TU-000119", createdAt: "16/11/2026", car: { brand: "Hyundai", model: "Accent", year: 2021, trim: "1.4 AT", km: 41000, fuel: "xang", accident: "light", flood: "no", owners: "1", damages: [{ part: "Cửa phải", type: "Xước", level: "Nhẹ", on: true }] }, target: "VF 6 Eco", estimate: seedSnap(388000000, 412000000, 436000000), booking: { dealer: TU.DEALERS[0], date: today(), time: "09:00", name: "Khách mẫu A", phone: "09xx xxx 119" }, status: "done", official: { price: 405000000, by: "Thẩm định viên Demo", at: "09:40, " + viDate(today()), reason: "" }, seeded: true }
    };
    return { draft: blankDraft(), cases: cases, myCase: "", seq: 125, simulateError: false };
  }

  function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function viDate(iso) { if (!iso) return ""; var p = iso.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function nowStamp() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ", " + viDate(today()); }

  var state;
  function load() {
    try { state = JSON.parse(localStorage.getItem(KEY)); } catch (e) { state = null; }
    if (!state || !state.cases) { state = seed(); save(); }
    if (!state.draft) state.draft = blankDraft();
    var b = blankDraft(); Object.keys(b).forEach(function (k) { if (state.draft[k] === undefined) state.draft[k] = b[k]; });
    return state;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode: keep in memory */ } }

  window.Store = {
    get: function () { return state || load(); },
    save: save,
    reset: function () { state = seed(); save(); },
    newDraft: function () { state.draft = blankDraft(); save(); },
    blankDraft: blankDraft,
    snapshot: snapshot,
    carOf: function (d) { return { brand: d.brand, model: d.model, year: Number(d.year), trim: d.trim, km: Number(d.km), fuel: d.fuel, accident: d.accident || "none", flood: d.flood || "no", owners: d.owners || "1", damages: d.damages || [] }; },
    carLabel: function (c) { return [c.brand, c.model, c.trim && c.trim !== "Không rõ" ? c.trim : "", c.year].filter(Boolean).join(" "); },
    createCase: function () {
      var d = state.draft, car = this.carOf(d), id = "TU-" + ("000000" + state.seq).slice(-6), est = d.quote ? snapshot(d.quote) : { ok: false, reason: "Chưa có khoảng giá tạm tính." };
      state.seq += 1;
      state.cases[id] = { id: id, createdAt: viDate(today()), car: car, target: est.target || "VinFast", estimate: est, booking: JSON.parse(JSON.stringify(d.booking)), photoCount: Object.keys(d.photos || {}).length, status: "waiting", inspected: false, official: null };
      state.myCase = id; save();
      return id;
    },
    today: today, viDate: viDate, nowStamp: nowStamp
  };
  load();
})();
