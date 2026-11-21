/* TradeUp appraiser desk: A1 case list, A2 case detail + official price, A3 confirmation.
   Cases are local (no case API yet); the reference range is the engine snapshot saved at booking (store.js). VND integers. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var s = Store.get(), esc = TU.esc, I = UI.icon;
  var view = $("view"), sheet = $("sheet");
  var filter = { day: "today", status: "waiting" }, sort = { key: "time", dir: 1 };
  var REASONS = ["Tình trạng máy, gầm", "Giấy tờ, pháp lý", "Hư hỏng chưa khai báo", "Xe đẹp hơn mô tả", "Thị trường thay đổi"];
  var STATUS = { waiting: ["wait", "Chờ thẩm định"], done: ["done", "Đã chốt giá"], cancelled: ["off", "Đã hủy"] };

  sheet.addEventListener("click", function (e) { if (e.target === sheet || e.target.closest("[data-close]")) sheet.close(); });
  function baseline(c) { return c.estimate.ok ? TU.fmtRange(c.estimate.low, c.estimate.high) : "Chưa có"; }

  /* ---------- A1 ---------- */
  function list() {
    var all = Object.keys(s.cases).map(function (k) { return s.cases[k]; });
    var rows = all.filter(function (c) { return (filter.day === "all" || c.booking.date === Store.today()) && (filter.status === "all" || c.status === filter.status); });
    var val = { code: function (c) { return c.id; }, time: function (c) { return c.booking.date + c.booking.time; }, base: function (c) { return c.estimate.ok ? c.estimate.low : 0; }, status: function (c) { return c.status; } };
    rows.sort(function (a, b) { var x = val[sort.key](a), y = val[sort.key](b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
    var th = function (key, label) { return '<th scope="col"' + (sort.key === key ? ' aria-sort="' + (sort.dir === 1 ? "ascending" : "descending") + '"' : "") + '><button type="button" data-sort="' + key + '">' + label + I("chevron") + "</button></th>"; };
    var waiting = all.filter(function (c) { return c.status === "waiting" && c.booking.date === Store.today(); }).length;
    var body = rows.map(function (c) {
      var href = "#/case/" + c.id, st = STATUS[c.status];
      return '<tr><td><a class="code" href="' + href + '">' + c.id + '</a></td><td><a href="' + href + '">' + esc(Store.carLabel(c.car)) + ' <span class="to">→ ' + esc(c.target) + '</span></a></td><td><a href="' + href + '">' + c.booking.time + (filter.day === "all" ? ", " + Store.viDate(c.booking.date) : "") + '</a></td><td><a href="' + href + '">' + baseline(c) + '</a></td><td><a href="' + href + '"><span class="pill ' + st[0] + '">' + st[1] + "</span></a></td></tr>";
    }).join("");
    var empty = all.length && (filter.day !== "today" || filter.status !== "waiting" || all.some(function (c) { return c.booking.date === Store.today(); }))
      ? "<h2>Không có hồ sơ nào khớp bộ lọc</h2><p>Thử đổi ngày hoặc trạng thái để xem các hồ sơ khác.</p><button class=\"btn outline\" type=\"button\" id=\"clearFilter\">Xem tất cả hồ sơ</button>"
      : "<h2>Chưa có hồ sơ nào hôm nay</h2><p>Hồ sơ mới sẽ hiện ở đây khi khách đặt lịch.</p>";
    view.innerHTML = '<div class="view"><div class="desk-head"><div><h1>Hồ sơ đổi xe</h1><p>' + (waiting ? waiting + " hồ sơ chờ thẩm định hôm nay" : "Không còn hồ sơ chờ hôm nay") + '</p></div><div class="filters"><label class="sr-only" for="fDay">Ngày</label><select class="input" id="fDay"><option value="today">Hôm nay</option><option value="all">Mọi ngày</option></select><label class="sr-only" for="fStatus">Trạng thái</label><select class="input" id="fStatus"><option value="waiting">Chờ thẩm định</option><option value="done">Đã chốt</option><option value="cancelled">Đã hủy</option><option value="all">Mọi trạng thái</option></select></div></div>' +
      (rows.length ? '<div class="tablewrap"><table class="cases"><thead><tr>' + th("code", "Mã") + '<th scope="col">Xe cũ → VinFast</th>' + th("time", "Hẹn") + th("base", "Giá tham chiếu") + th("status", "Trạng thái") + "</tr></thead><tbody>" + body + "</tbody></table></div>" : '<div class="panel empty">' + I("calendar") + empty + "</div>") + "</div>";
    $("fDay").value = filter.day; $("fStatus").value = filter.status;
    $("fDay").onchange = function (e) { filter.day = e.target.value; list(); };
    $("fStatus").onchange = function (e) { filter.status = e.target.value; list(); };
    if ($("clearFilter")) $("clearFilter").onclick = function () { filter = { day: "all", status: "all" }; list(); };
  }
  view.addEventListener("click", function (e) {
    var b = e.target.closest("[data-sort]"); if (!b) return;
    sort = { key: b.dataset.sort, dir: sort.key === b.dataset.sort ? -sort.dir : 1 }; list();
  });

  /* ---------- A2 ---------- */
  function detail(id) {
    var c = s.cases[id];
    if (!c) { view.innerHTML = '<div class="view panel empty">' + I("search") + "<h2>Không tìm thấy hồ sơ " + esc(id) + '</h2><p>Hồ sơ có thể đã bị xóa khi đặt lại dữ liệu thử.</p><a class="btn" href="#/">Về danh sách hồ sơ</a></div>'; return; }
    var e = c.estimate, car = c.car, st = STATUS[c.status], locked = c.status !== "waiting";
    var dmg = (car.damages || []).map(function (x) { return '<label class="check"><input type="checkbox" checked disabled><span>' + esc(x.part) + " · " + esc(x.type) + " · " + esc(x.level) + "</span></label>"; }).join("");
    var extra = (c.extra || []).map(function (x) { return '<label class="check"><input type="checkbox" checked disabled><span>' + esc(x) + " (thẩm định viên thêm)</span></label>"; }).join("");
    var n = c.photoCount || 0, thumbs = "";
    for (var i = 0; i < n; i++) thumbs += "<div>Ảnh " + (i + 1) + "</div>";
    var left = '<section class="panel"><h2>Ảnh khách gửi</h2>' + (n ? '<div class="thumbs">' + thumbs + '</div><p class="audit">Bản thử không lưu ảnh thật.</p>' : '<p class="thumbs none">Khách chưa gửi ảnh.</p>') +
      '<h2 style="margin-top:18px">Phát hiện · khách đã xác nhận</h2>' + (dmg || '<p class="audit" style="margin:0">Không có hư hỏng nào được khai.</p>') + extra +
      (locked ? "" : '<form id="extraForm" style="display:flex;gap:8px;margin-top:8px"><label class="sr-only" for="extraIn">Hư hỏng thẩm định viên thêm</label><input class="input" id="extraIn" type="text" autocomplete="off" placeholder="Thêm phát hiện tại chỗ" style="font-size:16px;font-weight:500;min-height:48px"><button class="btn sm outline" type="submit">Thêm</button></form>') +
      '<h2 style="margin-top:18px">Khai báo</h2><p>' + [TU.ACCIDENT[car.accident], TU.FLOOD[car.flood], TU.OWNERS[car.owners]].map(function (x) { return x ? x.label : ""; }).filter(Boolean).join(", ") + '.</p><h2 style="margin-top:18px">Lịch hẹn</h2><p class="num">' + c.booking.time + ", " + Store.viDate(c.booking.date) + " · " + esc(c.booking.dealer) + "</p><p>" + esc(c.booking.name) + " · " + esc(c.booking.phone) + "</p></section>";
    var base = e.ok
      ? '<section class="panel"><h2>Khoảng giá tham chiếu <span class="tag">Ước tính từ giá rao</span></h2><div class="figure" style="text-decoration:none;cursor:default">' + TU.fmtVnd(e.suggested) + '</div><p class="range-line">Khoảng ' + TU.fmtRange(e.low, e.high) + '</p><div id="bar">' + bar(e, c.official ? c.official.price : null) + '</div><ul class="explain">' + (e.explanation || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + '</ul><p class="audit">' + e.compsCount + " xe tương đồng · " + esc(e.source) + " · dữ liệu ngày " + TU.fmtDate(e.dataDate) + (e.synthetic ? " · dữ liệu mẫu" : "") + "</p></section>"
      : '<section class="panel"><h2>Khoảng giá tham chiếu</h2><div class="note warn">' + I("alert") + "<span>Chưa có khoảng giá tham chiếu: " + esc(e.reason) + " Định giá trực tiếp và ghi lý do.</span></div></section>";
    var price = locked
      ? '<section class="panel">' + (c.official ? '<h2>Giá chính thức</h2><div class="official"><b>' + TU.fmtVnd(c.official.price) + "</b><span>" + esc(c.official.by) + " chốt lúc " + esc(c.official.at) + (c.official.reason ? ". Lý do: " + esc(c.official.reason) : "") + "</span><span>" + (c.inspected ? "Đã thẩm định xe trực tiếp." : "Chưa thẩm định xe trực tiếp (chốt giá theo hồ sơ).") + "</span></div>" : '<h2>Hồ sơ đã hủy</h2><p class="audit" style="margin:0">Khách đã hủy lịch hẹn, không chốt giá được.</p>') + "</section>"
      : '<section class="panel"><h2><label for="price">Giá chính thức</label></h2><form id="priceForm" novalidate><div class="price-in"><input class="input" id="price" type="text" inputmode="numeric" autocomplete="off" placeholder="' + (e.ok ? TU.fmtInt(e.suggested) : "0") + '"><span style="font-weight:750">đ</span></div><div class="delta" id="delta" aria-live="polite"></div><div id="reasonWrap" hidden><label class="field-label" for="reason" style="margin-top:8px">Lý do ngoài khoảng tham chiếu</label><select class="input" id="reason"><option value="">Chọn lý do</option>' + REASONS.map(function (r) { return "<option>" + r + "</option>"; }).join("") + '</select></div><div class="field-err" id="priceErr" role="alert"></div><label class="check" style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="inspected"> <span>Đã thẩm định xe trực tiếp</span></label><button class="btn block" type="submit">Chốt giá</button></form></section>';
    view.innerHTML = '<div class="view"><div class="desk-head"><div><p><a class="link" href="#/">' + "Hồ sơ đổi xe</a> / " + c.id + "</p><h1>" + esc(Store.carLabel(car)) + '</h1><p class="num">' + TU.fmtInt(car.km) + " km · đổi sang " + esc(c.target) + '</p></div><span class="pill ' + st[0] + '">' + st[1] + '</span></div><div class="case-grid">' + left + '<div class="stack">' + base + price + "</div></div></div>";

    if ($("extraForm")) $("extraForm").onsubmit = function (ev) { ev.preventDefault(); var v = $("extraIn").value.trim(); if (!v) return; (c.extra = c.extra || []).push(v); Store.save(); detail(id); };
    if (!$("priceForm")) return;
    var read = function () { return Number($("price").value.replace(/\D/g, "")); };
    $("price").oninput = function (ev) {
      var raw = ev.target.value.replace(/\D/g, ""); ev.target.value = raw ? TU.fmtInt(Number(raw)) : "";
      $("priceErr").textContent = ""; var p = read(), d = $("delta");
      if (!p || !e.ok) { d.textContent = ""; $("reasonWrap").hidden = e.ok; if (e.ok) $("bar").innerHTML = bar(e, null); return; }
      var out = p < e.low || p > e.high;
      d.className = "delta " + (out ? "out" : "in"); d.textContent = deltaText(p, e);
      $("reasonWrap").hidden = !out; $("bar").innerHTML = bar(e, p);
    };
    if (!e.ok) $("reasonWrap").hidden = false;
    $("priceForm").onsubmit = function (ev) {
      ev.preventDefault(); var p = read(), out = !e.ok || p < e.low || p > e.high;
      if (!p) { $("priceErr").textContent = "Nhập giá chính thức, đơn vị đồng, ví dụ 395.000.000."; $("price").focus(); return; }
      if (out && !$("reason").value) { $("priceErr").textContent = (e.ok ? "Giá nằm ngoài khoảng tham chiếu. " : "") + "Chọn lý do trước khi chốt."; $("reason").focus(); return; }
      confirm(c, p, out ? $("reason").value : "", $("inspected").checked);
    };
  }
  function bar(e, marker) {
    var lo = Math.min(e.low * 0.94, marker || Infinity), hi = Math.max(e.high * 1.06, marker || 0);
    return UI.rangeBar({ min: lo, max: hi, low: e.low, high: e.high, marker: marker, ticks: [{ v: e.suggested, label: "Đề xuất " + TU.fmtInt(e.suggested) }], label: "Khoảng tham chiếu " + TU.fmtRange(e.low, e.high) + (marker ? ", giá nhập " + TU.fmtVnd(marker) : "") });
  }
  function deltaText(p, e) {
    if (p >= e.low && p <= e.high) return "Trong khoảng tham chiếu";
    var edge = p < e.low ? e.low : e.high, pct = Math.abs((p - edge) / edge) * 100;
    return (p < e.low ? "−" : "+") + TU.fmtDec(pct) + "% " + (p < e.low ? "dưới" : "trên") + " khoảng";
  }

  /* ---------- A3 ---------- */
  function confirm(c, p, reason, inspected) {
    var e = c.estimate;
    sheet.innerHTML = '<div class="sheet-head"><h2>Chốt giá chính thức cho ' + c.id + '?</h2><button class="iconbtn" type="button" data-close aria-label="Đóng">' + I("x") + '</button></div><dl style="margin:0" class="num"><div class="kv"><dt>Giá chốt</dt><dd>' + TU.fmtVnd(p) + '</dd></div><div class="kv"><dt>Thẩm định xe</dt><dd>' + (inspected ? "Đã xem xe trực tiếp" : "Chưa thẩm định xe") + '</dd></div><div class="kv"><dt>Khoảng tham chiếu</dt><dd>' + baseline(c) + "</dd></div>" + (e.ok ? '<div class="kv"><dt>Chênh lệch</dt><dd>' + deltaText(p, e) + "</dd></div>" : "") + (reason ? '<div class="kv"><dt>Lý do</dt><dd>' + esc(reason) + "</dd></div>" : "") + '</dl><div class="note warn" style="margin-top:14px">' + I("alert") + '<span>Khách sẽ thấy giá này ngay. Lưu vết: người chốt, thời điểm, lý do. Không sửa được sau khi chốt.</span></div><div class="sheet-actions"><button class="btn outline" type="button" data-close>Quay lại</button><button class="btn" type="button" id="doConfirm">Xác nhận chốt</button></div>';
    sheet.showModal();
    $("doConfirm").onclick = function () {
      c.status = "done"; c.inspected = !!inspected; c.official = { price: p, by: "Thẩm định viên Demo", at: Store.nowStamp(), reason: reason };
      Store.save(); sheet.close(); detail(c.id); window.scrollTo(0, 0);
      UI.toast("Đã chốt " + TU.fmtVnd(p) + " cho " + c.id);
    };
  }

  function render() {
    if (sheet.open) sheet.close();
    var m = location.hash.match(/^#\/case\/(.+)$/);
    if (m) detail(decodeURIComponent(m[1])); else list();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", render);
  window.addEventListener("storage", function () { location.reload(); });
  UI.mountMap();
  render();
})();
