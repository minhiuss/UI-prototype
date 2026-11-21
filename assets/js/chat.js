/* TradeUp agent chat on every customer page: POST /api/v1/trade-in/chat (docs/ui-integration.md §7).
   - Shows `answer` verbatim (escaped), one bubble per turn; buttons from `ui_options[pending_field]` send `selection`.
   - Keeps the server-issued `session_id` per tab (sessionStorage); 404 unknown_session opens a new session.
   - Quote turns get a card built only from engine fields (`valuation`, `topup`). When the customer asked for other loan
     terms than the ones used, the card is re-quoted with POST /valuations using those terms (same engine).
   - On #result, TUChat.open({quote, profile}) swaps the start chips for contextual ones (change model / loan term, why this range, incentive validity, what to bring). */
(function () {
  "use strict";
  var esc = TU.esc, I = UI.icon, KEY = "tradeup.chat.v1";
  var st = load(), busy = false, ctx = null, brands = null, dlg, logEl, input, chipsEl, sendBtn;

  /* No profile yet: chips only suggest WHAT to ask (no car or loan data pre-filled); the agent asks for what it needs.
     The one exception is the labelled demo example, which sends a sample Vios (Demo Day) and says so in the chat bubble. */
  var START_CHIPS = [
    "Xe cũ của mình định giá thế nào?",
    "Đổi sang xe VinFast thì bù bao nhiêu?",
    "Trả góp được tính ra sao?",
    "Chính sách bảo hành pin VinFast"
  ];
  var SAMPLE = {
    label: "Thử với ví dụ mẫu",
    text: "Tôi có Vios 2019 bản G, đi 60.000 km, xe zin, muốn đổi lên VF 5, trả trước 30% vay 5 năm"
  };
  /* Profile from the result screen: contextual chips. "switch" and "term" act in the result page (the agent would only
     re-quote the profile's own model and term); the rest answer from the quote or the policy texts. */
  var RESULT_CHIPS = [
    { id: "switch", t: "Đổi sang mẫu khác" },
    { id: "term", t: "Đổi thời hạn vay" },
    { id: "why", t: "Vì sao giá xe tôi nằm trong khoảng này?" },
    { id: "promo", t: "Ưu đãi này áp dụng đến khi nào?" },
    { id: "bring", t: "Tôi cần mang gì khi đi thẩm định?" }
  ];

  function load() {
    try { var x = JSON.parse(sessionStorage.getItem(KEY)); if (x && x.log) return x; } catch (e) { /* ignore */ }
    return { sid: null, log: [], profile: {}, loan: {} };
  }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* private mode */ } }

  function mount() {
    if (document.getElementById("chatDlg")) return;
    document.body.insertAdjacentHTML("beforeend",
      '<button class="chat-fab" type="button" id="chatOpen" aria-haspopup="dialog" aria-controls="chatDlg">' + I("chat") + "<span>Hỏi trợ lý</span></button>" +
      '<dialog class="sheet chat-panel" id="chatDlg" aria-labelledby="chatTitle"><div class="sheet-head"><div><h2 id="chatTitle">Trợ lý TradeUp</h2><small class="chat-sub">Định giá xe cũ, tiền bù, trả góp, chính sách VinFast</small></div><div class="chat-head-btns"><button class="btn sm outline" type="button" id="chatNew">Phiên mới</button><button class="iconbtn" type="button" data-close aria-label="Đóng">' + I("x") + '</button></div></div>' +
      '<div class="chat-log" id="chatLog" aria-live="polite"></div><div class="chips" id="chatChips"></div>' +
      '<form id="chatForm" class="chat-form"><label class="sr-only" for="chatIn">Tin nhắn cho trợ lý</label><input class="input" id="chatIn" type="text" maxlength="4000" autocomplete="off" placeholder="Hỏi về giá xe cũ, tiền bù, trả góp…"><button class="btn" id="chatSend" type="submit" aria-label="Gửi">' + I("send") + "</button></form>" +
      '<p class="chat-foot">Mọi số tiền do engine TradeUp tính; trợ lý chỉ diễn đạt. Không gửi số điện thoại, CCCD hay mật khẩu qua đây.</p></dialog>');
    dlg = document.getElementById("chatDlg"); logEl = document.getElementById("chatLog"); chipsEl = document.getElementById("chatChips");
    input = document.getElementById("chatIn"); sendBtn = document.getElementById("chatSend");
    document.getElementById("chatOpen").addEventListener("click", function () { open(null); });
    dlg.addEventListener("click", function (e) {
      if (e.target === dlg || e.target.closest("[data-close]")) { dlg.close(); return; }
      var b = e.target.closest("[data-opt]");
      if (b && !busy) { var m = st.log[Number(b.dataset.i)]; m.used = true; say(b.dataset.label, { selection: { field: b.dataset.field, value: b.dataset.opt } }); return; }
      var c = e.target.closest("[data-chip]");
      if (c && !busy) { chip(c.dataset.chip, c.textContent); return; }
      var g = e.target.closest("[data-go]");
      if (g) goDetail(st.log[Number(g.dataset.go)].card);
    });
    document.getElementById("chatForm").addEventListener("submit", function (e) {
      e.preventDefault(); var t = input.value.trim(); if (!t || busy) return;
      input.value = ""; say(t, { message: t });
    });
    document.getElementById("chatNew").addEventListener("click", function () { st = { sid: null, log: [], profile: {}, loan: {} }; save(); render(); input.focus(); });
  }

  function open(context) {
    mount(); ctx = context || ctx;
    if (!context && !/#\/result/.test(location.hash)) ctx = null;
    render();
    if (!dlg.open) dlg.showModal();
    setTimeout(function () { input.focus(); }, 30);
  }

  /* ---------- rendering ---------- */
  function render() {
    var last = st.log.length - 1;
    logEl.innerHTML = (st.log.length ? "" : '<div class="msg bot"><p>Chào bạn, mình là trợ lý đổi xe TradeUp. Kể mình nghe xe cũ của bạn (hãng, dòng, đời, số km) và mẫu VinFast bạn muốn đổi, mình ước tính khoảng giá, tiền bù và trả góp.</p></div>') +
      st.log.map(function (m, i) { return bubble(m, i, i === last); }).join("") + (busy ? '<div class="msg bot typing" aria-label="Trợ lý đang trả lời"><i></i><i></i><i></i></div>' : "");
    var chips = ctx && ctx.quote ? RESULT_CHIPS.map(function (c) { return '<button class="chip" type="button" data-chip="' + c.id + '">' + esc(c.t) + "</button>"; }) :
      (st.log.length ? [] : START_CHIPS.map(function (t) { return '<button class="chip" type="button" data-chip="text">' + esc(t) + "</button>"; })
        .concat(['<button class="chip sample" type="button" data-chip="sample">' + esc(SAMPLE.label) + "</button>"]));
    chipsEl.innerHTML = chips.join(""); chipsEl.hidden = !chips.length;
    input.disabled = busy; sendBtn.disabled = busy;
    logEl.scrollTop = logEl.scrollHeight;
  }
  function bubble(m, i, isLast) {
    if (m.who === "me") return '<div class="msg me">' + esc(m.text) + "</div>";
    if (m.who === "sys") return '<div class="msg sys" role="alert">' + I("alert") + "<span>" + esc(m.text) + "</span></div>";
    if (m.local) return '<div class="msg bot local"><small class="msg-tag">' + I("calc") + esc(m.title) + "</small>" + m.lines.map(function (l) { return "<p>" + esc(l) + "</p>"; }).join("") + "</div>";
    var r = m.reply, h = '<div class="msg bot' + (r.route === "refuse" ? " refuse" : "") + '">';
    if (r.route === "refuse") h += '<small class="msg-tag">' + I("shield") + "Ngoài phạm vi hỗ trợ</small>";
    if (m.asked) h += '<small class="msg-tag">' + I("search") + "Đã tra văn bản: “" + esc(m.asked) + "”</small>";
    h += TU.paras(r.answer);
    if (r.citations && r.citations.length) {
      var seen = {}, labels = r.citations.map(function (c) { return c.label || c.title; }).filter(function (l) { if (!l || seen[l]) return false; seen[l] = 1; return true; });
      h += '<div class="cites"><b>Nguồn</b><ul>' + labels.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul></div>";
    }
    if (m.card) h += card(m.card, i);
    if (isLast && !m.used && r.pending_field && r.ui_options && r.ui_options[r.pending_field]) {
      h += '<div class="agent-actions">' + r.ui_options[r.pending_field].map(function (o) { return '<button class="chip opt" type="button" data-i="' + i + '" data-field="' + esc(r.pending_field) + '" data-opt="' + esc(o.value) + '" data-label="' + esc(o.label) + '">' + esc(o.label) + "</button>"; }).join("") + "</div>";
    }
    if (r.route === "handoff") h += '<div class="agent-actions"><a class="btn sm" href="flow.html#/intake">Khai từng bước</a><a class="btn sm outline" href="flow.html#/book">Đặt lịch thẩm định</a></div>';
    return h + "</div>";
  }
  function card(c, i) {
    var row = function (k, v, sub) { return '<li><span class="k">' + k + (sub ? "<small>" + sub + "</small>" : "") + '</span><span class="v">' + v + "</span></li>"; };
    var h = '<div class="qcard"><div class="qcard-head">' + I("calc") + "<b>" + esc(c.title) + "</b></div>" + (c.note ? '<p class="qnote">' + esc(c.note) + "</p>" : "") + '<ul class="qrows">' +
      row("Xe cũ, giá đề xuất", TU.fmtVnd(c.used[1]), "Ước tính từ giá rao · " + TU.fmtRange(c.used[0], c.used[2])) +
      row("Cần bù thêm", TU.fmtVnd(c.topup[1]), "chưa gồm phí lăn bánh · " + TU.fmtRange(c.topup[0], c.topup[2])) +
      (c.onroad ? row("Cần bù, đã gồm phí lăn bánh", TU.fmtVnd(c.onroad[1]), TU.fmtRange(c.onroad[0], c.onroad[2])) : "") +
      row(esc(c.monthlyLabel || "Khoản trả tháng đầu"), TU.fmtVnd(c.monthly[1]), TU.fmtRange(c.monthly[0], c.monthly[2])) +
      row("Tháng cuối · tổng lãi", TU.fmtRange(c.last[0], c.last[1]), "Tổng lãi " + TU.fmtRange(c.interest[0], c.interest[1])) + "</ul>" +
      '<p class="qmeta">Trả trước ' + c.down + "% tiền bù · " + c.term + " tháng · lãi " + TU.fmtPct(c.rate) + "/năm (cập nhật " + TU.fmtDate(c.rateDate) + "). " + esc(c.loanLabel || "") + "</p>" +
      '<p class="qmeta"><b>Nguồn:</b> ' + c.comps + " xe tương đồng, " + esc(c.compsSource || "") + ", dữ liệu ngày " + TU.fmtDate(c.dataDate) + (c.incentives.length ? ". Ưu đãi: " + c.incentives.map(function (x) { return esc(x.name) + " (đến " + TU.fmtDate(x.valid_to) + ")"; }).join("; ") : "") + ". Giá niêm yết " + esc(c.model) + ": " + TU.fmtVnd(c.list) + ", sau ưu đãi " + TU.fmtVnd(c.afterIncentives) + ".</p>" +
      '<button class="btn sm block" type="button" data-go="' + i + '">Xem chi tiết &amp; đặt lịch ' + I("arrow") + "</button></div>";
    return h;
  }

  /* ---------- quote card (engine fields only) ---------- */
  function cardFrom(v, t, title, note, draft) {
    return {
      title: title, note: note, model: t.target_model + " " + t.target_variant, list: t.list_price_vnd, afterIncentives: t.price_after_incentives_vnd,
      used: [v.offer_low_vnd, v.offer_suggested_vnd, v.offer_high_vnd], comps: v.comparable_count, compsSource: v.comps_source, dataDate: v.data_date,
      topup: [t.topup_min_vnd, t.topup_suggested_vnd, t.topup_max_vnd],
      onroad: t.topup_on_road_suggested_vnd != null ? [t.topup_on_road_min_vnd, t.topup_on_road_suggested_vnd, t.topup_on_road_max_vnd] : null,
      monthly: [t.monthly_payment_min_vnd, t.monthly_payment_suggested_vnd, t.monthly_payment_max_vnd], monthlyLabel: t.monthly_payment_label,
      last: [t.last_payment_min_vnd, t.last_payment_max_vnd], interest: [t.total_interest_min_vnd, t.total_interest_max_vnd],
      down: t.down_payment_pct, term: t.term_months, rate: t.annual_rate_pct, rateDate: t.rate_date, loanLabel: t.loan_label,
      incentives: ((t.incentives && t.incentives.lines) || []).map(function (x) { return { name: x.name, valid_to: x.valid_to }; }),
      draft: draft
    };
  }
  function draftFromReply(t, loan) {
    var p = st.profile, province = (t.on_road && t.on_road.status === "ok" && t.on_road.province) || p.province || "";
    return { brand: p.brand, model: p.model, year: p.year, km: p.km, fuel: p.fuel, trim: "", targetId: t.target_model_id, edition: t.target_edition_code, province: province, down: loan.down || t.down_payment_pct, term: loan.term || t.term_months };
  }
  /* Safety net: the agent reads loan terms from chat since #46, so this rarely fires. When the loan the agent used still
     differs from what the customer typed, re-quote with those terms and keep the card only if the engine valued the same
     car (same suggested price), so the card never disagrees with the answer above it. */
  function attachCard(entry, r) {
    var v = r.valuation, t = r.topup, loan = st.loan;
    if (!v || !t) return Promise.resolve();
    var base = draftFromReply(t, {});
    entry.card = cardFrom(v, t, "Báo giá tạm tính · " + t.target_model + " " + t.target_variant, "", base);
    var wantDown = loan.down && loan.down !== t.down_payment_pct, wantTerm = loan.term && loan.term !== t.term_months;
    if (!(wantDown || wantTerm) || !base.brand || !base.model || !base.year || base.km == null) return Promise.resolve();
    var d = draftFromReply(t, loan);
    return TU.api.valuate(TU.quoteBody(d)).then(function (res) {
      var o = TU.outcome(res.data), v2 = o.valuation, t2 = o.topup;
      if (res.status !== 200 || !t2 || !v2 || v2.offer_suggested_vnd !== v.offer_suggested_vnd) return;
      entry.card = cardFrom(v2, t2, "Theo yêu cầu của bạn: trả trước " + t2.down_payment_pct + "% · " + t2.term_months + " tháng", "Đoạn trả góp ở trên dùng vay mặc định của nhóm (trả trước " + t.down_payment_pct + "%, " + t.term_months + " tháng). Bảng này tính lại theo yêu cầu của bạn bằng cùng engine.", d);
    }, function () { /* keep the agent's own card */ });
  }
  function goDetail(c) {
    if (!c || !c.draft) return;
    var s = Store.get(), d = s.draft;
    Object.assign(d, { brand: c.draft.brand || d.brand, model: c.draft.model || d.model, year: c.draft.year || d.year, km: c.draft.km != null ? c.draft.km : d.km, fuel: c.draft.fuel || d.fuel, trim: d.brand === c.draft.brand && d.model === c.draft.model ? d.trim : "", targetId: c.draft.targetId, edition: c.draft.edition, province: c.draft.province || d.province, down: c.draft.down, term: c.draft.term, step: 6, quote: null });
    Store.save();
    if (/flow\.html$/.test(location.pathname)) { dlg.close(); if (location.hash === "#/processing") window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = "#/processing"; }
    else location.href = "flow.html#/processing";
  }

  /* ---------- talking to the agent ---------- */
  function remember(text, selection) {
    if (text) {
      var got = TU.parseFreeText(text, brands || []), loan = TU.parseLoan(text);
      Object.keys(got).forEach(function (k) { if (k !== "trim") st.profile[k] = got[k]; });
      Object.keys(loan).forEach(function (k) { st.loan[k] = loan[k]; });
    }
    if (selection) {
      var map = { fuel: "fuel", province: "province", brand: "brand", model: "model", year: "year", mileage_km: "km" };
      if (map[selection.field]) st.profile[map[selection.field]] = selection.field === "year" || selection.field === "mileage_km" ? Number(selection.value) : selection.value;
    }
  }
  function say(label, body, asked) {
    st.log.push({ who: "me", text: label });
    remember(body.message, body.selection);
    return send(body, asked, 0);
  }
  function send(body, asked, attempt) {
    busy = true; save(); render();
    var payload = Object.assign({}, body);
    // The profile (the quote request already validated by the engine) only opens a NEW session; a running session keeps its own state.
    if (st.sid) payload.session_id = st.sid;
    else if (ctx && ctx.profile) payload.profile = ctx.profile;
    return TU.api.chat(payload).then(function (res) {
      var data = res.data || {}, code = data.error && data.error.code;
      if (res.status === 200) {
        if (data.session_id) st.sid = data.session_id;
        if (typeof data.is_synthetic === "boolean") UI.setSynthetic(data.is_synthetic);
        var entry = { who: "bot", asked: asked || "", reply: { answer: data.answer, route: data.route, pending_field: data.pending_field, ui_options: data.pending_field && data.ui_options ? pick(data.ui_options, data.pending_field) : {}, citations: (data.citations || []).map(function (c) { return { label: c.label, title: c.title }; }) } };
        return attachCard(entry, data).then(function () { st.log.push(entry); });
      }
      if (res.status === 404 && code === "unknown_session" && attempt < 1) { st.sid = null; return send(body, asked, attempt + 1); }
      // The server refused the profile (for example a model that is no longer offered): keep chatting without it.
      if (res.status === 422 && payload.profile && attempt < 1) { ctx = Object.assign({}, ctx, { profile: null }); return send(body, asked, attempt + 1); }
      if (res.status === 409 && attempt < 2) return wait(1500).then(function () { return send(body, asked, attempt + 1); });
      var retry = res.headers && res.headers.get && res.headers.get("Retry-After");
      st.log.push({ who: "sys", text: res.status === 429 ? "Bạn gửi hơi nhanh. Thử lại sau " + (retry || "ít") + " giây nhé." : res.status === 422 ? "Tin nhắn chưa hợp lệ (tối đa 4.000 ký tự)." : res.status === 409 ? "Câu trước vẫn đang được xử lý, bạn đợi một chút rồi gửi lại." : "Trợ lý gặp lỗi (" + res.status + "), bạn thử lại sau ít phút." });
    }, function () {
      st.log.push({ who: "sys", text: "Chưa kết nối được máy chủ TradeUp (" + TU.api.base() + "). Chạy “uvicorn src.main:app” rồi thử lại, hoặc đổi máy chủ trong Sơ đồ màn hình." });
    }).then(function () { busy = false; save(); render(); if (dlg.open) input.focus(); });
  }
  function pick(opts, field) { var o = {}; o[field] = opts[field]; return o; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------- #result sub-features ---------- */
  function chip(id, text) {
    if (id === "text") return say(text, { message: text });
    if (id === "sample") return say("Ví dụ mẫu: " + SAMPLE.text, { message: SAMPLE.text });
    if (id === "switch" || id === "term") { // the controls live on the result page: close the chat and put the customer on them
      dlg.close();
      var ctl = id === "term" ? document.getElementById("term") : document.querySelector('.targets [aria-pressed="true"]') || document.getElementById("edition");
      if (ctl) { ctl.scrollIntoView({ block: "center" }); ctl.focus(); }
      return;
    }
    var resp = ctx && ctx.quote, o = TU.outcome(resp), v = o.valuation || {}, t = o.topup || {};
    st.log.push({ who: "me", text: text });
    if (id === "why") {
      var lines = ((v.offer && v.offer.explanation) || []).slice();
      lines.push("Dựa trên " + v.comparable_count + " xe tương đồng (" + (v.comps_source || "") + "), dữ liệu ngày " + TU.fmtDate(v.data_date) + ".");
      (v.confidence_notes || []).forEach(function (n) { lines.push(n); });
      if (v.provisional_label) lines.push(v.provisional_label + ".");
      st.log.push({ who: "bot", local: true, title: "Từ báo giá của bạn (engine tính)", lines: lines });
      save(); render(); return;
    }
    if (id === "promo") {
      var inc = t.incentives || {}, ls = (inc.lines || []).map(function (x) { return x.name + ": " + TU.fmtVnd(x.amount_vnd) + ", hiệu lực đến " + TU.fmtDate(x.valid_to) + "."; });
      if (!ls.length) ls.push(inc.status === "stale" ? "Bảng ưu đãi quá hạn xác minh nên chưa áp ưu đãi nào." : "Báo giá này chưa áp ưu đãi nào.");
      (inc.unconfirmed || []).forEach(function (u) { ls.push(u.message); });
      if (inc.verified_at) ls.push("Bảng ưu đãi xác minh ngày " + TU.fmtDate(inc.verified_at) + ". Ưu đãi có thể thay đổi; đại lý xác nhận lần cuối khi ký hợp đồng.");
      st.log.push({ who: "bot", local: true, title: "Từ báo giá của bạn (engine tính)", lines: ls });
      var first = (inc.lines || [])[0], q = first ? "Chính sách " + first.name.replace(/^Ưu đãi\s+/i, "") + " áp dụng đến khi nào?" : "Chính sách ưu đãi đổi xe xăng sang xe điện VinFast áp dụng đến khi nào?";
      return send({ message: q }, q, 0);
    }
    if (id === "bring") {
      var q2 = "Đi thẩm định cần mang giấy tờ gì?";
      return send({ message: q2 }, q2, 0).then(function () {
        st.log.push({ who: "bot", local: true, title: "Lưu ý của TradeUp", lines: ["Mang xe tới đúng lịch hẹn. Danh sách giấy tờ cuối cùng do đại lý xác nhận khi gọi xác nhận lịch; trợ lý chỉ trích các văn bản chính sách đang có."] });
        save(); render();
      });
    }
  }

  TU.api.options().then(function (o) { brands = o.result.brands; }, function () { brands = []; });
  window.TUChat = { open: open, mount: mount };
  mount();
})();
