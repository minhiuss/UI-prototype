/* TradeUp customer flow: S2 intake, S3 processing, S4 result, S5 error, S6 photos, S7 booking + confirm, S8 tracking.
   Hash routes inside flow.html. All data is mock (see data.js). */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var s = Store.get(), d = s.draft, esc = TU.esc, I = UI.icon;
  var view = $("view"), sheet = $("sheet");
  var timers = [], photoUrls = {}, agentMsg = "", otherOpen = false, errorKind = "data", pendingSlot = "", editingDmg = -1, chatLog = [];
  var STEPS = ["brand", "model", "year", "trim", "km", "cond"];
  var QUESTIONS = ["Xe của bạn hãng gì?", "Dòng xe nào?", "Xe sản xuất năm nào?", "Phiên bản nào?", "Xe đã đi bao nhiêu km?", "Tình trạng xe thế nào?"];
  var SLOTS = ["Trước", "Sau", "Trái", "Phải", "Nội thất", "Đồng hồ km"];

  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  function car() { return Store.carOf(d); }
  function complete() { return d.brand && d.model && d.year && d.km !== "" && d.km != null; }
  function label() { return Store.carLabel(car()); }
  function bar(o) {
    $("barTitle").textContent = o.title; $("barSub").textContent = o.sub || "";
    $("barBack").onclick = o.back; $("barAction").innerHTML = o.action || "";
    $("barProgress").hidden = o.progress == null;
    if (o.progress != null) $("barProgress").firstElementChild.style.width = o.progress + "%";
    view.className = "app" + (o.wide ? " wide" : "");
  }
  function agent(msg, actions) {
    return '<div class="agent" role="status"><div class="agent-av" aria-hidden="true">T<span>U</span></div><div><p>' + msg + "</p>" + (actions ? '<div class="agent-actions">' + actions + "</div>" : "") + "</div></div>";
  }
  function openSheet(html) { sheet.innerHTML = html; if (!sheet.open) sheet.showModal(); }
  sheet.addEventListener("click", function (e) { if (e.target === sheet || e.target.closest("[data-close]")) sheet.close(); });
  function sheetHead(title) { return '<div class="sheet-head"><h2>' + title + '</h2><button class="iconbtn" type="button" data-close aria-label="Đóng">' + I("x") + "</button></div>"; }

  /* ---------- S2 intake ---------- */
  function firstMissing() {
    if (!d.brand) return 0; if (!d.model) return 1; if (!d.year) return 2; if (!d.trim) return 3; if (d.km === "" || d.km == null) return 4; return 5;
  }
  function intake() {
    var st = Math.max(0, Math.min(5, d.step || 0)), spec = TU.USED[d.brand], body = "", crumbs = "";
    bar({ title: "Bước " + (st + 1) + " / 6", sub: "Khai thông tin xe", progress: ((st + 1) / 6) * 100, back: function () { otherOpen = false; agentMsg = ""; if (st > 0) { d.step = st - 1; Store.save(); render(); } else location.href = "index.html"; } });
    [d.brand, d.model, d.year, d.trim, d.km !== "" && d.km != null ? TU.fmtInt(d.km) + " km" : ""].forEach(function (v, i) {
      if (v && i < st) crumbs += '<button class="crumb" type="button" data-act="jump" data-i="' + i + '" aria-label="Sửa ' + esc(v) + '">' + esc(v) + "</button>";
    });
    function choices(list, current, altLabel, cls) {
      var h = '<div class="choices ' + (cls || "") + '">';
      list.forEach(function (v) { h += '<button class="choice" type="button" data-act="pick" data-v="' + esc(v) + '" aria-pressed="' + (String(v) === String(current)) + '">' + esc(v) + "</button>"; });
      if (altLabel) h += '<button class="choice alt" type="button" data-act="other" aria-expanded="' + otherOpen + '">' + altLabel + "</button>";
      return h + "</div>";
    }
    function otherInput(ph, type) {
      return '<form class="stack" data-form="other" style="margin-top:14px" novalidate><label class="field-label" for="otherIn">' + ph + '</label><input class="input" id="otherIn" ' + (type === "number" ? 'type="number" inputmode="numeric" min="1990" max="' + TU.NOW_YEAR + '"' : 'type="text"') + ' autocomplete="off"><div class="field-err" id="otherErr" role="alert"></div><button class="btn" type="submit">Tiếp tục ' + I("arrow") + "</button></form>";
    }
    if (st === 0) { body = choices(Object.keys(TU.USED), d.brand, "Hãng khác") + (otherOpen ? otherInput("Tên hãng xe") : ""); }
    else if (st === 1) { body = spec ? choices(Object.keys(spec), d.model, "Dòng khác") + (otherOpen ? otherInput("Tên dòng xe") : "") : otherInput("Tên dòng xe"); }
    else if (st === 2) { var ys = []; for (var y = TU.NOW_YEAR; y >= TU.NOW_YEAR - 14; y--) ys.push(y); body = choices(ys, d.year, "Cũ hơn", "cols-3") + (otherOpen ? otherInput("Năm sản xuất", "number") : ""); }
    else if (st === 3) { var tr = spec && spec[d.model] ? spec[d.model].trims : []; body = choices(tr.concat(["Tôi không rõ"]), d.trim === "Không rõ" ? "Tôi không rõ" : d.trim); }
    else if (st === 4) {
      body = '<form data-form="km" novalidate><label class="sr-only" for="kmIn">Số km đã đi</label><div class="input-wrap"><input class="input num" id="kmIn" type="text" inputmode="numeric" autocomplete="off" placeholder="62.000" value="' + (d.km !== "" && d.km != null ? TU.fmtInt(d.km) : "") + '"><span class="unit">km</span></div><div class="field-err" id="kmErr" role="alert"></div><div id="kmAgent"></div><div class="actions"><button class="btn" type="submit">Tiếp tục ' + I("arrow") + "</button></div></form>";
    } else {
      var grp = function (key, name, opts) {
        var h = '<div class="group" id="g-' + key + '" role="radiogroup" aria-labelledby="gl-' + key + '"><span class="glabel" id="gl-' + key + '">' + name + '</span><div class="choices">';
        Object.keys(opts).forEach(function (k) { h += '<button class="choice" type="button" role="radio" data-act="cond" data-k="' + key + '" data-v="' + k + '" aria-checked="' + (d[key] === k) + '">' + opts[k].label + "</button>"; });
        return h + "</div></div>";
      };
      body = grp("accident", "Va chạm", TU.ACCIDENT) + grp("flood", "Ngập nước", TU.FLOOD) + grp("owners", "Số đời chủ", TU.OWNERS) + '<div id="condAgent"></div><div class="actions"><button class="btn" type="button" data-act="finish">Xem khoảng giá ' + I("arrow") + "</button></div>";
    }
    view.innerHTML = '<div class="view"><div class="crumbs">' + crumbs + "</div><h1>" + QUESTIONS[st] + "</h1>" + (st === 3 ? '<p class="lead">Thường ghi trên đăng kiểm hoặc đuôi xe. Không rõ cũng không sao.</p>' : '<div style="height:12px"></div>') + body + (agentMsg ? agent(agentMsg) : "") +
      '<div class="free"><label class="field-label" for="freeIn">Hoặc gõ tự do</label><form data-form="free"><input class="input" id="freeIn" type="text" autocomplete="off" placeholder="Vios 2019 bản G, 6 vạn"><button class="btn" type="submit" aria-label="Gửi mô tả">' + I("send") + "</button></form><small>Trợ lý tách thông tin giúp bạn và hỏi lại phần còn thiếu.</small></div></div>";
    agentMsg = "";
    var f = $("otherIn") || (st === 4 && $("kmIn")); if (f && (otherOpen || st === 4 || (st === 1 && !spec))) f.focus();
  }
  function setField(st, v) {
    if (st === 0 && v !== d.brand) { d.brand = v; d.model = ""; d.trim = ""; }
    else if (st === 1 && v !== d.model) { d.model = v; d.trim = ""; }
    else if (st === 2) { d.year = Number(v); d.kmConfirmed = false; }
    else if (st === 3) d.trim = v === "Tôi không rõ" ? "Không rõ" : v;
    otherOpen = false; d.step = Math.min(5, st + 1); Store.save(); render();
  }

  /* ---------- S3 processing ---------- */
  function processing() {
    if (!complete()) return emptyState();
    bar({ title: label(), sub: TU.fmtInt(d.km) + " km", back: function () { go("#/intake"); } });
    var items = ["Đã hiểu thông tin xe", "Tìm xe tương đồng đang rao", "Áp ưu đãi đổi xe VinFast", "Tính tiền bù và trả góp"];
    view.innerHTML = '<div class="view proc"><div class="spinner" aria-hidden="true"></div><h1 role="status">Đang tính...</h1><ul class="proc-list">' + items.map(function (t, i) { return '<li class="' + (i === 0 ? "doing" : "") + '"><span class="dot">' + I("check") + "</span>" + t + "</li>"; }).join("") + '</ul><p class="lead" style="margin-inline:auto">Thường mất 5–15 giây. Dữ liệu bạn nhập đã được lưu.</p></div>';
    var lis = view.querySelectorAll(".proc-list li"), est = TU.estimate(car());
    var stopAt = s.simulateError ? 1 : est.ok ? 4 : 2;
    for (var i = 0; i < stopAt; i++) (function (i) {
      timers.push(setTimeout(function () { lis[i].className = "ok"; if (lis[i + 1] && i + 1 < stopAt) lis[i + 1].className = "doing"; }, 650 * (i + 1)));
    })(i);
    timers.push(setTimeout(function () {
      if (s.simulateError) { errorKind = "system"; go("#/error"); }
      else if (!est.ok) { errorKind = "data"; go("#/error"); }
      else go("#/result");
    }, 650 * stopAt + 450));
  }

  /* ---------- S5 error ---------- */
  function errorView() {
    if (!complete()) return emptyState();
    bar({ title: label(), back: function () { go("#/intake"); } });
    var est = TU.estimate(car());
    if (errorKind === "system" || est.ok) {
      view.innerHTML = '<div class="view"><h1>Hệ thống đang bận</h1><p class="lead">Chưa tính được lúc này, bạn thử lại sau ít phút. Thông tin xe bạn đã nhập vẫn được giữ.</p><div class="actions"><button class="btn" type="button" data-act="retry">Thử lại</button><a class="btn outline" href="#/book">Đặt lịch thẩm định</a></div>' + (s.simulateError ? '<p class="lead" style="margin-top:18px">Bạn đang bật "Giả lập lỗi hệ thống" trong Sơ đồ màn hình. Tắt đi để tính bình thường.</p>' : "") + "</div>";
    } else {
      view.innerHTML = '<div class="view"><h1>Chưa đủ dữ liệu để ước tính xe này</h1><p class="lead">Lý do: ' + esc(est.reason) + '</p><div class="note">' + I("usercheck") + '<span>Thẩm định viên vẫn có thể định giá trực tiếp cho bạn tại đại lý.</span></div><div class="actions"><a class="btn" href="#/book">Đặt lịch thẩm định ' + I("arrow") + '</a><a class="btn outline" href="#/intake">Sửa thông tin xe</a></div></div>';
    }
  }
  function emptyState() {
    bar({ title: "TradeUp", back: function () { location.href = "index.html"; } });
    view.innerHTML = '<div class="view empty">' + I("car") + '<h1>Chưa có thông tin xe</h1><p>Khai xe cũ của bạn trước, mất khoảng 1 phút. Xe hãng nào cũng được.</p><a class="btn" href="#/intake">Bắt đầu khai thông tin ' + I("arrow") + "</a></div>";
  }

  /* ---------- S4 result ---------- */
  function result() {
    if (!complete()) return emptyState();
    var est = TU.estimate(car());
    if (!est.ok) { errorKind = "data"; return errorView(); }
    bar({ title: label(), sub: TU.fmtInt(d.km) + " km", wide: true, back: function () { location.href = "index.html"; }, action: '<a class="btn sm" href="#/intake" data-act="editcar">Sửa</a>' });
    var top = TU.topUp(est, d.target), mo = TU.monthly(top, d.down, d.term), m = top.model, warn = !d.kmConfirmed && TU.kmCheck(d.year, d.km);
    var targets = TU.VINFAST.map(function (v) { return '<button class="target" type="button" data-act="target" data-v="' + v.name + '" aria-pressed="' + (v.name === d.target) + '"><img src="' + v.img + '" alt="" width="96" height="52">' + v.name + "</button>"; }).join("");
    var terms = TU.LOAN.terms.map(function (t) { return '<option value="' + t + '"' + (t === Number(d.term) ? " selected" : "") + ">" + t + " tháng</option>"; }).join("");
    var nPhotos = Object.keys(d.photos || {}).filter(function (k) { return d.photos[k] === "ok"; }).length;
    view.innerHTML = '<div class="view"><div class="result-grid">' +
      '<section class="panel reveal" aria-labelledby="h-used"><h2 id="h-used">Xe cũ · giá thu mua tạm tính</h2><button class="figure" type="button" data-act="src" data-k="used" aria-label="' + TU.fmtRange(est.low, est.high) + ', xem cơ sở tính">' + TU.fmtRange(est.low, est.high) + "</button>" +
      UI.rangeBar({ min: est.low * 0.9, max: est.listing * 1.03, low: est.low, high: est.high, ticks: [{ v: est.listing, label: "Giá rao trung vị " + TU.fmtInt(est.listing) }], label: "Khoảng giá thu mua so với giá rao trung vị " + TU.fmtTr(est.listing) }) +
      '<div class="note warn" style="margin-top:14px">' + I("alert") + "<span>Tạm tính. Giá chính thức do thẩm định viên chốt sau khi xem xe.</span></div>" +
      (warn ? '<div class="note warn" style="margin-top:8px">' + I("alert") + "<span>" + esc(warn) + ' <a class="link" href="#/intake" data-act="editkm">Sửa số km</a></span></div>' : "") +
      '<p class="why">Vì sao? ' + est.compsCount + " xe tương đồng, dữ liệu ngày " + est.dataDate + (est.photo ? ", đã trừ " + TU.fmtTr(est.photo) + " hư hỏng từ ảnh" : "") + ' <button class="link" type="button" data-act="src" data-k="used" style="border:0;background:none;padding:10px 0">Xem cơ sở tính</button></p></section>' +

      '<section class="panel" aria-labelledby="h-to"><h2 id="h-to">Đổi sang VinFast</h2><div class="targets" role="group" aria-label="Chọn mẫu VinFast">' + targets + '</div><ul class="ledger">' +
      '<li><button type="button" data-act="src" data-k="list"><span class="k">Giá niêm yết ' + m.name + '</span><span class="v">' + TU.fmtTr(top.list) + "</span></button></li>" +
      '<li><button type="button" data-act="src" data-k="promo"><span class="k">Ưu đãi đổi xe<small>' + TU.PROMO.wave + ", hiệu lực đến " + TU.PROMO.validTo + '</small></span><span class="v">− ' + TU.fmtTr(top.promo) + "</span></button></li>" +
      '<li><button type="button" data-act="src" data-k="used"><span class="k">Xe cũ (tạm tính)</span><span class="v">− ' + TU.fmtRange(est.low, est.high) + "</span></button></li>" +
      '<li class="total"><button type="button" data-act="src" data-k="top"><span class="k">Cần bù</span><span class="v">' + (top.high === 0 ? "Không cần bù" : TU.fmtRange(top.low, top.high)) + "</span></button></li></ul></section>" +

      '<section class="panel navy on-dark span" aria-labelledby="h-loan"><h2 id="h-loan">Trả góp</h2><div class="result-grid" style="gap:8px 32px"><div><div class="loan-row"><label for="down">Trả trước</label><output id="downOut" for="down">' + d.down + "% · " + TU.fmtRange(Math.round(top.low * d.down / 100), Math.round(top.high * d.down / 100)) + '</output><input type="range" id="down" min="0" max="70" step="5" value="' + d.down + '"></div><div class="loan-row"><label for="term">Kỳ hạn</label><span></span><select class="input" id="term" style="grid-column:1/-1">' + terms + '</select></div></div><div><div class="monthly" aria-live="polite"><small>Mỗi tháng, tạm tính</small><button class="figure" type="button" data-act="src" data-k="loan" id="moOut">≈ ' + TU.fmtMonthly(mo) + '</button></div><div class="note">' + I("info") + "<span>Lãi suất minh họa " + TU.fmtRate() + ", ngày " + TU.LOAN.date + ". Ngân hàng và đại lý xác nhận mức thật.</span></div></div></div></section>" +

      '<section class="span"><div class="note">' + I("info") + '<span>TradeUp không thấy được máy, gầm và giấy tờ xe. Ưu đãi có thể thay đổi, đại lý xác nhận lần cuối.</span></div><div class="stickybar"><a class="btn outline" href="#/photos">' + I("camera") + "<span>" + (nPhotos ? "Ảnh xe (" + nPhotos + ")" : "Thêm ảnh để giá sát hơn") + '</span></a><button class="btn outline" type="button" data-act="chat">' + I("chat") + '<span>Hỏi về kết quả này</span></button><a class="btn" href="#/book">Đặt lịch thẩm định ' + I("arrow") + "</a></div></section></div></div>";
    $("down").addEventListener("input", function (e) { d.down = Number(e.target.value); Store.save(); loanUpdate(); });
    $("term").addEventListener("change", function (e) { d.term = Number(e.target.value); Store.save(); loanUpdate(); });
  }
  function loanUpdate() {
    var top = TU.topUp(TU.estimate(car()), d.target), mo = TU.monthly(top, d.down, d.term);
    $("downOut").textContent = d.down + "% · " + TU.fmtRange(Math.round(top.low * d.down / 100), Math.round(top.high * d.down / 100));
    $("moOut").textContent = "≈ " + TU.fmtMonthly(mo);
  }
  function sourceSheet(k) {
    var est = TU.estimate(car()), top = TU.topUp(est, d.target), h = "";
    if (k === "used") {
      h = sheetHead("Cơ sở tính giá xe cũ") + '<ul class="rows num"><li><span class="k">Giá rao trung vị</span><b>' + TU.fmtTr(est.listing) + '</b></li><li><span class="k">Biên thương lượng (3%)</span><b>− ' + TU.fmtTr(est.negotiation) + '</b></li><li><span class="k">Biên thu mua (8%)</span><b>− ' + TU.fmtTr(est.buyMargin) + '</b></li><li><span class="k">Tình trạng khai báo</span><b>− ' + TU.fmtTr(est.condition) + '</b></li><li><span class="k">Hư hỏng từ ảnh</span><b>− ' + TU.fmtTr(est.photo) + '</b></li><li><span class="k"><b>Khoảng tạm tính (±4%)</b></span><b>' + TU.fmtRange(est.low, est.high) + "</b></li></ul><h3>" + est.compsCount + " xe tương đồng, hiện " + est.comps.length + ' xe gần nhất</h3><ul class="comps">' + est.comps.map(function (c) { return "<li><span>" + esc(c.title) + "</span><b>" + TU.fmtTr(c.price) + "</b><small>" + TU.fmtInt(c.km) + " km · " + c.place + "</small></li>"; }).join("") + '</ul><p class="sheet-note" style="margin-top:12px">Nguồn: ' + est.source + ". Ngày dữ liệu: " + est.dataDate + ".</p>";
    } else if (k === "list") {
      h = sheetHead("Giá niêm yết " + top.model.name) + '<p class="figure" style="text-decoration:none">' + TU.fmtTr(top.list) + '</p><p class="sheet-note" style="margin-top:10px">Nguồn: giá minh họa của bản prototype, chưa phải giá niêm yết hiện hành của VinFast. Ngày dữ liệu: ' + TU.DATA_DATE + ".</p>";
    } else if (k === "promo") {
      h = sheetHead(TU.PROMO.name) + '<ul class="rows"><li><span class="k">Mức ưu đãi cho ' + top.model.name + "</span><b>" + TU.fmtTr(top.promo) + '</b></li><li><span class="k">Đợt</span><b>' + TU.PROMO.wave + '</b></li><li><span class="k">Hiệu lực đến</span><b>' + TU.PROMO.validTo + '</b></li></ul><p class="sheet-note" style="margin-top:10px">Nguồn: ' + TU.PROMO.source + ". Đại lý xác nhận ưu đãi lần cuối.</p>";
    } else if (k === "top") {
      h = sheetHead("Cách tính khoản cần bù") + '<ul class="rows num"><li><span class="k">Giá niêm yết ' + top.model.name + "</span><b>" + TU.fmtTr(top.list) + '</b></li><li><span class="k">Ưu đãi đổi xe</span><b>− ' + TU.fmtTr(top.promo) + '</b></li><li><span class="k">Xe cũ, đầu cao</span><b>− ' + TU.fmtTr(est.high) + '</b></li><li><span class="k"><b>Cần bù ít nhất</b></span><b>' + TU.fmtTr(top.low) + '</b></li><li><span class="k">Xe cũ, đầu thấp</span><b>− ' + TU.fmtTr(est.low) + '</b></li><li><span class="k"><b>Cần bù nhiều nhất</b></span><b>' + TU.fmtTr(top.high) + '</b></li></ul><p class="sheet-note" style="margin-top:10px">Tiền bù hiện ở cả hai đầu khoảng giá xe cũ. Chưa gồm phí trước bạ, đăng ký, bảo hiểm.</p>';
    } else {
      var mo = TU.monthly(top, d.down, d.term);
      h = sheetHead("Cách tính trả góp") + '<ul class="rows num"><li><span class="k">Cần bù</span><b>' + TU.fmtRange(top.low, top.high) + '</b></li><li><span class="k">Trả trước</span><b>' + d.down + '%</b></li><li><span class="k">Số tiền vay</span><b>' + TU.fmtRange(Math.round(top.low * (1 - d.down / 100)), Math.round(top.high * (1 - d.down / 100))) + '</b></li><li><span class="k">Kỳ hạn</span><b>' + d.term + ' tháng</b></li><li><span class="k">Lãi suất minh họa</span><b>' + TU.fmtRate() + '</b></li><li><span class="k"><b>Mỗi tháng</b></span><b>≈ ' + TU.fmtMonthly(mo) + '</b></li></ul><p class="sheet-note" style="margin-top:10px">Trả đều hằng tháng, gốc và lãi tính theo dư nợ giảm dần. Lãi suất là số minh họa ngày ' + TU.LOAN.date + ", không phải báo giá của ngân hàng.</p>";
    }
    openSheet(h);
  }
  function chatSheet() {
    var qs = ["Vì sao giá xe tôi nằm trong khoảng này?", "Ưu đãi này áp dụng đến khi nào?", "Tôi cần mang gì khi đi thẩm định?"];
    openSheet(sheetHead("Hỏi về kết quả này") + '<div class="chat-log" id="chatLog" aria-live="polite">' + (chatLog.length ? chatLog.map(function (m) { return '<div class="msg ' + m[0] + '">' + esc(m[1]) + "</div>"; }).join("") : '<div class="msg bot">Mình giải thích được các con số ở màn hình này. Bạn muốn hỏi gì?</div>') + '</div><div class="chips">' + qs.map(function (q) { return '<button class="chip" type="button" data-q="' + esc(q) + '">' + q + "</button>"; }).join("") + '</div><form id="chatForm" style="display:flex;gap:8px;margin-top:14px"><label class="sr-only" for="chatIn">Câu hỏi của bạn</label><input class="input" id="chatIn" type="text" autocomplete="off" placeholder="Gõ câu hỏi" style="font-size:16px;font-weight:500"><button class="btn" type="submit" aria-label="Gửi" style="flex:none;width:54px;padding:0">' + I("send") + "</button></form>");
    var log = $("chatLog"); log.scrollTop = log.scrollHeight;
  }
  function answer(q) {
    var t = q.toLowerCase(), est = TU.estimate(car()), top = TU.topUp(est, d.target);
    if (/mang gì|giấy tờ|thủ tục/.test(t)) return "Mình chưa có thông tin này, tư vấn viên sẽ trả lời khi thẩm định.";
    if (/ưu đãi|khuyến mãi/.test(t)) return TU.PROMO.name + ", " + TU.PROMO.wave.toLowerCase() + ", hiệu lực đến " + TU.PROMO.validTo + ", mức " + TU.fmtTr(top.promo) + " cho " + top.model.name + ". Nguồn: " + TU.PROMO.source.toLowerCase() + ".";
    if (/trả góp|mỗi tháng|lãi/.test(t)) return "Mỗi tháng khoảng " + TU.fmtMonthly(TU.monthly(top, d.down, d.term)) + " với trả trước " + d.down + "%, " + d.term + " tháng, lãi suất minh họa " + TU.fmtRate() + " (ngày " + TU.LOAN.date + ").";
    if (/bù/.test(t)) return "Cần bù " + TU.fmtRange(top.low, top.high) + ": giá niêm yết " + TU.fmtTr(top.list) + " trừ ưu đãi " + TU.fmtTr(top.promo) + " trừ xe cũ " + TU.fmtRange(est.low, est.high) + ".";
    if (/giá|khoảng|vì sao|tại sao/.test(t)) return "Giá rao trung vị của " + est.compsCount + " xe tương đồng là " + TU.fmtTr(est.listing) + " (dữ liệu ngày " + est.dataDate + "). Trừ biên thương lượng " + TU.fmtTr(est.negotiation) + ", biên thu mua " + TU.fmtTr(est.buyMargin) + ", tình trạng " + TU.fmtTr(est.condition + est.photo) + " thì ra khoảng " + TU.fmtRange(est.low, est.high) + ". Đây là giá tạm tính.";
    return "Mình chỉ hỗ trợ đổi xe cũ sang VinFast. Bạn thử hỏi về khoảng giá, khoản bù, trả góp hoặc ưu đãi nhé.";
  }
  sheet.addEventListener("click", function (e) { var c = e.target.closest("[data-q]"); if (c) { chatLog.push(["me", c.dataset.q], ["bot", answer(c.dataset.q)]); chatSheet(); } });
  sheet.addEventListener("submit", function (e) {
    if (e.target.id !== "chatForm") return;
    e.preventDefault(); var q = $("chatIn").value.trim(); if (!q) return;
    chatLog.push(["me", q], ["bot", answer(q)]); chatSheet(); $("chatIn").focus();
  });

  /* ---------- S6 photos ---------- */
  function detect(slot) {
    var found = { "Sau": { part: "Cản sau", type: "Móp", level: "Vừa" }, "Trái": { part: "Cửa trái", type: "Xước", level: "Nhẹ" } }[slot];
    if (!found) return;
    if (!d.damages.some(function (x) { return x.part === found.part && x.type === found.type; })) d.damages.push(Object.assign({ on: true, auto: true }, found));
  }
  function photos() {
    if (!complete()) return emptyState();
    var okN = SLOTS.filter(function (k) { return d.photos[k] === "ok"; }).length;
    bar({ title: "Ảnh xe", sub: okN + " / " + SLOTS.length + " ảnh", back: function () { go("#/result"); } });
    var slots = SLOTS.map(function (k) {
      var st = d.photos[k];
      return '<button class="slot ' + (st || "") + '" type="button" data-act="slot" data-k="' + k + '" aria-label="' + k + (st === "ok" ? ", đã có ảnh, bấm để chụp lại" : st === "bad" ? ", ảnh chưa rõ, bấm để chụp lại" : ", thêm ảnh") + '">' + (st === "ok" ? (photoUrls[k] ? '<img src="' + photoUrls[k] + '" alt="">' : "") + "<span>" + I("check") + k + "</span>" : st === "bad" ? I("alert") + k : I("plus") + k) + "</button>";
    }).join("");
    var bad = SLOTS.filter(function (k) { return d.photos[k] === "bad"; });
    var rows = d.damages.map(function (x, i) {
      var edit = "";
      if (editingDmg === i) edit = dmgEditor(x, i);
      return '<li><div class="dmg-top"><span>' + esc(x.part) + " · " + esc(x.type) + " · " + esc(x.level) + "</span><b>− " + TU.fmtTr(TU.damageCost(x)) + '</b></div><div class="dmg-btns"><button class="btn sm outline" type="button" data-act="dmgedit" data-i="' + i + '">Sửa</button><button class="btn sm outline danger" type="button" data-act="dmgdel" data-i="' + i + '">Bỏ</button></div>' + edit + "</li>";
    }).join("");
    view.innerHTML = '<div class="view"><h1>Thêm ảnh để giá sát hơn</h1><p class="lead">Chụp đủ sáng, thấy rõ cả xe. Bạn kiểm tra và sửa từng hư hỏng trước khi tính vào giá.</p><div class="slots">' + slots + "</div>" +
      (bad.length ? '<div class="note warn" style="margin-top:12px" role="alert">' + I("alert") + "<span>Ảnh " + bad.join(", ").toLowerCase() + " chưa rõ, chụp lại giúp mình.</span></div>" : "") +
      '<p style="margin-top:12px"><button class="link" type="button" data-act="sample" style="border:0;background:none;padding:10px 0">Chưa có ảnh? Dùng ảnh mẫu để thử</button></p>' +
      '<section class="panel" style="margin-top:8px"><h2>Đã phát hiện · bạn kiểm tra</h2>' + (d.damages.length ? '<ul class="dmg">' + rows + "</ul>" : '<p class="sheet-note">Chưa có hư hỏng nào. Thêm ảnh sau hoặc ảnh bên trái để trợ lý tìm giúp, hoặc tự thêm bên dưới.</p>') +
      (editingDmg === d.damages.length ? dmgEditor({ part: TU.DAMAGE_PARTS[0], type: "Xước", level: "Nhẹ" }, editingDmg) : '<button class="btn sm outline" type="button" data-act="dmgadd" style="margin-top:12px">' + I("plus") + "Thêm hư hỏng khác</button>") + "</section>" +
      '<label class="check" style="margin-top:14px"><input type="checkbox" id="consent"' + (d.consent ? " checked" : "") + '><span>Đồng ý lưu ảnh để thẩm định. Xóa được bất cứ lúc nào; không tích thì ảnh chỉ dùng tạm, không lưu.</span></label><div class="actions"><button class="btn" type="button" data-act="reprice">Cập nhật khoảng giá ' + I("arrow") + "</button></div></div>";
    $("consent").addEventListener("change", function (e) { d.consent = e.target.checked; Store.save(); });
  }
  function dmgEditor(x, i) {
    var sel = function (id, list, cur) { return '<select class="input" id="' + id + '" aria-label="' + id + '">' + list.map(function (v) { return "<option" + (v === cur ? " selected" : "") + ">" + v + "</option>"; }).join("") + "</select>"; };
    return '<div class="dmg-edit" data-i="' + i + '">' + sel("dPart", TU.DAMAGE_PARTS, x.part) + sel("dType", Object.keys(TU.DAMAGE_TYPES), x.type) + sel("dLevel", ["Nhẹ", "Vừa", "Nặng"], x.level) + '<button class="btn sm" type="button" data-act="dmgsave">Lưu hư hỏng</button></div>';
  }
  $("filePick").addEventListener("change", function (e) {
    var f = e.target.files[0]; if (!f || !pendingSlot) return;
    if (photoUrls[pendingSlot]) URL.revokeObjectURL(photoUrls[pendingSlot]);
    if (!/^image\//.test(f.type) || f.size < 15000) { d.photos[pendingSlot] = "bad"; delete photoUrls[pendingSlot]; }
    else { d.photos[pendingSlot] = "ok"; photoUrls[pendingSlot] = URL.createObjectURL(f); detect(pendingSlot); }
    e.target.value = ""; Store.save(); render();
  });

  /* ---------- S7 booking + confirmation ---------- */
  function book() {
    var b = d.booking, editing = s.editing && s.cases[s.editing];
    bar({ title: editing ? "Đổi lịch " + editing.id : "Đặt lịch thẩm định", sub: complete() ? label() : "", back: function () { editing ? go("#/track") : history.length > 1 ? history.back() : go("#/result"); } });
    view.innerHTML = '<div class="view"><h1>' + (editing ? "Chọn lịch hẹn mới" : "Hẹn thẩm định viên xem xe") + '</h1><p class="lead">Thẩm định viên xem xe thật rồi chốt giá chính thức. Miễn phí, không ràng buộc bán xe.</p><form class="fgrid" data-form="book" novalidate>' +
      '<div><label class="field-label" for="bDealer">Đại lý</label><select class="input" id="bDealer">' + ['<option value="">Chọn đại lý</option>'].concat(TU.DEALERS.map(function (x) { return "<option" + (x === b.dealer ? " selected" : "") + ">" + x + "</option>"; })).join("") + '</select><div class="field-err" id="eDealer"></div></div>' +
      '<div><label class="field-label" for="bDate">Ngày hẹn</label><input class="input" id="bDate" type="date" min="' + Store.today() + '" value="' + esc(b.date) + '"><div class="field-err" id="eDate"></div></div>' +
      '<div role="radiogroup" aria-labelledby="lTime"><span class="field-label" id="lTime">Giờ hẹn</span><div class="times">' + TU.SLOTS.map(function (t) { return '<button class="choice" type="button" role="radio" data-act="time" data-v="' + t + '" aria-checked="' + (t === b.time) + '">' + t + "</button>"; }).join("") + '</div><div class="field-err" id="eTime"></div></div>' +
      (editing ? "" : '<div><label class="field-label" for="bName">Họ tên</label><input class="input" id="bName" type="text" autocomplete="name" value="' + esc(b.name) + '"><div class="field-err" id="eName"></div></div><div><label class="field-label" for="bPhone">Số điện thoại</label><input class="input num" id="bPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="09xx xxx xxx" value="' + esc(b.phone) + '"><div class="field-err" id="ePhone"></div></div>') +
      '<div class="actions"><button class="btn" type="submit">Xem lại trước khi gửi ' + I("arrow") + "</button></div></form></div>";
  }
  function confirmView() {
    var b = d.booking, editing = s.editing && s.cases[s.editing];
    if (!b.dealer || !b.date || !b.time) return go("#/book");
    var est = complete() ? TU.estimate(car()) : { ok: false }, nPhotos = Object.keys(d.photos || {}).filter(function (k) { return d.photos[k] === "ok"; }).length;
    bar({ title: "Xác nhận gửi hồ sơ", back: function () { go("#/book"); } });
    view.innerHTML = '<div class="view"><h1>' + (editing ? "Xác nhận đổi lịch" : "Xác nhận gửi hồ sơ") + '</h1><section class="panel"><dl style="margin:0"><div class="kv"><dt>Đại lý nhận</dt><dd>' + esc(b.dealer) + '</dd></div><div class="kv"><dt>Lịch hẹn</dt><dd class="num">' + b.time + ", " + Store.viDate(b.date) + "</dd></div></dl>" +
      (editing ? "" : '<h2 style="margin-top:16px">Sẽ gửi cho đại lý</h2><ul class="sendlist"><li>Thông tin xe' + (complete() ? ": " + esc(label()) + ", " + TU.fmtInt(d.km) + " km" : "") + (nPhotos && d.consent ? " + " + nPhotos + " ảnh" : "") + "</li><li>" + (est.ok ? "Khoảng giá tạm tính: " + TU.fmtRange(est.low, est.high) : "Chưa có khoảng giá tạm tính") + "</li><li>Họ tên, số điện thoại: " + esc(b.name) + ", " + esc(b.phone) + '</li></ul><h2 style="margin-top:16px">Không gửi</h2><p>Lịch sử trò chuyện của bạn' + (nPhotos && !d.consent ? ", ảnh xe (bạn chưa đồng ý lưu ảnh)" : "") + '.</p><p style="margin-top:8px"><button class="link" type="button" data-act="policy" style="border:0;background:none;padding:10px 0">Chính sách dữ liệu</button></p>') +
      '</section><div class="actions row"><a class="btn outline" href="#/book">Sửa</a><button class="btn" type="button" data-act="send">' + (editing ? "Xác nhận đổi lịch" : "Xác nhận gửi") + "</button></div></div>";
  }

  /* ---------- S8 tracking ---------- */
  function track() {
    var c = s.cases[s.myCase];
    bar({ title: c ? "Hồ sơ " + c.id : "Theo dõi hồ sơ", sub: c ? Store.carLabel(c.car) : "", back: function () { location.href = "index.html"; } });
    if (!c) {
      view.innerHTML = '<div class="view"><h1>Theo dõi hồ sơ</h1><p class="lead">Nhập mã hồ sơ trong tin nhắn xác nhận để xem hồ sơ đang ở bước nào.</p><form class="fgrid" data-form="lookup" novalidate><div><label class="field-label" for="code">Mã hồ sơ</label><input class="input" id="code" type="text" autocomplete="off" autocapitalize="characters" placeholder="TU-000123"><div class="field-err" id="eCode" role="alert"></div></div><button class="btn" type="submit">Xem hồ sơ</button></form><div class="note" style="margin-top:18px">' + I("info") + '<span>Bản thử: dùng mã TU-000119 (đã có giá chính thức) hoặc TU-000124 (đang chờ). Chưa có hồ sơ? <a class="link" href="#/intake">Bắt đầu ước tính</a></span></div></div>';
      return;
    }
    var done = c.status === "done", off = c.status === "cancelled", est = c.estimate;
    var li = function (cls, t, sub, time) { return '<li class="' + cls + '"><span class="dot">' + (cls === "ok" ? I("check") : cls === "off" ? '<svg class="ic" style="color:#b4232a" aria-hidden="true"><use href="#i-x"/></svg>' : "") + '</span><span class="t">' + t + (sub ? "<small>" + sub + "</small>" : "") + "</span>" + (time ? "<time>" + time + "</time>" : "<span></span>") + "</li>"; };
    view.innerHTML = '<div class="view"><h1>' + (off ? "Hồ sơ đã hủy" : done ? "Đã có giá chính thức" : "Đang chờ thẩm định") + '</h1><p class="lead">' + esc(Store.carLabel(c.car)) + ", " + TU.fmtInt(c.car.km) + " km · đổi sang " + esc(c.target) + '</p><section class="panel"><ol class="timeline">' +
      li("ok", "Đã có giá tạm tính", est.ok ? TU.fmtRange(est.low, est.high) : "Chưa ước tính được, chờ thẩm định trực tiếp", c.createdAt) +
      li("ok", "Đã đặt lịch", esc(c.booking.dealer) + " · " + c.booking.time + ", " + Store.viDate(c.booking.date), c.createdAt) +
      (off ? li("off", "Đã hủy hồ sơ", "Đại lý đã được báo hủy lịch hẹn.", "") : li(done ? "ok" : "now", "Đang thẩm định", done ? "Thẩm định viên đã xem xe." : "Thẩm định viên xem xe vào lịch hẹn.", "") + li(done ? "ok" : "todo", "Có giá chính thức", done ? "" : "Hiện ngay sau khi thẩm định viên chốt.", "")) + "</ol>" +
      (done ? '<div class="official"><small>Giá chính thức</small><b>' + TU.fmtTr(c.official.price) + "</b><span>" + esc(c.official.by) + " chốt lúc " + esc(c.official.at) + (c.official.reason ? ". Lý do ngoài khoảng tạm tính: " + esc(c.official.reason) : "") + "</span></div>" : "") + "</section>" +
      (off ? '<div class="actions"><a class="btn" href="#/intake" data-act="newcase">Tạo hồ sơ mới</a></div>' : done ? '<div class="note" style="margin-top:14px">' + I("info") + "<span>Giá chính thức có hiệu lực theo điều kiện của đại lý. Liên hệ " + esc(c.booking.dealer) + ' để làm thủ tục đổi xe.</span></div>' : '<div class="note" style="margin-top:14px">' + I("calendar") + '<span><b>Việc của bạn:</b> mang xe và giấy tờ tới đại lý đúng hẹn.</span></div><div class="actions row"><button class="btn outline" type="button" data-act="resched">Đổi lịch</button><button class="btn outline danger" type="button" data-act="cancel">Hủy hồ sơ</button></div>') +
      '<p class="lead" style="margin-top:22px;font-size:15px">Bản thử: <a class="link" href="dealer.html#/case/' + c.id + '">mở bàn thẩm định viên</a> để chốt giá hồ sơ này, rồi quay lại đây. <button class="link" type="button" data-act="othercase" style="border:0;background:none;padding:10px 0">Xem hồ sơ khác</button></p></div>';
  }

  /* ---------- events ---------- */
  var acts = {
    jump: function (el) { d.step = Number(el.dataset.i); otherOpen = false; Store.save(); render(); },
    pick: function (el) { setField(d.step, el.dataset.v); },
    other: function () { otherOpen = !otherOpen; render(); },
    cond: function (el) { d[el.dataset.k] = el.dataset.v; Store.save(); el.parentNode.querySelectorAll(".choice").forEach(function (c) { c.setAttribute("aria-checked", c === el); }); $("g-" + el.dataset.k).classList.remove("missing"); },
    finish: function () {
      var miss = [["accident", "va chạm"], ["flood", "ngập nước"], ["owners", "số đời chủ"]].filter(function (p) { return !d[p[0]]; });
      if (miss.length) {
        miss.forEach(function (p) { $("g-" + p[0]).classList.add("missing"); });
        $("condAgent").innerHTML = agent("Mình còn thiếu thông tin về <b>" + miss.map(function (p) { return p[1]; }).join(", ") + "</b>. Bạn chọn giúp mình nhé.");
        $("g-" + miss[0][0]).scrollIntoView({ behavior: "smooth", block: "center" }); return;
      }
      go("#/processing");
    },
    kmfix: function () { $("kmAgent").innerHTML = ""; $("kmIn").focus(); $("kmIn").select(); },
    kmok: function () { d.kmConfirmed = true; d.step = 5; Store.save(); render(); },
    retry: function () { go("#/processing"); },
    editcar: function () { d.step = 0; Store.save(); },
    editkm: function () { d.step = 4; Store.save(); },
    target: function (el) { d.target = el.dataset.v; Store.save(); var x = window.scrollY; render(true); window.scrollTo(0, x); },
    src: function (el) { sourceSheet(el.dataset.k); },
    chat: chatSheet,
    slot: function (el) { pendingSlot = el.dataset.k; $("filePick").click(); },
    sample: function () { ["Trước", "Sau", "Trái"].forEach(function (k) { d.photos[k] = "ok"; detect(k); }); d.photos["Phải"] = "bad"; Store.save(); render(true); UI.toast("Đã thêm 3 ảnh mẫu, 1 ảnh chưa rõ"); },
    dmgedit: function (el) { editingDmg = editingDmg === Number(el.dataset.i) ? -1 : Number(el.dataset.i); render(true); },
    dmgadd: function () { editingDmg = d.damages.length; render(true); },
    dmgdel: function (el) { d.damages.splice(Number(el.dataset.i), 1); editingDmg = -1; Store.save(); render(true); },
    dmgsave: function (el) { var i = Number(el.parentNode.dataset.i); d.damages[i] = { part: $("dPart").value, type: $("dType").value, level: $("dLevel").value, on: true }; editingDmg = -1; Store.save(); render(true); },
    reprice: function () { editingDmg = -1; go("#/processing"); },
    time: function (el) { d.booking.time = el.dataset.v; Store.save(); el.parentNode.querySelectorAll(".choice").forEach(function (c) { c.setAttribute("aria-checked", c === el); }); $("eTime").textContent = ""; },
    policy: function () { openSheet(sheetHead("Chính sách dữ liệu") + '<p class="sheet-note">Bản thử chưa có chính sách chính thức. Nguyên tắc dự kiến: chỉ gửi cho đại lý bạn chọn, chỉ gửi các mục liệt kê ở màn hình xác nhận, ảnh chỉ lưu khi bạn đồng ý và xóa được bất cứ lúc nào, số điện thoại không ghi vào nhật ký hệ thống.</p>'); },
    send: function () {
      if (s.editing && s.cases[s.editing]) { var c = s.cases[s.editing]; c.booking.dealer = d.booking.dealer; c.booking.date = d.booking.date; c.booking.time = d.booking.time; s.myCase = c.id; s.editing = ""; Store.save(); go("#/track"); UI.toast("Đã đổi lịch hẹn"); return; }
      var id = Store.createCase(); go("#/track"); UI.toast("Đã gửi hồ sơ " + id + " cho đại lý");
    },
    resched: function () { var c = s.cases[s.myCase]; s.editing = c.id; d.booking = JSON.parse(JSON.stringify(c.booking)); Store.save(); go("#/book"); },
    cancel: function () {
      var c = s.cases[s.myCase];
      openSheet(sheetHead("Hủy hồ sơ " + c.id + "?") + '<p class="sheet-note">Lịch hẹn ' + c.booking.time + ", " + Store.viDate(c.booking.date) + " tại " + esc(c.booking.dealer) + ' sẽ bị hủy. Bạn không hoàn tác được, nhưng có thể tạo hồ sơ mới.</p><div class="sheet-actions"><button class="btn outline" type="button" data-close>Giữ hồ sơ</button><button class="btn" type="button" id="doCancel" style="background:var(--danger);box-shadow:none">Hủy hồ sơ</button></div>');
      $("doCancel").onclick = function () { c.status = "cancelled"; Store.save(); sheet.close(); render(); UI.toast("Đã hủy hồ sơ " + c.id); };
    },
    newcase: function () { Store.newDraft(); d = s.draft; s.myCase = ""; Store.save(); },
    othercase: function () { s.myCase = ""; Store.save(); render(); }
  };
  view.addEventListener("click", function (e) { var el = e.target.closest("[data-act]"); if (el && acts[el.dataset.act]) acts[el.dataset.act](el); });
  view.addEventListener("input", function (e) { if (e.target.id === "kmIn") { var n = e.target.value.replace(/\D/g, ""); e.target.value = n ? TU.fmtInt(Number(n)) : ""; $("kmErr").textContent = ""; e.target.removeAttribute("aria-invalid"); } });
  view.addEventListener("submit", function (e) {
    e.preventDefault(); var kind = e.target.dataset.form;
    if (kind === "other") {
      var v = $("otherIn").value.trim(), st = d.step;
      if (!v) { $("otherErr").textContent = "Nhập thông tin này để tiếp tục."; $("otherIn").setAttribute("aria-invalid", "true"); return; }
      if (st === 2 && (Number(v) < 1990 || Number(v) > TU.NOW_YEAR)) { $("otherErr").textContent = "Năm sản xuất cần nằm trong khoảng 1990–" + TU.NOW_YEAR + "."; $("otherIn").setAttribute("aria-invalid", "true"); return; }
      setField(st, v);
    } else if (kind === "km") {
      var raw = $("kmIn").value.replace(/\D/g, "");
      if (raw === "") { $("kmErr").textContent = "Nhập số km xe đã đi, ví dụ 62.000."; $("kmIn").setAttribute("aria-invalid", "true"); $("kmIn").focus(); return; }
      if (Number(raw) !== Number(d.km)) d.kmConfirmed = false;
      d.km = Number(raw); Store.save();
      var q = TU.kmCheck(d.year, d.km);
      if (q && !d.kmConfirmed) { $("kmAgent").innerHTML = agent(esc(q), '<button class="btn sm outline" type="button" data-act="kmfix">Sửa lại</button><button class="btn sm" type="button" data-act="kmok">Đúng rồi</button>'); return; }
      d.step = 5; Store.save(); render();
    } else if (kind === "free") {
      var text = $("freeIn").value.trim(); if (!text) return;
      var got = TU.parseFreeText(text), keys = Object.keys(got);
      if (!keys.length) { agentMsg = "Mình chưa tách được thông tin xe từ câu này. Bạn thử ghi rõ dòng xe, đời và số km, ví dụ “Vios 2019 bản G, 6 vạn”."; render(); return; }
      if (got.brand && got.brand !== d.brand) { d.model = ""; d.trim = ""; }
      if (got.model && got.model !== d.model) d.trim = "";
      Object.assign(d, got); if (got.km != null) d.kmConfirmed = false;
      d.step = firstMissing();
      var names = { brand: "hãng", model: "dòng xe", year: "đời", km: "số km", trim: "phiên bản" };
      agentMsg = "Mình đã hiểu: <b>" + keys.map(function (k) { return names[k] + " " + esc(k === "km" ? TU.fmtInt(got.km) + " km" : got[k]); }).join(", ") + "</b>. " + (d.step < 5 ? "Còn thiếu phần bên trên, bạn chọn giúp mình." : "Bạn cho mình biết thêm tình trạng xe nhé.");
      Store.save(); render();
    } else if (kind === "book") {
      var b = d.booking, ok = true, editing = s.editing && s.cases[s.editing];
      var need = function (id, err, cond, msg) { $(err).textContent = cond ? "" : msg; if (id && $(id)) cond ? $(id).removeAttribute("aria-invalid") : $(id).setAttribute("aria-invalid", "true"); if (!cond && ok) { ok = false; if (id && $(id)) $(id).focus(); } };
      b.dealer = $("bDealer").value; b.date = $("bDate").value;
      if (!editing) { b.name = $("bName").value.trim(); b.phone = $("bPhone").value.trim(); }
      Store.save();
      need("bDealer", "eDealer", !!b.dealer, "Chọn đại lý bạn muốn mang xe tới.");
      need("bDate", "eDate", !!b.date && b.date >= Store.today(), b.date ? "Ngày hẹn cần từ hôm nay trở đi." : "Chọn ngày hẹn.");
      need("", "eTime", !!b.time, "Chọn giờ hẹn.");
      if (!editing) {
        need("bName", "eName", b.name.length >= 2, "Nhập họ tên để đại lý liên hệ.");
        need("bPhone", "ePhone", /^0\d{9}$/.test(b.phone.replace(/[\s.]/g, "")), "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.");
      }
      if (ok) go("#/confirm");
    } else if (kind === "lookup") {
      var code = $("code").value.trim().toUpperCase();
      if (!code) { $("eCode").textContent = "Nhập mã hồ sơ, ví dụ TU-000123."; return; }
      if (!s.cases[code]) { $("eCode").textContent = "Không tìm thấy hồ sơ " + code + ". Kiểm tra lại mã trong tin nhắn xác nhận."; $("code").setAttribute("aria-invalid", "true"); return; }
      s.myCase = code; Store.save(); render();
    }
  });

  var routes = { "#/intake": intake, "#/processing": processing, "#/result": result, "#/error": errorView, "#/photos": photos, "#/book": book, "#/confirm": confirmView, "#/track": track };
  function render(keep) {
    timers.forEach(clearTimeout); timers = [];
    if (sheet.open && keep !== true) sheet.close();
    var r = routes[location.hash] || (complete() ? result : intake);
    r();
    if (keep !== true) { window.scrollTo(0, 0); }
  }
  window.addEventListener("hashchange", function () { otherOpen = false; editingDmg = -1; render(); });
  window.addEventListener("storage", function () { location.reload(); });
  UI.mountMap();
  render();
})();
