/* TradeUp landing: quick estimate on the page via POST /api/v1/valuations, handing off to flow.html for the full result.
   Catalogs come from GET /options and /vinfast-models; every figure shown is a field of the engine's answer. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var s = Store.get(), d = s.draft, esc = TU.esc, I = UI.icon;
  var COND = { good: { accident: "none", flood: "no", owners: "1" }, normal: { accident: "light", flood: "no", owners: "2" }, rough: { accident: "heavy", flood: "no", owners: "2" } };
  var opts = null, models = [], last = null, seq = 0;

  function fill(sel, items, current) {
    sel.innerHTML = items.map(function (o) { return '<option value="' + esc(o.v) + '"' + (String(o.v) === String(current) ? " selected" : "") + ">" + esc(o.l) + "</option>"; }).join("");
  }
  function brandEntry(b) { return opts && opts.brands.filter(function (x) { return x.brand === b; })[0]; }
  function fillModels() { var be = brandEntry($("brand").value); fill($("model"), be ? be.models.map(function (m) { return { v: m.model, l: m.model }; }) : [], d.model); }
  function fromPrice(m) { return TU.activeEditions(m).map(function (e) { return e.list_price_vnd; }).sort(function (a, b) { return a - b; })[0]; }

  function boot() {
    Promise.all([TU.api.options(), TU.api.vinfastModels()]).then(function (r) {
      opts = r[0].result; models = r[1].result.models; UI.setSynthetic(r[0].is_synthetic);
      fill($("brand"), opts.brands.map(function (b) { return { v: b.brand, l: b.brand }; }), d.brand || "Toyota");
      fillModels();
      fill($("fuel"), opts.fuels.map(function (f) { return { v: f.value, l: f.label }; }), d.fuel || "xang");
      if (!TU.findModel(models, d.targetId)) d.targetId = models.length ? models[0].model_id : "";
      fill($("target"), models.map(function (m) { return { v: m.model_id, l: m.model + " · " + TU.descFor(m.model) }; }), d.targetId);
      renderModels();
    }, function () {
      $("formError").textContent = "Chưa kết nối được máy chủ TradeUp (" + TU.api.base() + "). Chạy “uvicorn src.main:app” rồi tải lại trang.";
      $("modelGrid").innerHTML = '<p class="model-note">Danh mục VinFast tải từ máy chủ; máy chủ chưa chạy.</p>';
    });
  }
  if (d.year) $("year").value = d.year;
  if (d.km !== "" && d.km != null) $("km").value = TU.fmtInt(d.km);
  $("brand").addEventListener("change", function () { d.model = ""; fillModels(); });
  $("km").addEventListener("input", function (e) { var n = e.target.value.replace(/\D/g, ""); e.target.value = n ? TU.fmtInt(Number(n)) : ""; });

  function renderModels() {
    $("modelGrid").innerHTML = models.map(function (m) {
      return '<button class="model" type="button" data-model="' + esc(m.model_id) + '" aria-pressed="' + (m.model_id === d.targetId) + '"><img src="' + TU.imgFor(m.model) + '" width="120" height="82" loading="lazy" alt=""><strong>' + esc(m.model) + "</strong><small>" + esc(TU.descFor(m.model)) + '</small><small class="from">từ ' + TU.fmtTr(fromPrice(m)) + "*</small></button>";
    }).join("");
    var m = TU.findModel(models, d.targetId);
    $("heroModel").textContent = m ? m.model : "VinFast";
    if (!last) { $("eqList").textContent = m ? "từ " + TU.fmtTr(fromPrice(m)) : ""; $("eqPromo").textContent = ""; }
  }
  function setTarget(id, recalc) {
    if (id !== d.targetId) d.edition = "";
    d.targetId = id; $("target").value = id; Store.save(); renderModels();
    if (recalc && last) calculate(false);
  }
  $("modelGrid").addEventListener("click", function (e) {
    var b = e.target.closest("[data-model]"); if (!b) return;
    setTarget(b.dataset.model, true);
    UI.toast("Đã chọn " + b.querySelector("strong").textContent + " cho phép tính");
  });
  $("target").addEventListener("change", function (e) { setTarget(e.target.value, true); });

  function invalid(el, msg) { el.setAttribute("aria-invalid", "true"); $("formError").textContent = msg; el.focus(); return false; }
  function calculate(scroll) {
    ["year", "km", "model"].forEach(function (id) { $(id).removeAttribute("aria-invalid"); });
    $("formError").textContent = "";
    var year = Number($("year").value), km = Number($("km").value.replace(/\D/g, ""));
    if (!opts) return invalid($("brand"), "Chưa tải được danh mục xe từ máy chủ TradeUp.");
    if (!year || year < 1990 || year > TU.NOW_YEAR) return invalid($("year"), "Năm sản xuất cần nằm trong khoảng 1990–" + TU.NOW_YEAR + ".");
    if ($("km").value.trim() === "") return invalid($("km"), "Nhập số km xe đã đi, ví dụ 62.000.");
    var c = COND[$("condition").value], sameCar = d.brand === $("brand").value && d.model === $("model").value;
    Object.assign(d, { brand: $("brand").value, model: $("model").value, year: year, km: km, fuel: $("fuel").value, trim: sameCar ? d.trim : "Không rõ", accident: c.accident, flood: c.flood, owners: c.owners, targetId: $("target").value, step: 6, quote: null });
    var m = TU.findModel(models, d.targetId);
    if (!TU.activeEditions(m).some(function (e) { return e.edition_code === d.edition; })) d.edition = TU.defaultEdition(m);
    Store.save();
    var body = $("resultBody"), label = d.brand + " " + d.model + " " + year, my = ++seq;
    $("heroCar").firstChild.textContent = label + " ";
    body.innerHTML = '<div class="big">Đang tính…</div><div class="skeleton" style="margin:22px 0 12px"></div><div class="skeleton" style="width:68%"></div>';
    TU.api.valuate(TU.quoteBody(d)).then(function (r) {
      if (my !== seq) return;
      var data = r.data || {};
      if (r.status !== 200 || !data.ok) { body.innerHTML = warn("Hệ thống chưa tính được lúc này, bạn thử lại sau ít phút."); return; }
      UI.setSynthetic(data.is_synthetic);
      d.quote = data; Store.save(); last = data;
      show(data, label, km, scroll);
    }, function () {
      if (my !== seq) return;
      body.innerHTML = warn("Chưa kết nối được máy chủ TradeUp (" + esc(TU.api.base()) + "). Chạy “uvicorn src.main:app” rồi thử lại.");
    });
    return true;
  }
  function warn(html) { return '<div class="note warn" style="margin-top:12px">' + I("alert") + "<span>" + html + "</span></div>"; }
  function show(data, label, km, scroll) {
    var o = TU.outcome(data), v = o.valuation, t = o.topup, body = $("resultBody");
    $("resultCard").classList.remove("reveal"); void $("resultCard").offsetWidth; $("resultCard").classList.add("reveal");
    if (data.status === "chua_du_du_lieu") {
      body.innerHTML = warn(esc(v.user_message)) + '<a class="btn block" href="flow.html#/book">Đặt lịch thẩm định ' + I("arrow") + "</a>";
      $("heroMonthly").textContent = "—"; $("heroHint").textContent = "Chưa đủ dữ liệu để ước tính"; $("eqUsed").textContent = ""; $("eqTop").textContent = "";
      return;
    }
    if (data.status === "can_hoi_lai") {
      var ra = v.reask || {}, c = (ra.conflicts || [])[0], q = (ra.questions || [])[0];
      var sugg = c && c.suggestions ? c.suggestions.slice(0, 3).map(function (x) { return '<button class="btn sm light" type="button" data-sugg="' + esc(x.model) + '" data-brand="' + esc(x.brand) + '">' + esc(x.brand + " " + x.model) + "</button>"; }).join("") : "";
      body.innerHTML = warn(esc(c ? c.question : q ? q.question : v.user_message)) + (sugg ? '<div class="agent-actions">' + sugg + "</div>" : "") + '<a class="btn block" href="flow.html#/intake">Khai từng bước với trợ lý ' + I("arrow") + "</a>";
      return;
    }
    body.innerHTML = '<div class="big">' + TU.fmtVnd(v.offer_suggested_vnd) + '</div><p class="range-line">Khoảng ' + TU.fmtRange(v.offer_low_vnd, v.offer_high_vnd) + " · Ước tính từ giá rao</p>" +
      UI.rangeBar({ min: v.offer_low_vnd * 0.94, max: v.offer_high_vnd * 1.06, low: v.offer_low_vnd, high: v.offer_high_vnd, marker: v.offer_suggested_vnd, label: "Khoảng giá đề xuất " + TU.fmtRange(v.offer_low_vnd, v.offer_high_vnd) }) +
      '<div class="info">' + I("info") + "<span>" + esc(label) + ", " + TU.fmtInt(km) + " km. " + v.comparable_count + " xe tương đồng, " + esc(v.comps_source) + ", dữ liệu ngày " + TU.fmtDate(v.data_date) + ". " + esc(v.provisional_label) + ".</span></div>" +
      (v.confidence === "low" ? warn(esc((v.confidence_notes || []).join(" "))) : "") +
      '<div class="sub"><small>Cần bù ước tính lên ' + esc(t.target_model + " " + t.target_variant) + " (chưa gồm phí lăn bánh)</small><b>" + (t.topup_max_vnd === 0 ? "Không cần bù" : TU.fmtVnd(t.topup_suggested_vnd)) + "</b><small>Khoảng " + TU.fmtRange(t.topup_min_vnd, t.topup_max_vnd) + ". " + esc(t.loan_label) + ". Tháng đầu " + TU.fmtVnd(t.monthly_payment_suggested_vnd) + " (các tháng sau giảm dần), tháng cuối " + TU.fmtVnd(t.last_payment_suggested_vnd) + ", tổng lãi " + TU.fmtVnd(t.total_interest_suggested_vnd) + " · trả trước " + t.down_payment_pct + "% · " + t.term_months + " tháng · lãi " + TU.fmtPct(t.annual_rate_pct) + "/năm (cập nhật " + TU.fmtDate(t.rate_date) + ")</small></div>" +
      '<a class="btn block" href="flow.html#/result">Xem chi tiết &amp; đặt lịch ' + I("arrow") + "</a>";
    $("heroMonthly").textContent = TU.fmtVnd(t.monthly_payment_suggested_vnd);
    $("heroHint").textContent = "Ước tính · tháng đầu · " + t.term_months + " tháng · trả trước " + t.down_payment_pct + "%";
    $("eqList").textContent = TU.fmtTr(t.list_price_vnd);
    $("eqPromo").textContent = TU.fmtTr((t.incentives || {}).total_discount_vnd || 0);
    $("eqUsed").textContent = TU.fmtTrRange(v.offer_low_vnd, v.offer_high_vnd);
    $("eqTop").textContent = t.topup_max_vnd === 0 ? "0" : TU.fmtTrRange(t.topup_min_vnd, t.topup_max_vnd);
    $("formHint").firstChild.textContent = "Số do engine TradeUp tính trên máy chủ, tạm tính; thẩm định viên chốt giá chính thức. Muốn tả xe kỹ hơn? ";
    if (scroll && window.matchMedia("(max-width: 900px)").matches) $("resultCard").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  $("resultBody").addEventListener("click", function (e) {
    var b = e.target.closest("[data-sugg]"); if (!b) return;
    $("brand").value = b.dataset.brand; fillModels(); $("model").value = b.dataset.sugg; calculate(false);
  });
  $("tradeForm").addEventListener("submit", function (e) { e.preventDefault(); calculate(true); });
  $("heroChat").addEventListener("click", function () { TUChat.open(null); });

  $("navMenu").addEventListener("click", function () {
    var open = $("navlinks").classList.toggle("open");
    this.setAttribute("aria-expanded", open); this.setAttribute("aria-label", open ? "Đóng menu" : "Mở menu");
  });
  $("navlinks").addEventListener("click", function (e) { if (e.target.tagName === "A") { $("navlinks").classList.remove("open"); $("navMenu").setAttribute("aria-expanded", "false"); } });

  UI.mountMap();
  boot();
})();
