/* TradeUp customer flow: S2 intake, S3 processing, S4 result, S5 error, S6 photos, S7 booking + confirm, S8 tracking.
   Hash routes inside flow.html. Catalogs come from GET /options and /vinfast-models, the input check from
   POST /valuations/check-input and every price from POST /valuations (docs/ui-integration.md). The page only formats. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var s = Store.get(), d = s.draft, esc = TU.esc, I = UI.icon;
  var view = $("view"), sheet = $("sheet");
  var timers = [], photoUrls = {}, agentMsg = "", agentBtns = "", otherOpen = false, errorKind = "data", pendingSlot = "", editingDmg = -1, reqSeq = 0;
  var opts = null, models = null, catalogErr = false;
  var STEPS = ["brand", "model", "year", "trim", "km", "fuel", "cond"], N = STEPS.length;
  var QUESTIONS = ["Xe của bạn hãng gì?", "Dòng xe nào?", "Xe sản xuất năm nào?", "Phiên bản nào?", "Xe đã đi bao nhiêu km?", "Xe chạy nhiên liệu gì?", "Tình trạng xe thế nào?"];
  var FIELD_STEP = { brand: 0, model: 1, year: 2, variant: 3, mileage_km: 4, fuel: 5 };
  var SLOTS = ["Trước", "Sau", "Trái", "Phải", "Nội thất", "Đồng hồ km"];

  var catalogs = Promise.all([TU.api.options(), TU.api.vinfastModels()]).then(function (r) {
    opts = r[0].result; models = r[1].result.models; UI.setSynthetic(r[0].is_synthetic);
    if (!TU.findModel(models, d.targetId)) d.targetId = models.length ? models[0].model_id : "";
    if (!editionOk()) d.edition = TU.defaultEdition(TU.findModel(models, d.targetId));
    Store.save();
  }, function () { catalogErr = true; });
  catalogs.then(function () { if (/^#\/(intake|result)?$/.test(location.hash) || location.hash === "") { var x = window.scrollY; render(true); window.scrollTo(0, x); } });

  function editionOk() { var m = models && TU.findModel(models, d.targetId); return !!(m && TU.activeEditions(m).some(function (e) { return e.edition_code === d.edition; })); }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  function complete() { return d.brand && d.model && d.year && d.km !== "" && d.km != null; }
  function label() { return Store.carLabel(Store.carOf(d)); }
  function quoteOk() { return d.quote && d.quote.status === "ok" && TU.outcome(d.quote).topup; }
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
  function note(cls, icon, html) { return '<div class="note' + (cls ? " " + cls : "") + '" style="margin-top:10px">' + I(icon) + "<span>" + html + "</span></div>"; }
  function openSheet(html) { sheet.innerHTML = html; if (!sheet.open) sheet.showModal(); }
  sheet.addEventListener("click", function (e) { if (e.target === sheet || e.target.closest("[data-close]")) sheet.close(); });
  function sheetHead(title) { return '<div class="sheet-head"><h2>' + title + '</h2><button class="iconbtn" type="button" data-close aria-label="Đóng">' + I("x") + "</button></div>"; }

  /* ---------- S2 intake ---------- */
  function firstMissing() {
    if (!d.brand) return 0; if (!d.model) return 1; if (!d.year) return 2; if (!d.trim) return 3; if (d.km === "" || d.km == null) return 4; if (!d.fuel) return 5; return 6;
  }
  function brandEntry() { return opts && opts.brands.filter(function (b) { return b.brand.toLowerCase() === String(d.brand).toLowerCase(); })[0]; }
  function intake() {
    var st = Math.max(0, Math.min(N - 1, d.step || 0)), body = "", crumbs = "", be = brandEntry();
    bar({ title: "Bước " + (st + 1) + " / " + N, sub: "Khai thông tin xe", progress: ((st + 1) / N) * 100, back: function () { otherOpen = false; agentMsg = ""; if (st > 0) { d.step = st - 1; Store.save(); render(); } else location.href = "index.html"; } });
    var fuelLabel = opts && d.fuel ? (opts.fuels.filter(function (f) { return f.value === d.fuel; })[0] || {}).label : d.fuel;
    [d.brand, d.model, d.year, d.trim, d.km !== "" && d.km != null ? TU.fmtInt(d.km) + " km" : "", fuelLabel].forEach(function (v, i) {
      if (v && i < st) crumbs += '<button class="crumb" type="button" data-act="jump" data-i="' + i + '" aria-label="Sửa ' + esc(v) + '">' + esc(v) + "</button>";
    });
    function choices(list, current, altLabel, cls) {
      var h = '<div class="choices ' + (cls || "") + '">';
      list.forEach(function (o) { var v = o && o.v != null ? o.v : o, l = o && o.l != null ? o.l : o; h += '<button class="choice" type="button" data-act="pick" data-v="' + esc(v) + '" aria-pressed="' + (String(v) === String(current)) + '">' + esc(l) + "</button>"; });
      if (altLabel) h += '<button class="choice alt" type="button" data-act="other" aria-expanded="' + otherOpen + '">' + altLabel + "</button>";
      return h + "</div>";
    }
    function otherInput(ph, type, val) {
      return '<form class="stack" data-form="other" style="margin-top:14px" novalidate><label class="field-label" for="otherIn">' + ph + '</label><input class="input" id="otherIn" ' + (type === "number" ? 'type="number" inputmode="numeric" min="1990" max="' + TU.NOW_YEAR + '"' : 'type="text"') + ' autocomplete="off" value="' + esc(val || "") + '"><div class="field-err" id="otherErr" role="alert"></div><button class="btn" type="submit">Tiếp tục ' + I("arrow") + "</button></form>";
    }
    var loadingNote = !opts && !catalogErr ? '<p class="lead">Đang tải danh mục xe từ máy chủ…</p>' : catalogErr ? note("warn", "alert", "Chưa tải được danh mục từ máy chủ TradeUp (" + esc(TU.api.base()) + "). Bạn vẫn nhập tay được; kết quả cần máy chủ đang chạy.") : "";
    if (st === 0) body = (opts ? choices(opts.brands.map(function (b) { return b.brand; }), d.brand, "Hãng khác") + (otherOpen ? otherInput("Tên hãng xe") : "") : loadingNote + otherInput("Tên hãng xe", "", d.brand));
    else if (st === 1) body = be ? choices(be.models.map(function (m) { return m.model; }), d.model, "Dòng khác") + (otherOpen ? otherInput("Tên dòng xe") : "") : (opts ? note("", "info", "Chưa có dữ liệu cho hãng " + esc(d.brand) + ". Bạn nhập tên dòng xe, hệ thống sẽ kiểm tra.") : loadingNote) + otherInput("Tên dòng xe", "", d.model);
    else if (st === 2) { var ys = opts ? opts.years.slice(0, 15) : []; if (!ys.length) for (var y = TU.NOW_YEAR; y >= TU.NOW_YEAR - 14; y--) ys.push(y); body = choices(ys, d.year, "Cũ hơn", "cols-3") + (otherOpen ? otherInput("Năm sản xuất", "number") : ""); }
    else if (st === 3) body = '<form class="stack" data-form="trim" novalidate><label class="field-label" for="trimIn">Phiên bản (nếu biết)</label><input class="input" id="trimIn" type="text" autocomplete="off" placeholder="Ví dụ 1.5G, 2.0 Luxury" value="' + esc(d.trim && d.trim !== "Không rõ" ? d.trim : "") + '"><div class="actions row"><button class="btn outline" type="button" data-act="notrim">Tôi không rõ</button><button class="btn" type="submit">Tiếp tục ' + I("arrow") + "</button></div></form>";
    else if (st === 4) body = '<form data-form="km" novalidate><label class="sr-only" for="kmIn">Số km đã đi</label><div class="input-wrap"><input class="input num" id="kmIn" type="text" inputmode="numeric" autocomplete="off" placeholder="62.000" value="' + (d.km !== "" && d.km != null ? TU.fmtInt(d.km) : "") + '"><span class="unit">km</span></div><div class="field-err" id="kmErr" role="alert"></div><div id="kmAgent"></div><div class="actions"><button class="btn" type="submit" id="kmGo">Tiếp tục ' + I("arrow") + "</button></div></form>";
    else if (st === 5) body = choices((opts ? opts.fuels : [{ value: "xang", label: "Xăng" }, { value: "dau", label: "Dầu" }, { value: "hybrid", label: "Hybrid" }, { value: "dien", label: "Điện" }, { value: "khac", label: "Khác" }]).map(function (f) { return { v: f.value, l: f.label }; }), d.fuel) + '<p class="lead" style="margin-top:12px">Ưu đãi đổi xe xăng / dầu sang xe điện phụ thuộc vào điều này.</p>';
    else {
      var grp = function (key, name, o) {
        var h = '<div class="group" id="g-' + key + '" role="radiogroup" aria-labelledby="gl-' + key + '"><span class="glabel" id="gl-' + key + '">' + name + '</span><div class="choices">';
        Object.keys(o).forEach(function (k) { h += '<button class="choice" type="button" role="radio" data-act="cond" data-k="' + key + '" data-v="' + k + '" aria-checked="' + (d[key] === k) + '">' + o[k].label + "</button>"; });
        return h + "</div></div>";
      };
      body = grp("accident", "Va chạm", TU.ACCIDENT) + grp("flood", "Ngập nước", TU.FLOOD) + grp("owners", "Số đời chủ", TU.OWNERS) + '<p class="lead">Engine chưa tính tình trạng vào giá; thông tin này gửi cho thẩm định viên.</p><div id="condAgent"></div><div class="actions"><button class="btn" type="button" data-act="finish">Xem khoảng giá ' + I("arrow") + "</button></div>";
    }
    view.innerHTML = '<div class="view"><div class="crumbs">' + crumbs + "</div><h1>" + QUESTIONS[st] + "</h1>" + (st === 3 ? '<p class="lead">Thường ghi trên đăng kiểm hoặc đuôi xe. Không rõ cũng không sao.</p>' : '<div style="height:12px"></div>') + body + (agentMsg ? agent(agentMsg, agentBtns) : "") +
      '<div class="free"><label class="field-label" for="freeIn">Hoặc gõ tự do</label><form data-form="free"><input class="input" id="freeIn" type="text" autocomplete="off" placeholder="Vios 2019 bản G, 6 vạn, xăng"><button class="btn" type="submit" aria-label="Gửi mô tả">' + I("send") + '</button></form><small>Tách thông tin xe giúp bạn. Muốn hỏi tiền bù, ưu đãi, trả góp? <button class="link" type="button" data-act="openchat" style="border:0;background:none;padding:0">Hỏi trợ lý</button></small></div></div>';
    agentMsg = ""; agentBtns = "";
    var f = $("otherIn") || (st === 4 && $("kmIn")) || (st === 3 && $("trimIn")); if (f && (otherOpen || st === 4 || st === 3 || !opts || (st === 1 && !be))) f.focus();
  }
  function setField(st, v) {
    if (st === 0 && v !== d.brand) { d.brand = v; d.model = ""; d.trim = ""; }
    else if (st === 1 && v !== d.model) { d.model = v; d.trim = ""; }
    else if (st === 2) d.year = Number(v);
    else if (st === 3) d.trim = v || "Không rõ";
    else if (st === 5) d.fuel = v;
    d.quote = null; otherOpen = false; d.step = Math.min(N - 1, st + 1); Store.save(); render();
  }
  /* Ask the server before pricing (§4 step 2): conflicts and unknown names come back as questions + buttons. */
  function checkCar() {
    $("kmGo").disabled = true;
    TU.api.checkInput(TU.carBody(d)).then(function (r) {
      var res = r.data && r.data.result;
      if (r.status === 200 && res && res.status === "can_hoi_lai") return reask(res.reask, res.ui_options, true);
      d.step = 5; Store.save(); render();
    }, function () { d.step = 5; Store.save(); render(); UI.toast("Chưa kiểm tra được với máy chủ, vẫn tiếp tục"); });
  }
  /* Show the server's re-ask question (verbatim) at the step of the field it is about. */
  function reask(ra, ui, inline) {
    var c = (ra && ra.conflicts || [])[0], q = (ra && ra.questions || [])[0], btns = "";
    if (c && c.code === "unknown_model" && c.suggestions && c.suggestions.length) {
      btns = c.suggestions.slice(0, 4).map(function (x) { return '<button class="btn sm outline" type="button" data-act="suggest" data-b="' + esc(x.brand) + '" data-m="' + esc(x.model) + '">' + esc(x.brand + " " + x.model) + "</button>"; }).join("");
    } else if (c) btns = '<button class="btn sm outline" type="button" data-act="kmfix">Sửa số km</button><button class="btn sm outline" type="button" data-act="yearfix">Sửa năm</button>';
    var msg = esc(c ? c.question : q ? q.question : "Mình cần hỏi lại một vài thông tin.");
    if (inline && c && c.code !== "unknown_model" && $("kmAgent")) { $("kmAgent").innerHTML = agent(msg, btns); $("kmGo").disabled = false; return; }
    agentMsg = msg; agentBtns = btns;
    var field = c ? (c.code === "unknown_model" ? "model" : c.fields[c.fields.length - 1]) : q ? q.field : "brand";
    d.step = FIELD_STEP[field] != null ? FIELD_STEP[field] : 0; Store.save();
    if (location.hash !== "#/intake") { location.hash = "#/intake"; } else render(true);
  }

  /* ---------- S3 processing ---------- */
  function processing() {
    if (!complete()) return emptyState();
    bar({ title: label(), sub: TU.fmtInt(d.km) + " km", back: function () { go("#/intake"); } });
    var items = ["Kiểm tra thông tin xe", "Tìm xe tương đồng đang rao", "Áp ưu đãi đổi xe VinFast", "Tính tiền bù và trả góp"];
    view.innerHTML = '<div class="view proc"><div class="spinner" aria-hidden="true"></div><h1 role="status">Đang tính...</h1><ul class="proc-list">' + items.map(function (t, i) { return '<li class="' + (i === 0 ? "doing" : "") + '"><span class="dot">' + I("check") + "</span>" + t + "</li>"; }).join("") + '</ul><p class="lead" style="margin-inline:auto">Engine TradeUp đang tính trên máy chủ. Dữ liệu bạn nhập đã được lưu.</p></div>';
    var lis = view.querySelectorAll(".proc-list li"), my = ++reqSeq, started = Date.now();
    for (var i = 0; i < 3; i++) (function (i) { timers.push(setTimeout(function () { lis[i].className = "ok"; lis[i + 1].className = "doing"; }, 450 * (i + 1))); })(i);
    if (s.simulateError) { timers.push(setTimeout(function () { errorKind = "system"; go("#/error"); }, 900)); return; }
    catalogs.then(function () {
      if (models && !editionOk()) { d.edition = TU.defaultEdition(TU.findModel(models, d.targetId)); }
      return TU.api.valuate(TU.quoteBody(d));
    }).then(function (r) {
      if (my !== reqSeq) return;
      var data = r.data || {}, wait = Math.max(0, 1500 - (Date.now() - started));
      timers.push(setTimeout(function () {
        if (typeof data.is_synthetic === "boolean") UI.setSynthetic(data.is_synthetic);
        if (r.status !== 200 || !data.ok) { console.warn("POST /valuations", r.status, data && data.error); errorKind = "system"; return go("#/error"); }
        d.quote = data; Store.save();
        if (data.status === "ok") return go("#/result");
        if (data.status === "can_hoi_lai") return reask(TU.outcome(data).valuation.reask, data.result.ui_options, false);
        errorKind = "data"; go("#/error");
      }, wait));
    }, function () { if (my === reqSeq) { errorKind = "offline"; go("#/error"); } });
  }

  /* ---------- S5 error ---------- */
  function errorView() {
    if (!complete()) return emptyState();
    bar({ title: label(), back: function () { go("#/intake"); } });
    var v = d.quote ? TU.outcome(d.quote).valuation : null;
    if (errorKind === "data" && v && v.status === "chua_du_du_lieu") {
      view.innerHTML = '<div class="view"><h1>Chưa đủ dữ liệu để ước tính xe này</h1><p class="lead">' + esc(v.user_message) + '</p><div class="note">' + I("usercheck") + '<span>Thẩm định viên vẫn có thể định giá trực tiếp cho bạn tại đại lý.</span></div><div class="actions"><a class="btn" href="#/book">Đặt lịch thẩm định ' + I("arrow") + '</a><a class="btn outline" href="#/intake" data-act="editcar">Sửa thông tin xe</a></div></div>';
    } else if (errorKind === "offline") {
      view.innerHTML = '<div class="view"><h1>Chưa kết nối được máy chủ</h1><p class="lead">Trang này lấy giá từ API TradeUp tại <code>' + esc(TU.api.base()) + '</code> nhưng không gọi được. Thông tin xe bạn đã nhập vẫn được giữ.</p><div class="note">' + I("info") + '<span>Chạy máy chủ: <code>uvicorn src.main:app</code> rồi mở <code>http://localhost:8000/web/flow.html</code>, hoặc đổi máy chủ ở nút Sơ đồ màn hình.</span></div><div class="actions"><button class="btn" type="button" data-act="retry">Thử lại</button></div></div>';
    } else {
      view.innerHTML = '<div class="view"><h1>Hệ thống đang bận</h1><p class="lead">Chưa tính được lúc này, bạn thử lại sau ít phút. Thông tin xe bạn đã nhập vẫn được giữ.</p><div class="actions"><button class="btn" type="button" data-act="retry">Thử lại</button><a class="btn outline" href="#/book">Đặt lịch thẩm định</a></div>' + (s.simulateError ? '<p class="lead" style="margin-top:18px">Bạn đang bật "Giả lập lỗi hệ thống" trong Sơ đồ màn hình. Tắt đi để tính bình thường.</p>' : "") + "</div>";
    }
  }
  function emptyState() {
    bar({ title: "TradeUp", back: function () { location.href = "index.html"; } });
    view.innerHTML = '<div class="view empty">' + I("car") + '<h1>Chưa có thông tin xe</h1><p>Khai xe cũ của bạn trước, mất khoảng 1 phút. Xe hãng nào cũng được.</p><a class="btn" href="#/intake">Bắt đầu khai thông tin ' + I("arrow") + "</a></div>";
  }

  /* ---------- S4 result ---------- */
  function result() {
    if (!complete()) return emptyState();
    if (!quoteOk()) return go("#/processing");
    var q = d.quote, o = TU.outcome(q), v = o.valuation, t = o.topup, inc = t.incentives || {}, ro = t.on_road || {};
    UI.setSynthetic(q.is_synthetic);
    bar({ title: label(), sub: TU.fmtInt(d.km) + " km", wide: true, back: function () { location.href = "index.html"; }, action: '<a class="btn sm" href="#/intake" data-act="editcar">Sửa</a>' });
    var m = models ? TU.findModel(models, d.targetId) : null;
    var targets = (models || []).map(function (x) { return '<button class="target" type="button" data-act="target" data-v="' + esc(x.model_id) + '" aria-pressed="' + (x.model_id === d.targetId) + '"><img src="' + TU.imgFor(x.model) + '" alt="" width="96" height="52">' + esc(x.model) + "</button>"; }).join("");
    var editions = m ? TU.activeEditions(m).map(function (e) { return '<option value="' + esc(e.edition_code) + '"' + (e.edition_code === d.edition ? " selected" : "") + ">" + esc(e.variant) + " · " + TU.fmtVnd(e.list_price_vnd) + "</option>"; }).join("") : "";
    var provinces = '<option value="">Chưa chọn (chưa tính phí lăn bánh)</option>' + ((opts && opts.provinces) || []).map(function (p) { return "<option" + (p === d.province ? " selected" : "") + ">" + esc(p) + "</option>"; }).join("");
    var downs = (opts && opts.down_payment_pct_options) || [20, 30, 40, 50, 60, 70, 80, 90], terms = ((opts && opts.term_months_options) || [12, 24, 36, 48, 60, 72, 84, 96]).map(function (x) { return '<option value="' + x + '"' + (x === Number(d.term) ? " selected" : "") + ">" + x + " tháng</option>"; }).join("");
    var lines = (inc.lines || []).map(function (x) { return '<li><button type="button" data-act="src" data-k="promo"><span class="k">' + esc(x.name) + "<small>" + esc(x.detail || "") + " · hiệu lực đến " + TU.fmtDate(x.valid_to) + '</small></span><span class="v">− ' + TU.fmtVnd(x.amount_vnd) + "</span></button></li>"; }).join("");
    var conf = v.confidence === "high" || !(v.confidence_notes || []).length ? "" : note(v.confidence === "low" ? "warn" : "", v.confidence === "low" ? "alert" : "info", (v.confidence_notes || []).map(esc).join(" "));
    var warns = [];
    (inc.notes || []).forEach(function (n) { warns.push(esc(n)); });
    if (inc.status === "stale") warns.unshift("<b>Bảng ưu đãi quá hạn xác minh nên chưa áp ưu đãi nào.</b>");
    if (ro.notes) ro.notes.forEach(function (n) { warns.push(esc(n)); });
    var onroad = ro.status === "ok"
      ? '<li><button type="button" data-act="src" data-k="onroad"><span class="k">Phí lăn bánh<small>' + esc(ro.province) + ", " + (ro.items || []).length + ' khoản</small></span><span class="v">+ ' + TU.fmtVnd(ro.fees_total_vnd) + '</span></button></li><li><button type="button" data-act="src" data-k="onroad"><span class="k">Giá lăn bánh sau ưu đãi</span><span class="v">' + TU.fmtVnd(t.on_road_total_after_incentives_vnd) + '</span></button></li><li class="total sub"><button type="button" data-act="src" data-k="top"><span class="k">Cần bù, đã gồm phí lăn bánh<small>' + TU.fmtRange(t.topup_on_road_min_vnd, t.topup_on_road_max_vnd) + '</small></span><span class="v">' + TU.fmtVnd(t.topup_on_road_suggested_vnd) + "</span></button></li>"
      : "";
    view.innerHTML = '<div class="view" id="res"><div class="result-grid">' +
      '<section class="panel reveal" aria-labelledby="h-used"><h2 id="h-used">Xe cũ · giá đề xuất <span class="tag">Ước tính từ giá rao</span></h2><button class="figure" type="button" data-act="src" data-k="used" aria-label="Giá đề xuất ' + TU.fmtVnd(v.offer_suggested_vnd) + ', xem cơ sở tính">' + TU.fmtVnd(v.offer_suggested_vnd) + "</button>" +
      '<p class="range-line">Khoảng ' + TU.fmtRange(v.offer_low_vnd, v.offer_high_vnd) + "</p>" +
      UI.rangeBar({ min: v.offer_low_vnd * 0.94, max: v.offer_high_vnd * 1.06, low: v.offer_low_vnd, high: v.offer_high_vnd, marker: v.offer_suggested_vnd, ticks: [], label: "Khoảng giá đề xuất " + TU.fmtRange(v.offer_low_vnd, v.offer_high_vnd) + ", giá đề xuất " + TU.fmtVnd(v.offer_suggested_vnd) }) +
      note("warn", "alert", esc(v.provisional_label) + ". Không phải giá thu mua.") + conf +
      '<p class="why">' + v.comparable_count + " xe tương đồng · " + esc(v.comps_source) + " · dữ liệu ngày " + TU.fmtDate(v.data_date) + ' <button class="link" type="button" data-act="src" data-k="used" style="border:0;background:none;padding:10px 0">Xem cơ sở tính</button></p></section>' +

      '<section class="panel" aria-labelledby="h-to"><h2 id="h-to">Đổi sang VinFast</h2><div class="targets" role="group" aria-label="Chọn mẫu VinFast">' + targets + '</div><div class="pick-row"><label><span class="field-label">Phiên bản</span><select class="input" id="edition">' + editions + '</select></label><label><span class="field-label">Tỉnh / thành đăng ký</span><select class="input" id="province">' + provinces + "</select></label></div>" + (d.province ? "" : note("warn", "alert", "<b>Chưa chọn tỉnh/thành đăng ký</b> nên chưa tính phí lăn bánh. Chọn tỉnh/thành ở trên để xem giá lăn bánh.")) +
      '<ul class="ledger"><li><button type="button" data-act="src" data-k="list"><span class="k">Giá niêm yết ' + esc(t.target_model + " " + t.target_variant) + '</span><span class="v">' + TU.fmtVnd(t.list_price_vnd) + "</span></button></li>" + lines +
      '<li><button type="button" data-act="src" data-k="top"><span class="k">Giá sau ưu đãi</span><span class="v">' + TU.fmtVnd(t.price_after_incentives_vnd) + '</span></button></li><li><button type="button" data-act="src" data-k="used"><span class="k">Xe cũ, giá đề xuất<small>khoảng ' + TU.fmtRange(t.used_price_low_vnd, t.used_price_high_vnd) + '</small></span><span class="v">− ' + TU.fmtVnd(t.used_price_suggested_vnd) + "</span></button></li>" +
      '<li class="total"><button type="button" data-act="src" data-k="top"><span class="k">Cần bù<small>chưa gồm phí lăn bánh · khoảng ' + TU.fmtRange(t.topup_min_vnd, t.topup_max_vnd) + '</small></span><span class="v">' + (t.topup_max_vnd === 0 ? "Không cần bù" : TU.fmtVnd(t.topup_suggested_vnd)) + "</span></button></li>" + onroad + "</ul>" +
      unconfirmed(inc) + (warns.length ? note("", "info", warns.join(" ")) : "") + "</section>" +

      '<section class="panel navy on-dark span" aria-labelledby="h-loan"><h2 id="h-loan">Trả góp <span class="tag dark">Ước tính</span></h2><div class="result-grid" style="gap:8px 32px"><div><div class="loan-row"><label for="down">Trả trước (trên tiền bù)</label><output id="downOut" for="down">' + d.down + '%</output><input type="range" id="down" min="' + downs[0] + '" max="' + downs[downs.length - 1] + '" step="10" value="' + d.down + '"></div><div class="loan-row"><label for="term">Kỳ hạn</label><span></span><select class="input" id="term" style="grid-column:1/-1">' + terms + '</select></div><ul class="rows num loan-rows"><li><span class="k">Số tiền vay (đề xuất)</span><b>' + TU.fmtVnd(t.financed_suggested_vnd) + '</b></li><li><span class="k">Lãi suất</span><b>' + TU.fmtPct(t.annual_rate_pct) + "/năm</b></li></ul></div>" +
      '<div><div class="monthly" aria-live="polite"><small>' + esc(t.monthly_payment_label) + '</small><button class="figure" type="button" data-act="src" data-k="loan" id="moOut">' + TU.fmtVnd(t.monthly_payment_suggested_vnd) + '</button><small>Khoảng ' + TU.fmtRange(t.monthly_payment_min_vnd, t.monthly_payment_max_vnd) + '</small><small>Tháng cuối ' + TU.fmtRange(t.last_payment_min_vnd, t.last_payment_max_vnd) + " · Tổng lãi " + TU.fmtRange(t.total_interest_min_vnd, t.total_interest_max_vnd) + '</small></div><div class="note">' + I("info") + "<span><b>" + esc(t.loan_label) + ".</b> Lãi cập nhật " + TU.fmtDate(t.rate_date) + ". " + (t.loan_is_assumption ? esc(t.loan_assumption_note) + " " : "") + (t.loan_rate_warning ? esc(t.loan_rate_warning) : "") + "</span></div></div></div></section>" +

      '<section class="span"><div class="note">' + I("info") + "<span>Tính ngày " + TU.fmtDate(q.as_of) + " · " + esc(TU.sourceLabel(q)) + '. TradeUp không thấy được máy, gầm và giấy tờ xe; thẩm định viên chốt giá chính thức.</span></div><div class="stickybar"><a class="btn outline" href="#/photos">' + I("camera") + "<span>" + (nPhotos() ? "Ảnh xe (" + nPhotos() + ")" : "Thêm ảnh cho thẩm định viên") + '</span></a><button class="btn outline" type="button" data-act="chat">' + I("chat") + '<span>Hỏi trợ lý về kết quả này</span></button><a class="btn" href="#/book">Đặt lịch thẩm định ' + I("arrow") + "</a></div></section></div></div>";
    $("down").addEventListener("input", function (e) { $("downOut").textContent = e.target.value + "%"; });
    $("down").addEventListener("change", function (e) { requote({ down: Number(e.target.value) }); });
    $("term").addEventListener("change", function (e) { requote({ term: Number(e.target.value) }); });
    $("edition").addEventListener("change", function (e) { requote({ edition: e.target.value }); });
    $("province").addEventListener("change", function (e) { requote({ province: e.target.value }); });
  }
  function nPhotos() { return Object.keys(d.photos || {}).filter(function (k) { return d.photos[k] === "ok"; }).length; }
  /* Unconfirmed incentives (§3): never added to the top-up; asked as quick questions, then the API is called again. */
  function unconfirmed(inc) {
    var u = inc.unconfirmed || [];
    if (!u.length) return "";
    var ask = function (cond, x) {
      var yn = function (k) { return '<button class="btn sm outline" type="button" data-act="cust" data-k="' + k + '" data-v="true">Có</button><button class="btn sm outline" type="button" data-act="cust" data-k="' + k + '" data-v="false">Không</button>'; };
      if (cond === "channel_o2o") return "<span>Mua qua kênh O2O?</span>" + yn(cond);
      if (cond === "owner_condition") return "<span>Bạn là chủ xe đứng tên?</span>" + yn(cond);
      if (cond === "vinclub_tier") return "<span>Hạng VinClub:</span>" + ((opts && opts.vinclub_tiers) || ["member", "gold", "platinum", "diamond"]).map(function (t) { return '<button class="btn sm outline" type="button" data-act="cust" data-k="vinclub_tier" data-v="' + t + '">' + esc(TU.TIER_LABEL[t] || t) + "</button>"; }).join("");
      if (cond === "fuel") {
        var labels = {}; ((opts && opts.fuels) || []).forEach(function (f) { labels[f.value] = f.label; });
        return "<span>Xe cũ chạy:</span>" + ((x && x.fuel_options && x.fuel_options.length) ? x.fuel_options : ["xang", "dau", "hybrid", "dien"]).map(function (f) { return '<button class="btn sm outline" type="button" data-act="fuel" data-v="' + esc(f) + '">' + esc(labels[f] || f) + "</button>"; }).join("");
      }
      if (cond === "audience") return "<span>Đối tượng:</span>" + ((opts && opts.audiences) || ["normal", "caqd"]).map(function (a) { return '<button class="btn sm outline" type="button" data-act="cust" data-k="audience" data-v="' + a + '">' + esc(TU.AUDIENCE_LABEL[a] || a) + "</button>"; }).join("");
      return "";
    };
    return '<div class="unconf"><b>Ưu đãi có thể có thêm (chưa tính vào tiền bù)</b>' + u.map(function (x) { return (x.needs_dealer_check ? '<p><span class="pill wait">Cần đại lý xác nhận</span></p>' : "") + "<p>" + esc(x.message) + '</p><div class="agent-actions">' + (x.needs_dealer_check ? "" : (x.missing_conditions || []).map(function (c) { return ask(c, x); }).join("")) + "</div>"; }).join("") + "</div>";
  }
  /* Re-run POST /valuations after a change on the result screen; the page never recomputes money itself. */
  function requote(change) {
    var prev = {}; Object.keys(change).forEach(function (k) { prev[k] = d[k]; d[k] = change[k]; });
    Store.save(); var my = ++reqSeq, res = $("res"); if (res) res.classList.add("busy");
    TU.api.valuate(TU.quoteBody(d)).then(function (r) {
      if (my !== reqSeq) return;
      var data = r.data || {};
      if (r.status === 200 && data.status === "ok") { d.quote = data; Store.save(); var x = window.scrollY; render(true); window.scrollTo(0, x); return; }
      if (r.status === 200 && data.ok) { d.quote = data; Store.save(); go("#/processing"); return; }
      undo(prev); UI.toast("Chưa tính lại được, giữ kết quả trước");
    }, function () { if (my === reqSeq) { undo(prev); UI.toast("Chưa kết nối được máy chủ, giữ kết quả trước"); } });
  }
  function undo(prev) { Object.keys(prev).forEach(function (k) { d[k] = prev[k]; }); Store.save(); var x = window.scrollY; render(true); window.scrollTo(0, x); }

  function sourceSheet(k) {
    var q = d.quote, o = TU.outcome(q), v = o.valuation, t = o.topup, h = "";
    var rows = function (list) { return '<ul class="rows num">' + list.map(function (r) { return '<li><span class="k">' + r[0] + "</span><b>" + r[1] + "</b></li>"; }).join("") + "</ul>"; };
    if (k === "used") {
      h = sheetHead("Cơ sở tính giá xe cũ") + '<ul class="explain">' + ((v.offer && v.offer.explanation) || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" +
        rows([["Trung vị giá rao, đã quy về đời và km", TU.fmtVnd(v.median_listing_price_vnd)]].concat((v.adjustments || []).map(function (a) { return [esc(a.label), (a.amount_vnd < 0 ? "− " : "+ ") + TU.fmtVnd(Math.abs(a.amount_vnd))]; })).concat([["<b>Giá đề xuất</b>", TU.fmtVnd(v.offer_suggested_vnd)], ["Khoảng đề xuất (±" + TU.fmtDec(v.offer ? v.offer.band_pct : 0) + "%)", TU.fmtRange(v.offer_low_vnd, v.offer_high_vnd)], ["Giá rao tham chiếu (P15–P85)", TU.fmtRange(v.price_low_vnd, v.price_high_vnd)]])) +
        '<p class="sheet-note" style="margin-top:12px">' + v.comparable_count + " xe tương đồng (tối thiểu " + v.min_comparables + "). Nguồn: " + esc(v.comps_source) + ". Ngày dữ liệu: " + TU.fmtDate(v.data_date) + ". " + esc(v.provisional_label) + ".</p>";
    } else if (k === "list") {
      var url = TU.safeUrl(t.list_price_source_url);
      h = sheetHead("Giá niêm yết " + esc(t.target_model + " " + t.target_variant)) + '<p class="figure" style="text-decoration:none">' + TU.fmtVnd(t.list_price_vnd) + '</p><p class="sheet-note" style="margin-top:10px">' + esc(t.list_price_note) + " Lấy ngày " + TU.fmtDate(t.list_price_captured_at) + "." + (url ? ' <a class="link" href="' + esc(url) + '" target="_blank" rel="noopener">Trang giá VinFast</a>' : "") + "</p>";
    } else if (k === "promo") {
      var inc = t.incentives || {};
      h = sheetHead("Ưu đãi đã áp") + ((inc.lines || []).length ? (inc.lines || []).map(function (x) {
        return '<div class="promo"><b>' + esc(x.name) + "</b>" + rows([["Mức", TU.fmtVnd(x.amount_vnd)], ["Cách tính", esc(x.detail || "")], ["Hiệu lực đến", TU.fmtDate(x.valid_to)]]) + ((x.sources || []).length ? '<p class="sheet-note">Nguồn: ' + x.sources.map(function (u, i) { var su = TU.safeUrl(u); return su ? '<a class="link" href="' + esc(su) + '" target="_blank" rel="noopener">[' + (i + 1) + "]</a>" : ""; }).join(" ") + "</p>" : "") + "</div>";
      }).join("") + rows([["<b>Tổng ưu đãi</b>", TU.fmtVnd(inc.total_discount_vnd)]]) : '<p class="sheet-note">Chưa áp ưu đãi nào.</p>') + '<p class="sheet-note" style="margin-top:10px">' + (inc.notes || []).map(esc).join(" ") + " Xác minh ngày " + TU.fmtDate(inc.verified_at) + ".</p>";
    } else if (k === "onroad") {
      var ro = t.on_road || {};
      h = sheetHead("Phí lăn bánh · " + esc(ro.province || "")) + rows((ro.items || []).map(function (x) { return [esc(x.name) + (x.legal_ref ? "<small>" + esc(x.legal_ref) + "</small>" : ""), TU.fmtVnd(x.amount_vnd)]; }).concat([["<b>Tổng phí</b>", TU.fmtVnd(ro.fees_total_vnd)], ["Giá lăn bánh sau ưu đãi", TU.fmtVnd(t.on_road_total_after_incentives_vnd)]])) + '<p class="sheet-note" style="margin-top:10px">' + (ro.notes || []).map(esc).join(" ") + "</p>";
    } else if (k === "top") {
      h = sheetHead("Cách tính khoản cần bù") + rows([["Giá niêm yết", TU.fmtVnd(t.list_price_vnd)], ["Ưu đãi đã áp", "− " + TU.fmtVnd((t.incentives || {}).total_discount_vnd)], ["Giá sau ưu đãi", TU.fmtVnd(t.price_after_incentives_vnd)], ["Xe cũ, giá đề xuất", "− " + TU.fmtVnd(t.used_price_suggested_vnd)], ["<b>Cần bù (đề xuất)</b>", TU.fmtVnd(t.topup_suggested_vnd)], ["Cần bù ít nhất (xe cũ ở đầu cao " + TU.fmtVnd(t.used_price_high_vnd) + ")", TU.fmtVnd(t.topup_min_vnd)], ["Cần bù nhiều nhất (xe cũ ở đầu thấp " + TU.fmtVnd(t.used_price_low_vnd) + ")", TU.fmtVnd(t.topup_max_vnd)]]) + '<p class="sheet-note" style="margin-top:10px">' + esc(t.list_price_note) + " Mọi số do engine tính; trang chỉ hiển thị.</p>";
    } else {
      h = sheetHead("Cách tính trả góp") + rows([["Cần bù (đề xuất)", TU.fmtVnd(t.topup_suggested_vnd)], ["Trả trước", t.down_payment_pct + "% tiền bù"], ["Số tiền vay", TU.fmtVnd(t.financed_suggested_vnd) + "<small>" + TU.fmtRange(t.financed_min_vnd, t.financed_max_vnd) + "</small>"], ["Kỳ hạn", t.term_months + " tháng"], ["Lãi suất", TU.fmtPct(t.annual_rate_pct) + "/năm"], ["<b>Tháng đầu</b>", TU.fmtVnd(t.monthly_payment_suggested_vnd)], ["Tháng cuối", TU.fmtVnd(t.last_payment_suggested_vnd)], ["Tổng lãi cả kỳ", TU.fmtVnd(t.total_interest_suggested_vnd)]]) + '<p class="sheet-note" style="margin-top:10px">' + esc(d.quote.result.loan_summary || "") + "</p>";
    }
    openSheet(h);
  }

  /* ---------- S6 photos (for the appraiser; the engine does not price photos yet, docs §6) ---------- */
  function photos() {
    if (!complete()) return emptyState();
    var okN = nPhotos();
    bar({ title: "Ảnh xe", sub: okN + " / " + SLOTS.length + " ảnh", back: function () { go("#/result"); } });
    var slots = SLOTS.map(function (k) {
      var st = d.photos[k];
      return '<button class="slot ' + (st || "") + '" type="button" data-act="slot" data-k="' + k + '" aria-label="' + k + (st === "ok" ? ", đã có ảnh, bấm để chụp lại" : st === "bad" ? ", ảnh chưa rõ, bấm để chụp lại" : ", thêm ảnh") + '">' + (st === "ok" ? (photoUrls[k] ? '<img src="' + photoUrls[k] + '" alt="">' : "") + "<span>" + I("check") + k + "</span>" : st === "bad" ? I("alert") + k : I("plus") + k) + "</button>";
    }).join("");
    var bad = SLOTS.filter(function (k) { return d.photos[k] === "bad"; });
    var rows = d.damages.map(function (x, i) {
      return '<li><div class="dmg-top"><span>' + esc(x.part) + " · " + esc(x.type) + " · " + esc(x.level) + '</span></div><div class="dmg-btns"><button class="btn sm outline" type="button" data-act="dmgedit" data-i="' + i + '">Sửa</button><button class="btn sm outline danger" type="button" data-act="dmgdel" data-i="' + i + '">Bỏ</button></div>' + (editingDmg === i ? dmgEditor(x, i) : "") + "</li>";
    }).join("");
    view.innerHTML = '<div class="view"><h1>Ảnh xe cho thẩm định viên</h1><p class="lead">Chụp đủ sáng, thấy rõ cả xe. Ảnh và hư hỏng bạn khai gửi kèm hồ sơ để thẩm định viên xem trước; khoảng giá hiện chưa trừ hư hỏng.</p><div class="slots">' + slots + "</div>" +
      (bad.length ? '<div class="note warn" style="margin-top:12px" role="alert">' + I("alert") + "<span>Ảnh " + bad.join(", ").toLowerCase() + " chưa rõ, chụp lại giúp mình.</span></div>" : "") +
      '<section class="panel" style="margin-top:14px"><h2>Hư hỏng bạn khai</h2>' + (d.damages.length ? '<ul class="dmg">' + rows + "</ul>" : '<p class="sheet-note">Chưa có hư hỏng nào. Tự thêm bên dưới nếu có.</p>') +
      (editingDmg === d.damages.length ? dmgEditor({ part: TU.DAMAGE_PARTS[0], type: "Xước", level: "Nhẹ" }, editingDmg) : '<button class="btn sm outline" type="button" data-act="dmgadd" style="margin-top:12px">' + I("plus") + "Thêm hư hỏng</button>") + "</section>" +
      '<label class="check" style="margin-top:14px"><input type="checkbox" id="consent"' + (d.consent ? " checked" : "") + '><span>Đồng ý lưu ảnh để thẩm định. Xóa được bất cứ lúc nào; không tích thì ảnh chỉ dùng tạm, không lưu.</span></label><div class="actions"><a class="btn" href="#/result">Xong, về kết quả ' + I("arrow") + "</a></div></div>";
    $("consent").addEventListener("change", function (e) { d.consent = e.target.checked; Store.save(); });
  }
  function dmgEditor(x, i) {
    var sel = function (id, list, cur) { return '<select class="input" id="' + id + '" aria-label="' + id + '">' + list.map(function (v) { return "<option" + (v === cur ? " selected" : "") + ">" + v + "</option>"; }).join("") + "</select>"; };
    return '<div class="dmg-edit" data-i="' + i + '">' + sel("dPart", TU.DAMAGE_PARTS, x.part) + sel("dType", TU.DAMAGE_TYPES, x.type) + sel("dLevel", TU.LEVELS, x.level) + '<button class="btn sm" type="button" data-act="dmgsave">Lưu hư hỏng</button></div>';
  }
  $("filePick").addEventListener("change", function (e) {
    var f = e.target.files[0]; if (!f || !pendingSlot) return;
    if (photoUrls[pendingSlot]) URL.revokeObjectURL(photoUrls[pendingSlot]);
    if (!/^image\//.test(f.type) || f.size < 15000) { d.photos[pendingSlot] = "bad"; delete photoUrls[pendingSlot]; }
    else { d.photos[pendingSlot] = "ok"; photoUrls[pendingSlot] = URL.createObjectURL(f); }
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
    var est = d.quote ? Store.snapshot(d.quote) : { ok: false };
    bar({ title: "Xác nhận gửi hồ sơ", back: function () { go("#/book"); } });
    view.innerHTML = '<div class="view"><h1>' + (editing ? "Xác nhận đổi lịch" : "Xác nhận gửi hồ sơ") + '</h1><section class="panel"><dl style="margin:0"><div class="kv"><dt>Đại lý nhận</dt><dd>' + esc(b.dealer) + '</dd></div><div class="kv"><dt>Lịch hẹn</dt><dd class="num">' + b.time + ", " + Store.viDate(b.date) + "</dd></div></dl>" +
      (editing ? "" : '<h2 style="margin-top:16px">Sẽ gửi cho đại lý</h2><ul class="sendlist"><li>Thông tin xe' + (complete() ? ": " + esc(label()) + ", " + TU.fmtInt(d.km) + " km" : "") + (nPhotos() && d.consent ? " + " + nPhotos() + " ảnh" : "") + "</li><li>" + (est.ok ? "Khoảng giá tạm tính: " + TU.fmtRange(est.low, est.high) + (est.target ? " (đổi sang " + esc(est.target) + ")" : "") : "Chưa có khoảng giá tạm tính") + "</li><li>Họ tên, số điện thoại: " + esc(b.name) + ", " + esc(b.phone) + '</li></ul><h2 style="margin-top:16px">Không gửi</h2><p>Lịch sử trò chuyện với trợ lý' + (nPhotos() && !d.consent ? ", ảnh xe (bạn chưa đồng ý lưu ảnh)" : "") + '.</p><p style="margin-top:8px"><button class="link" type="button" data-act="policy" style="border:0;background:none;padding:10px 0">Chính sách dữ liệu</button></p>') +
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
      (off ? li("off", "Đã hủy hồ sơ", "Đại lý đã được báo hủy lịch hẹn.", "") : li(c.inspected ? "ok" : "now", "Thẩm định xe", c.inspected ? "Thẩm định viên đã xem xe trực tiếp." : done ? "Chưa ghi nhận thẩm định xe trực tiếp." : "Thẩm định viên xem xe vào lịch hẹn.", "") + li(done ? "ok" : "todo", "Có giá chính thức", done ? "Đại lý đã chốt giá" + (c.inspected ? "." : " theo hồ sơ, chưa thẩm định xe.") : "Hiện ngay sau khi thẩm định viên chốt.", "")) + "</ol>" +
      (done ? '<div class="official"><small>Giá chính thức</small><b>' + TU.fmtVnd(c.official.price) + "</b><span>" + esc(c.official.by) + " chốt lúc " + esc(c.official.at) + (c.official.reason ? ". Lý do ngoài khoảng tạm tính: " + esc(c.official.reason) : "") + "</span></div>" : "") + "</section>" +
      (off ? '<div class="actions"><a class="btn" href="#/intake" data-act="newcase">Tạo hồ sơ mới</a></div>' : done ? '<div class="note" style="margin-top:14px">' + I("info") + "<span>Giá chính thức có hiệu lực theo điều kiện của đại lý. Liên hệ " + esc(c.booking.dealer) + ' để làm thủ tục đổi xe.</span></div>' : '<div class="note" style="margin-top:14px">' + I("calendar") + '<span><b>Việc của bạn:</b> mang xe và giấy tờ tới đại lý đúng hẹn. <button class="link" type="button" data-act="openchat" style="border:0;background:none;padding:0">Hỏi trợ lý cần mang gì</button></span></div><div class="actions row"><button class="btn outline" type="button" data-act="resched">Đổi lịch</button><button class="btn outline danger" type="button" data-act="cancel">Hủy hồ sơ</button></div>') +
      '<p class="lead" style="margin-top:22px;font-size:15px">Bản thử: <a class="link" href="dealer.html#/case/' + c.id + '">mở bàn thẩm định viên</a> để chốt giá hồ sơ này, rồi quay lại đây. <button class="link" type="button" data-act="othercase" style="border:0;background:none;padding:10px 0">Xem hồ sơ khác</button></p></div>';
  }

  /* ---------- events ---------- */
  var acts = {
    jump: function (el) { d.step = Number(el.dataset.i); otherOpen = false; Store.save(); render(); },
    pick: function (el) { setField(d.step, el.dataset.v); },
    other: function () { otherOpen = !otherOpen; render(); },
    notrim: function () { setField(3, "Không rõ"); },
    cond: function (el) { d[el.dataset.k] = el.dataset.v; d.quote = null; Store.save(); el.parentNode.querySelectorAll(".choice").forEach(function (c) { c.setAttribute("aria-checked", c === el); }); $("g-" + el.dataset.k).classList.remove("missing"); },
    finish: function () {
      var miss = [["accident", "va chạm"], ["flood", "ngập nước"], ["owners", "số đời chủ"]].filter(function (p) { return !d[p[0]]; });
      if (miss.length) {
        miss.forEach(function (p) { $("g-" + p[0]).classList.add("missing"); });
        $("condAgent").innerHTML = agent("Mình còn thiếu thông tin về <b>" + miss.map(function (p) { return p[1]; }).join(", ") + "</b>. Bạn chọn giúp mình nhé.");
        $("g-" + miss[0][0]).scrollIntoView({ behavior: "smooth", block: "center" }); return;
      }
      d.quote = null; Store.save(); go("#/processing");
    },
    kmfix: function () { if ($("kmAgent")) $("kmAgent").innerHTML = ""; d.step = 4; Store.save(); if ($("kmIn")) { $("kmIn").focus(); $("kmIn").select(); } else render(); },
    yearfix: function () { d.step = 2; Store.save(); render(); },
    suggest: function (el) { d.brand = el.dataset.b; d.model = el.dataset.m; d.trim = d.trim || ""; d.quote = null; d.step = firstMissing(); Store.save(); render(); },
    retry: function () { d.quote = null; go("#/processing"); },
    editcar: function () { d.step = 0; Store.save(); },
    target: function (el) { var m = TU.findModel(models || [], el.dataset.v); requote({ targetId: el.dataset.v, edition: TU.defaultEdition(m) }); },
    fuel: function (el) { requote({ fuel: el.dataset.v }); },
    cust: function (el) { var v = el.dataset.v === "true" ? true : el.dataset.v === "false" ? false : el.dataset.v, c = JSON.parse(JSON.stringify(d.customer || {})); c[el.dataset.k] = v; requote({ customer: c }); },
    src: function (el) { sourceSheet(el.dataset.k); },
    chat: function () { TUChat.open({ quote: d.quote, profile: TU.quoteBody(d) }); },
    openchat: function () { TUChat.open(null); },
    slot: function (el) { pendingSlot = el.dataset.k; $("filePick").click(); },
    dmgedit: function (el) { editingDmg = editingDmg === Number(el.dataset.i) ? -1 : Number(el.dataset.i); render(true); },
    dmgadd: function () { editingDmg = d.damages.length; render(true); },
    dmgdel: function (el) { d.damages.splice(Number(el.dataset.i), 1); editingDmg = -1; Store.save(); render(true); },
    dmgsave: function (el) { var i = Number(el.parentNode.dataset.i); d.damages[i] = { part: $("dPart").value, type: $("dType").value, level: $("dLevel").value, on: true }; editingDmg = -1; Store.save(); render(true); },
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
    } else if (kind === "trim") {
      setField(3, $("trimIn").value.trim() || "Không rõ");
    } else if (kind === "km") {
      var raw = $("kmIn").value.replace(/\D/g, "");
      if (raw === "") { $("kmErr").textContent = "Nhập số km xe đã đi, ví dụ 62.000."; $("kmIn").setAttribute("aria-invalid", "true"); $("kmIn").focus(); return; }
      d.km = Number(raw); d.quote = null; Store.save(); checkCar();
    } else if (kind === "free") {
      var text = $("freeIn").value.trim(); if (!text) return;
      var got = TU.parseFreeText(text, opts ? opts.brands : []), keys = Object.keys(got);
      if (!keys.length) { agentMsg = "Mình chưa tách được thông tin xe từ câu này. Bạn thử ghi rõ dòng xe, đời và số km, ví dụ “Vios 2019 bản G, 6 vạn, xăng”."; render(); return; }
      if (got.brand && got.brand !== d.brand) { d.model = ""; d.trim = ""; }
      if (got.model && got.model !== d.model) d.trim = "";
      Object.assign(d, got); d.quote = null;
      d.step = firstMissing();
      var names = { brand: "hãng", model: "dòng xe", year: "đời", km: "số km", trim: "phiên bản", fuel: "nhiên liệu" };
      agentMsg = "Mình đã hiểu: <b>" + keys.map(function (k) { return names[k] + " " + esc(k === "km" ? TU.fmtInt(got.km) + " km" : got[k]); }).join(", ") + "</b>. " + (d.step < N - 1 ? "Còn thiếu phần bên trên, bạn chọn giúp mình." : "Bạn cho mình biết thêm tình trạng xe nhé.");
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
    var r = routes[location.hash] || (complete() ? (quoteOk() ? result : processing) : intake);
    r();
    if (keep !== true) { window.scrollTo(0, 0); }
  }
  window.addEventListener("hashchange", function () { otherOpen = false; editingDmg = -1; render(); });
  window.addEventListener("storage", function (e) { if (e.key && e.key.indexOf("tradeup.prototype") === 0) location.reload(); });
  UI.mountMap();
  render();
})();
