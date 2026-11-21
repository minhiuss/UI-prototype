/* TradeUp prototype: icon sprite, range bar, demo strip, and the screen map used for testing (with the API server field). */
(function () {
  "use strict";
  var P = {
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.4"/>',
    alert: '<path d="M12 4l9 15.5H3L12 4z"/><path d="M12 10v4.5M12 17v.3"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/>',
    usercheck: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c.6-3.6 3.2-5.5 6.5-5.5 1.3 0 2.5.3 3.5.9M15 18.5l2 2 4-4.5"/>',
    camera: '<path d="M4 8.5h3l1.5-2.5h7L17 8.5h3v10.5H4z"/><circle cx="12" cy="13.5" r="3.3"/>',
    chat: '<path d="M4 5h16v11H10l-4.5 3.5V16H4z"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    car: '<path d="M4 16.5v-3.2l1.8-4.6c.3-.8 1-1.2 1.800-1.200h8.800c.8 0 1.500.4 1.800 1.200l1.800 4.600v3.200M3.500 13.300h17M6.500 16.500h11"/><circle cx="7.500" cy="16.800" r="1.700"/><circle cx="16.500" cy="16.800" r="1.700"/>',
    tag: '<path d="M4 4h7.500l8.500 8.500-7.500 7.500L4 11.500z"/><circle cx="8.300" cy="8.300" r="1.200"/>',
    map: '<path d="M4 6.500l5.500-2 5 2 5.500-2v13l-5.500 2-5-2-5.500 2zM9.500 4.500v13M14.500 6.500v13"/>',
    edit: '<path d="M5 19l1-4.200L16.500 4.300l3.200 3.200L9.200 18z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.500l3.500 2"/>',
    shield: '<path d="M12 3.500l7.500 3v5.500c0 4.300-3 7.300-7.500 8.500-4.500-1.200-7.500-4.200-7.500-8.500V6.500z"/><path d="M8.800 12.200l2.300 2.300 4.200-4.600"/>',
    chevron: '<path d="M7 10l5 5 5-5"/>',
    send: '<path d="M4 11.500L20 4l-6.500 16-2.500-6.500z"/>'
  };
  var sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0" aria-hidden="true">';
  Object.keys(P).forEach(function (k) { sprite += '<symbol id="i-' + k + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + P[k] + "</symbol>"; });
  document.body.insertAdjacentHTML("afterbegin", sprite + "</svg>");

  function icon(name, cls) { return '<svg class="ic ' + (cls || "") + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }

  /* Range bar: the band low–high drawn on a scale, optional ticks ({v,label}) and a marker. */
  function rangeBar(o) {
    var span = o.max - o.min || 1, pc = function (v) { return Math.max(0, Math.min(100, ((v - o.min) / span) * 100)); };
    var html = '<div class="rbar' + (o.cls ? " " + o.cls : "") + '" role="img" aria-label="' + TU.esc(o.label) + '"><div class="rbar-track"><div class="rbar-band" style="left:' + pc(o.low) + "%;right:" + (100 - pc(o.high)) + '%"></div>';
    (o.ticks || []).forEach(function (t) { html += '<span class="rbar-tick' + (pc(t.v) > 70 ? " end" : "") + '" style="left:' + pc(t.v) + '%"><i>' + TU.esc(t.label) + "</i></span>"; });
    if (o.marker != null) html += '<span class="rbar-marker' + (o.marker < o.low || o.marker > o.high ? " out" : "") + '" style="left:' + pc(o.marker) + '%"></span>';
    return html + "</div></div>";
  }

  /* Screen map: jump to any screen while testing. */
  var SCREENS = [
    ["Khách hàng", [["S1 · Trang chủ", "index.html"], ["S2 · Khai thông tin xe", "flow.html#/intake"], ["S3 · Đang xử lý", "flow.html#/processing"], ["S4 · Kết quả + tiền bù", "flow.html#/result"], ["S5 · Chưa ước tính được", "flow.html#/error"], ["S6 · Ảnh xe + hư hỏng", "flow.html#/photos"], ["S7 · Đặt lịch + xác nhận gửi", "flow.html#/book"], ["S8 · Theo dõi hồ sơ", "flow.html#/track"]]],
    ["Thẩm định viên", [["A1 · Danh sách hồ sơ", "dealer.html#/"], ["A2 · Chi tiết + nhập giá", "dealer.html#/case/TU-000124"], ["A3 · Xác nhận chốt giá", "dealer.html#/case/TU-000124"]]]
  ];
  /* docs/ui-integration.md §5.9: synthetic data must be flagged on every screen that shows numbers.
     Shown until the API says otherwise (is_synthetic = false hides it). */
  function mountDemoStrip() {
    if (document.querySelector(".demo-strip")) return;
    document.body.insertAdjacentHTML("afterbegin", '<div class="demo-strip" role="note">DEMO: dữ liệu mẫu, giá không có giá trị tham khảo</div>');
  }
  function setSynthetic(flag) {
    var el = document.querySelector(".demo-strip");
    if (flag === false) { if (el) el.hidden = true; } else { mountDemoStrip(); document.querySelector(".demo-strip").hidden = false; }
  }
  function mountMap() {
    mountDemoStrip();
    var s = Store.get(), html = '<button class="proto-fab" type="button" id="protoOpen" aria-haspopup="dialog">' + icon("map") + '<span>Sơ đồ màn hình</span></button><dialog class="sheet proto" id="protoDlg" aria-labelledby="protoTitle"><div class="sheet-head"><h2 id="protoTitle">Sơ đồ màn hình</h2><button class="iconbtn" type="button" data-close aria-label="Đóng">' + icon("x") + '</button></div><p class="sheet-note">Bản thử nối API TradeUp. Giá do engine trên máy chủ tính; hồ sơ đặt lịch chỉ lưu trên trình duyệt này.</p><form class="api-form" id="apiForm"><label class="field-label" for="apiIn">Máy chủ API <span id="apiState" class="api-state">đang kiểm tra…</span></label><div class="api-row"><input class="input" id="apiIn" type="url" autocomplete="off" spellcheck="false"><button class="btn sm" type="submit">Lưu</button></div><small class="sheet-note">Chạy: <code>uvicorn src.main:app</code> rồi mở <code>/web/</code>, hoặc thêm <code>?api=https://…</code> vào đường dẫn.</small></form>';
    SCREENS.forEach(function (g) {
      html += "<h3>" + g[0] + '</h3><ul class="proto-list">';
      g[1].forEach(function (l) { html += '<li><a href="' + l[1] + '">' + l[0] + "</a></li>"; });
      html += "</ul>";
    });
    html += '<h3>Công cụ thử</h3><div class="proto-tools"><button class="btn sm outline" type="button" id="protoSample">Điền xe mẫu (Vios 2019)</button><label class="check"><input type="checkbox" id="protoErr"' + (s.simulateError ? " checked" : "") + '><span>Giả lập lỗi hệ thống ở bước xử lý</span></label><button class="btn sm outline danger" type="button" id="protoReset">Xóa dữ liệu thử</button></div></dialog>';
    document.body.insertAdjacentHTML("beforeend", html);
    var dlg = document.getElementById("protoDlg");
    document.getElementById("protoOpen").addEventListener("click", function () { dlg.showModal(); });
    dlg.addEventListener("click", function (e) {
      if (e.target === dlg || e.target.closest("[data-close]")) dlg.close();
      if (e.target.closest("a")) { dlg.close(); if (e.target.closest("a").getAttribute("href").split("#")[0] === location.pathname.split("/").pop()) setTimeout(function () { window.dispatchEvent(new HashChangeEvent("hashchange")); }, 0); }
    });
    document.getElementById("protoErr").addEventListener("change", function (e) { Store.get().simulateError = e.target.checked; Store.save(); });
    document.getElementById("protoSample").addEventListener("click", function () {
      var d = Store.get().draft;
      Object.assign(d, { brand: "Toyota", model: "Vios", year: 2019, trim: "1.5G", km: 62000, fuel: "xang", accident: "none", flood: "no", owners: "1", step: 6, quote: null });
      Store.save(); dlg.close();
      if (/flow\.html$/.test(location.pathname) && location.hash === "#/processing") window.dispatchEvent(new HashChangeEvent("hashchange"));
      else location.href = "flow.html#/processing";
    });
    var apiIn = document.getElementById("apiIn"), apiState = document.getElementById("apiState");
    apiIn.value = TU.api.base();
    function ping() {
      apiState.textContent = "đang kiểm tra…"; apiState.className = "api-state";
      TU.api.health().then(function (r) { var ok = r.status === 200; apiState.textContent = ok ? "đã kết nối" : "lỗi " + r.status; apiState.className = "api-state " + (ok ? "ok" : "bad"); }, function () { apiState.textContent = "chưa kết nối"; apiState.className = "api-state bad"; });
    }
    document.getElementById("protoOpen").addEventListener("click", ping);
    document.getElementById("apiForm").addEventListener("submit", function (e) { e.preventDefault(); var ok = TU.api.setBase(apiIn.value.trim()); apiIn.value = TU.api.base(); ping(); toast(ok ? "Đã lưu máy chủ API, tải lại trang để dùng" : "Chỉ đổi được sang máy chủ chạy trên máy này (localhost); trang mở từ máy chủ luôn dùng chính máy chủ đó"); });
    document.getElementById("protoReset").addEventListener("click", function () { Store.reset(); location.href = "index.html"; });
  }

  function toast(msg) {
    var t = document.getElementById("toast");
    if (!t) { document.body.insertAdjacentHTML("beforeend", '<div id="toast" class="toast" role="status" aria-live="polite"></div>'); t = document.getElementById("toast"); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  window.UI = { icon: icon, rangeBar: rangeBar, mountMap: mountMap, toast: toast, setSynthetic: setSynthetic };
})();
