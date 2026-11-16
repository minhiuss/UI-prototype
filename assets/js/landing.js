/* TradeUp landing: quick estimator on the page, handing off to flow.html for the full result. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var s = Store.get(), d = s.draft, esc = TU.esc;
  var COND = { good: { accident: "none", flood: "no", owners: "1" }, normal: { accident: "light", flood: "no", owners: "2" }, rough: { accident: "heavy", flood: "no", owners: "2" } };

  function fill(sel, values, current, labeler) {
    sel.innerHTML = values.map(function (v) { return '<option value="' + esc(v) + '"' + (v === current ? " selected" : "") + ">" + esc(labeler ? labeler(v) : v) + "</option>"; }).join("");
  }
  function fillModels() { fill($("model"), Object.keys(TU.USED[$("brand").value]).concat(["Khác"]), d.model, function (v) { return v === "Khác" ? "Dòng khác" : v; }); }

  fill($("brand"), Object.keys(TU.USED), d.brand || "Toyota");
  fillModels();
  fill($("target"), TU.VINFAST.map(function (m) { return m.name; }), d.target, function (v) { return v + " · " + TU.vinfast(v).desc; });
  if (d.year) $("year").value = d.year;
  if (d.km !== "") $("km").value = TU.fmtInt(d.km);
  $("brand").addEventListener("change", fillModels);

  $("km").addEventListener("input", function (e) {
    var n = e.target.value.replace(/\D/g, "");
    e.target.value = n ? TU.fmtInt(Number(n)) : "";
  });

  function renderModels() {
    $("modelGrid").innerHTML = TU.VINFAST.map(function (m) {
      return '<button class="model" type="button" data-model="' + m.name + '" aria-pressed="' + (m.name === d.target) + '"><img src="' + m.img + '" width="120" height="82" loading="lazy" alt=""><strong>' + m.name + "</strong><small>" + m.desc + '</small><small class="from">' + TU.fmtInt(m.price) + " triệu*</small></button>";
    }).join("");
    $("heroModel").textContent = d.target;
    var m = TU.vinfast(d.target);
    $("eqList").textContent = TU.fmtTr(m.price);
    $("eqPromo").textContent = TU.fmtTr(m.promo);
  }
  function setTarget(name, recalc) {
    d.target = name; $("target").value = name; Store.save(); renderModels();
    if (recalc && last) calculate(false);
  }
  $("modelGrid").addEventListener("click", function (e) {
    var b = e.target.closest("[data-model]"); if (!b) return;
    setTarget(b.dataset.model, true);
    UI.toast("Đã chọn " + b.dataset.model + " cho phép tính");
  });
  $("target").addEventListener("change", function (e) { setTarget(e.target.value, true); });

  var last = null;
  function invalid(el, msg) { el.setAttribute("aria-invalid", "true"); $("formError").textContent = msg; el.focus(); return false; }

  function calculate(scroll) {
    ["year", "km", "model"].forEach(function (id) { $(id).removeAttribute("aria-invalid"); });
    $("formError").textContent = "";
    var year = Number($("year").value), km = Number($("km").value.replace(/\D/g, ""));
    if (!year || year < 1990 || year > TU.NOW_YEAR) return invalid($("year"), "Năm sản xuất cần nằm trong khoảng 1990–" + TU.NOW_YEAR + ".");
    if ($("km").value.trim() === "") return invalid($("km"), "Nhập số km xe đã đi, ví dụ 62.000.");
    var c = COND[$("condition").value];
    Object.assign(d, { brand: $("brand").value, model: $("model").value, year: year, km: km, trim: d.trim || "Không rõ", accident: c.accident, flood: c.flood, owners: c.owners, target: $("target").value, step: 5, kmConfirmed: false });
    Store.save();
    var est = TU.estimate(Store.carOf(d)), body = $("resultBody"), label = d.brand + " " + (d.model === "Khác" ? "(dòng khác)" : d.model) + " " + year;
    last = est;
    $("heroCar").firstChild.textContent = label + " ";
    $("resultCard").classList.remove("reveal"); void $("resultCard").offsetWidth; $("resultCard").classList.add("reveal");
    if (!est.ok) {
      body.innerHTML = '<div class="note warn" style="margin-top:12px">' + UI.icon("alert") + "<span>Chưa đủ dữ liệu để ước tính xe này: " + esc(est.reason) + ' Thẩm định viên vẫn có thể định giá trực tiếp cho bạn.</span></div><a class="btn block" href="flow.html#/book">Đặt lịch thẩm định ' + UI.icon("arrow") + "</a>";
      $("heroMonthly").textContent = "—"; $("heroHint").textContent = "Chưa đủ dữ liệu để ước tính";
      $("eqUsed").textContent = ""; $("eqTop").textContent = "";
      return true;
    }
    var top = TU.topUp(est, d.target), mo = TU.monthly(top, d.down, d.term), warn = TU.kmCheck(year, km);
    body.innerHTML = '<div class="big">' + TU.fmtRange(est.low, est.high) + "</div>" +
      UI.rangeBar({ min: est.low * 0.9, max: est.listing * 1.03, low: est.low, high: est.high, ticks: [{ v: est.listing, label: "Giá rao " + TU.fmtInt(est.listing) }], label: "Khoảng giá thu mua " + TU.fmtRange(est.low, est.high) + ", giá rao trung vị " + TU.fmtTr(est.listing) }) +
      '<div class="info">' + UI.icon("info") + "<span>" + esc(label) + ", " + TU.fmtInt(km) + " km. Dựa trên " + est.compsCount + " xe tương đồng, dữ liệu mẫu ngày " + est.dataDate + ". Cần thẩm định thực tế để xác nhận.</span></div>" +
      (warn ? '<div class="note warn" style="margin-top:12px">' + UI.icon("alert") + "<span>" + esc(warn) + "</span></div>" : "") +
      '<div class="sub"><small>Khoản bù ước tính lên ' + esc(d.target) + "</small><b>" + (top.high === 0 ? "Không cần bù" : TU.fmtRange(top.low, top.high)) + "</b><small>Trả góp minh họa: khoảng " + TU.fmtMonthly(mo) + "/tháng · trả trước " + d.down + "% · " + d.term + " tháng · lãi suất giả định " + TU.fmtRate() + '</small></div><a class="btn block" href="flow.html#/result">Xem chi tiết &amp; đặt lịch ' + UI.icon("arrow") + "</a>";
    $("heroMonthly").textContent = "≈ " + TU.fmtMonthly(mo);
    $("heroHint").textContent = "Tạm tính · " + d.term + " tháng · trả trước " + d.down + "%";
    $("eqUsed").textContent = TU.fmtRange(est.low, est.high);
    $("eqTop").textContent = top.high === 0 ? "0" : TU.fmtRange(top.low, top.high);
    $("formHint").firstChild.textContent = "Đã tính kết quả minh họa. Giá xe, ưu đãi và lãi suất trong bản thử không phải dữ liệu giao dịch thực tế. Muốn tả xe kỹ hơn? ";
    if (scroll && window.matchMedia("(max-width: 900px)").matches) $("resultCard").scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  }
  $("tradeForm").addEventListener("submit", function (e) { e.preventDefault(); calculate(true); });

  $("navMenu").addEventListener("click", function () {
    var open = $("navlinks").classList.toggle("open");
    this.setAttribute("aria-expanded", open); this.setAttribute("aria-label", open ? "Đóng menu" : "Mở menu");
  });
  $("navlinks").addEventListener("click", function (e) { if (e.target.tagName === "A") { $("navlinks").classList.remove("open"); $("navMenu").setAttribute("aria-expanded", "false"); } });

  renderModels();
  UI.mountMap();
})();
