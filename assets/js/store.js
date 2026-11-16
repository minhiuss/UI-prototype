/* TradeUp prototype: state in localStorage so the customer and appraiser pages share cases. */
(function () {
  "use strict";
  var KEY = "tradeup.prototype.v1";

  function blankDraft() {
    return { step: 0, brand: "", model: "", year: "", trim: "", km: "", kmConfirmed: false, accident: "", flood: "", owners: "", target: "VF 7", down: 20, term: 60, damages: [], photos: {}, consent: false, booking: { dealer: "", date: "", time: "", name: "", phone: "" } };
  }

  function seedCase(id, car, target, booking, official) {
    var est = TU.estimate(car);
    return { id: id, createdAt: "16/11/2026", car: car, target: target, estimate: est, booking: booking, status: official ? "done" : "waiting", official: official || null, seeded: true };
  }

  function seed() {
    var cases = {};
    [
      seedCase("TU-000124", { brand: "Mazda", model: "CX-5", year: 2020, trim: "2.0 Luxury", km: 58000, accident: "none", flood: "no", owners: "1", damages: [] }, "VF 8", { dealer: TU.DEALERS[0], date: today(), time: "15:30", name: "Khách mẫu B", phone: "09xx xxx 124" }),
      seedCase("TU-000119", { brand: "Hyundai", model: "Accent", year: 2021, trim: "1.4 AT", km: 41000, accident: "light", flood: "no", owners: "1", damages: [{ part: "Cửa phải", type: "Xước", level: "Nhẹ", on: true }] }, "VF 6", { dealer: TU.DEALERS[0], date: today(), time: "09:00", name: "Khách mẫu A", phone: "09xx xxx 119" }, null)
    ].forEach(function (c) { cases[c.id] = c; });
    var done = cases["TU-000119"];
    done.status = "done";
    done.official = { price: Math.round((done.estimate.low + done.estimate.high) / 2), by: "Thẩm định viên Demo", at: "09:40, " + viDate(today()), reason: "" };
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
    return state;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode: keep in memory */ } }

  window.Store = {
    get: function () { return state || load(); },
    save: save,
    reset: function () { state = seed(); save(); },
    newDraft: function () { state.draft = blankDraft(); save(); },
    carOf: function (d) { return { brand: d.brand, model: d.model, year: Number(d.year), trim: d.trim, km: Number(d.km), accident: d.accident || "none", flood: d.flood || "no", owners: d.owners || "1", damages: d.damages || [] }; },
    carLabel: function (c) { return [c.brand, c.model, c.trim && c.trim !== "Không rõ" ? c.trim : "", c.year].filter(Boolean).join(" "); },
    createCase: function () {
      var d = state.draft, car = this.carOf(d), id = "TU-" + ("000000" + state.seq).slice(-6);
      state.seq += 1;
      state.cases[id] = { id: id, createdAt: viDate(today()), car: car, target: d.target, estimate: TU.estimate(car), booking: JSON.parse(JSON.stringify(d.booking)), photoCount: Object.keys(d.photos || {}).length, status: "waiting", official: null };
      state.myCase = id; save();
      return id;
    },
    today: today, viDate: viDate, nowStamp: nowStamp
  };
  load();
})();
