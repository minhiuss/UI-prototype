/* TradeUp prototype: mock data + deterministic money engine.
   Every figure here is illustrative. Replace with the backend engine (src/) when the API exists.
   Unit for money: triệu VND (million), unless a name says otherwise. */
(function () {
  "use strict";

  var NOW_YEAR = 2026;
  var DATA_DATE = "10/11/2026";
  var COMPS_SOURCE = "Tin rao mẫu (dữ liệu giả lập của prototype)";
  var MIN_COMPS = 5;

  // base = illustrative listing price of a current-year car, in triệu
  var USED = {
    Toyota: { Vios: { base: 650, trims: ["1.5E MT", "1.5E CVT", "1.5G"] }, "Corolla Cross": { base: 960, trims: ["1.8G", "1.8V", "1.8HV"] }, Fortuner: { base: 1280, trims: ["2.4 MT", "2.4 AT", "2.8 Legender"] }, Innova: { base: 880, trims: ["2.0E", "2.0G", "2.0V"] }, Camry: { base: 1380, trims: ["2.0G", "2.5Q"] } },
    Honda: { City: { base: 640, trims: ["G", "L", "RS"] }, "CR-V": { base: 1180, trims: ["E", "G", "L"] }, Civic: { base: 890, trims: ["E", "G", "RS"] } },
    Hyundai: { Accent: { base: 590, trims: ["1.4 MT", "1.4 AT", "1.4 AT Đặc biệt"] }, Creta: { base: 760, trims: ["Tiêu chuẩn", "Đặc biệt", "Cao cấp"] }, Tucson: { base: 1010, trims: ["2.0 Tiêu chuẩn", "2.0 Đặc biệt", "1.6 Turbo"] }, "Grand i10": { base: 470, trims: ["1.2 MT", "1.2 AT"] } },
    Ford: { Ranger: { base: 960, trims: ["XLS", "XLT", "Wildtrak"] }, Everest: { base: 1390, trims: ["Ambiente", "Sport", "Titanium"] } },
    Mazda: { Mazda3: { base: 760, trims: ["1.5 Deluxe", "1.5 Luxury", "1.5 Premium"] }, "CX-5": { base: 960, trims: ["2.0 Deluxe", "2.0 Luxury", "2.0 Premium"] } },
    Kia: { Morning: { base: 440, trims: ["MT", "AT", "X-Line"] }, Seltos: { base: 750, trims: ["1.4 Deluxe", "1.4 Luxury", "1.4 Premium"] }, K3: { base: 700, trims: ["1.6 MT", "1.6 Luxury", "1.6 Premium"] } },
    Mitsubishi: { Xpander: { base: 700, trims: ["MT", "AT", "AT Premium"] } },
    VinFast: { Fadil: { base: 430, trims: ["Tiêu chuẩn", "Nâng cao", "Cao cấp"] }, "Lux A2.0": { base: 900, trims: ["Tiêu chuẩn", "Nâng cao", "Cao cấp"] }, "VF e34": { base: 620, trims: ["Tiêu chuẩn"] } }
  };

  var VINFAST = [
    { name: "VF 3", desc: "Đô thị linh hoạt", price: 299, promo: 10, img: "assets/img/vf3.jpg" },
    { name: "VF 5", desc: "Nhỏ gọn, hiện đại", price: 529, promo: 20, img: "assets/img/vf5.jpg" },
    { name: "VF 6", desc: "Cân bằng đa dụng", price: 689, promo: 25, img: "assets/img/vf6.jpg" },
    { name: "VF 7", desc: "Mạnh mẽ, cá tính", price: 799, promo: 30, img: "assets/img/vf7.jpg" },
    { name: "VF 8", desc: "Tiện nghi vượt trội", price: 1019, promo: 40, img: "assets/img/vf8.jpg" },
    { name: "VF 9", desc: "Rộng rãi, đẳng cấp", price: 1499, promo: 60, img: "assets/img/vf9.jpg" }
  ];

  var PROMO = { name: "Ưu đãi đổi xe (minh họa)", wave: "Đợt tháng 11/2026", validTo: "30/11/2026", source: "Số minh họa của prototype, chưa phải chính sách VinFast" };
  var LOAN = { monthlyRate: 0.0075, date: DATA_DATE, terms: [12, 24, 36, 48, 60, 72, 84] };
  var DEALERS = ["VinFast Demo Long Biên", "VinFast Demo Phạm Văn Đồng", "VinFast Demo Quận 7"];
  var SLOTS = ["09:00", "10:30", "14:00", "15:30", "17:00"];

  var ACCIDENT = { none: { label: "Không va chạm", pct: 0 }, light: { label: "Va chạm nhẹ, đã sửa", pct: 0.03 }, heavy: { label: "Va chạm nặng", pct: 0.10 } };
  var FLOOD = { no: { label: "Không ngập nước", pct: 0 }, yes: { label: "Từng ngập nước", pct: 0.15 } };
  var OWNERS = { "1": { label: "1 đời chủ", pct: 0 }, "2": { label: "2 đời chủ", pct: 0.01 }, "3": { label: "3 đời chủ trở lên", pct: 0.025 } };

  // deduction table for damages found in photos (triệu), fixed in code
  var DAMAGE_PARTS = ["Cản trước", "Cản sau", "Cửa trái", "Cửa phải", "Nắp capo", "Đèn", "Kính lái", "Nội thất"];
  var DAMAGE_TYPES = { "Xước": { "Nhẹ": 1, "Vừa": 2, "Nặng": 4 }, "Móp": { "Nhẹ": 2, "Vừa": 4, "Nặng": 8 }, "Nứt, vỡ": { "Nhẹ": 3, "Vừa": 6, "Nặng": 12 } };

  function seedRand(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () { h += 0x6D2B79F5; var t = Math.imul(h ^ (h >>> 15), 1 | h); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function damageCost(d) { var t = DAMAGE_TYPES[d.type]; return t && t[d.level] ? t[d.level] : 0; }

  /* Returns {ok:false, reason, compsCount} or the full estimate. */
  function estimate(car) {
    var spec = USED[car.brand] && USED[car.brand][car.model];
    var age = Math.max(0, NOW_YEAR - Number(car.year));
    var km = Number(car.km) || 0;
    var rand = seedRand([car.brand, car.model, car.year].join("|"));
    var compsCount = !spec ? Math.floor(rand() * 3) : age > 13 ? 2 + Math.floor(rand() * 3) : 8 + Math.floor(rand() * 22);
    if (compsCount < MIN_COMPS) {
      return { ok: false, compsCount: compsCount, reason: "chỉ có " + compsCount + " xe tương đồng đang rao (cần ít nhất " + MIN_COMPS + ")." };
    }
    var listing = spec.base * Math.pow(0.94, age);
    var expectedKm = age * 12000;
    var kmAdj = Math.max(-0.10, Math.min(0.10, -((km - expectedKm) / 10000) * 0.008));
    listing = Math.round(listing * (1 + kmAdj));
    var negotiation = Math.round(listing * 0.03);
    var buyMargin = Math.round(listing * 0.08);
    var condPct = (ACCIDENT[car.accident] || ACCIDENT.none).pct + (FLOOD[car.flood] || FLOOD.no).pct + (OWNERS[car.owners] || OWNERS["1"]).pct;
    var condition = Math.round(listing * condPct);
    var photo = (car.damages || []).filter(function (d) { return d.on !== false; }).reduce(function (s, d) { return s + damageCost(d); }, 0);
    var mid = listing - negotiation - buyMargin - condition - photo;
    var low = Math.max(20, Math.round(mid * 0.96)), high = Math.max(low + 1, Math.round(mid * 1.04));
    var comps = [];
    for (var i = 0; i < Math.min(compsCount, 6); i++) {
      comps.push({
        title: car.brand + " " + car.model + " " + (spec.trims[Math.floor(rand() * spec.trims.length)]) + " " + car.year,
        price: Math.round(listing * (0.93 + rand() * 0.14)),
        km: Math.max(3000, Math.round((km * (0.7 + rand() * 0.6)) / 1000) * 1000),
        place: ["Hà Nội", "TP.HCM", "Đà Nẵng", "Hải Phòng", "Bình Dương"][Math.floor(rand() * 5)]
      });
    }
    return { ok: true, compsCount: compsCount, comps: comps, listing: listing, negotiation: negotiation, buyMargin: buyMargin, condition: condition, photo: photo, low: low, high: high, dataDate: DATA_DATE, source: COMPS_SOURCE };
  }

  function vinfast(name) { for (var i = 0; i < VINFAST.length; i++) if (VINFAST[i].name === name) return VINFAST[i]; return VINFAST[3]; }

  /* Top-up at both ends of the used-car range. */
  function topUp(est, targetName) {
    var m = vinfast(targetName);
    return { model: m, list: m.price, promo: m.promo, low: Math.max(0, m.price - m.promo - est.high), high: Math.max(0, m.price - m.promo - est.low) };
  }

  function installment(principal, months) {
    if (principal <= 0) return 0;
    var r = LOAN.monthlyRate, f = Math.pow(1 + r, months);
    return principal * (r * f) / (f - 1);
  }
  function monthly(top, downPct, months) {
    var k = 1 - downPct / 100;
    return { low: installment(top.low * k, months), high: installment(top.high * k, months) };
  }

  /* Returns a question for the customer when km looks wrong for the year, else null. Never corrects the value itself. */
  function kmCheck(year, km) {
    var age = Math.max(0, NOW_YEAR - Number(year));
    km = Number(km);
    if (!isFinite(km) || km < 0) return null;
    if (km > age * 35000 + 30000) return "Xe " + year + " mà đi " + fmtInt(km) + " km là cao bất thường. Bạn kiểm tra lại nhé?";
    if (age >= 3 && km < 1000) return "Xe " + year + " mà mới đi " + fmtInt(km) + " km là thấp bất thường. Bạn kiểm tra lại nhé?";
    return null;
  }

  function strip(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d"); }

  /* Free text -> structured fields. Only fills what it finds. */
  function parseFreeText(text) {
    var t = strip(text), out = {};
    Object.keys(USED).forEach(function (b) {
      Object.keys(USED[b]).forEach(function (m) {
        if (t.indexOf(strip(m)) !== -1 && (!out.model || m.length > out.model.length)) { out.brand = b; out.model = m; }
      });
      if (!out.brand && t.indexOf(strip(b)) !== -1) out.brand = b;
    });
    var y = t.match(/\b(19[9]\d|20[0-2]\d)\b/); if (y) out.year = Number(y[1]);
    var van = t.match(/(\d+(?:[.,]\d+)?)\s*van/), km = t.match(/(\d[\d.,]*)\s*(?:km|cay)/), k = t.match(/\b(\d{2,3})k\b/);
    if (van) out.km = Math.round(parseFloat(van[1].replace(",", ".")) * 10000);
    else if (km) out.km = Number(km[1].replace(/[.,]/g, ""));
    else if (k) out.km = Number(k[1]) * 1000;
    if (out.brand && out.model) {
      var trims = USED[out.brand][out.model].trims, bm = t.match(/ban\s+([a-z0-9.]+)/);
      if (bm) trims.forEach(function (tr) { if (strip(tr).indexOf(bm[1]) !== -1 && !out.trim) out.trim = tr; });
    }
    return out;
  }

  function fmtInt(n) { return new Intl.NumberFormat("vi-VN").format(Math.round(n)); }
  function fmtTr(n) { return fmtInt(n) + " triệu"; }
  function fmtRange(a, b) { return a === b ? fmtTr(a) : fmtInt(a) + " – " + fmtInt(b) + " triệu"; }
  function fmtDec(n) { return new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n); }
  function fmtRate() { return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(LOAN.monthlyRate * 100) + "%/tháng"; }
  function fmtMonthly(m) { return Math.abs(m.low - m.high) < 0.05 ? fmtDec(m.low) + " triệu" : fmtDec(m.low) + " – " + fmtDec(m.high) + " triệu"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  window.TU = {
    NOW_YEAR: NOW_YEAR, DATA_DATE: DATA_DATE, MIN_COMPS: MIN_COMPS, USED: USED, VINFAST: VINFAST, PROMO: PROMO, LOAN: LOAN, DEALERS: DEALERS, SLOTS: SLOTS,
    ACCIDENT: ACCIDENT, FLOOD: FLOOD, OWNERS: OWNERS, DAMAGE_PARTS: DAMAGE_PARTS, DAMAGE_TYPES: DAMAGE_TYPES,
    estimate: estimate, topUp: topUp, monthly: monthly, vinfast: vinfast, kmCheck: kmCheck, parseFreeText: parseFreeText, damageCost: damageCost,
    fmtInt: fmtInt, fmtTr: fmtTr, fmtRange: fmtRange, fmtMonthly: fmtMonthly, fmtDec: fmtDec, fmtRate: fmtRate, esc: esc
  };
})();
