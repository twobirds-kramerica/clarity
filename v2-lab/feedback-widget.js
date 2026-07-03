/*
 * Field Feedback Widget
 * Self-contained, dependency-free voice + point UX feedback tool.
 * Drop-in: <script src="feedback-widget.js" defer></script>
 *
 * Behaviour:
 *   - Floating "Feedback" button (bottom corner).
 *   - Tap it to start voice capture (Web Speech API, en-CA) with a live transcript.
 *   - While recording, tap any element to pin a comment to it (numbered marker).
 *   - Captures page context automatically (url, device, viewport, scroll, timestamp placeholder).
 *   - Stop shows a review panel (transcript + pins) with Send / Discard.
 *   - Send POSTs a JSON bundle to WIDGET_ENDPOINT; falls back to localStorage when empty or on failure.
 *   - If SpeechRecognition is unavailable, falls back to a textarea. Never blocks the page.
 *
 * No em-dashes. Canadian English.
 */
(function () {
  "use strict";

  // ---- Configuration -------------------------------------------------------
  // Leave "" to run in fallback mode (stores every bundle to localStorage so
  // nothing is ever lost). Set to a URL to POST bundles to your backend.
  var WIDGET_ENDPOINT = "https://field-feedback.twobirdsinnovation.workers.dev/submit";

  var SPEECH_LANG = "en-CA";
  var STORAGE_KEY = "ffw.feedback.bundles";
  var SCHEMA_VERSION = 1;

  // Guard against double-injection.
  if (window.__ffwLoaded) { return; }
  window.__ffwLoaded = true;

  // ---- Self-contained styles (injected once) ------------------------------
  var CSS = [
    ".ffw-root,.ffw-root *{box-sizing:border-box}",
    ".ffw-root{position:fixed;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.4;color:#101418}",
    ".ffw-fab{position:fixed;right:18px;bottom:18px;z-index:2147483001;display:inline-flex;align-items:center;gap:8px;padding:12px 16px;border:2px solid #0b3d2e;border-radius:999px;background:#0b6b4f;color:#fff;font-weight:700;font-size:15px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.28);-webkit-tap-highlight-color:transparent}",
    ".ffw-fab:hover{background:#0a5c44}",
    ".ffw-fab:focus-visible{outline:3px solid #ffd24d;outline-offset:2px}",
    ".ffw-fab-dot{width:10px;height:10px;border-radius:50%;background:#fff;display:inline-block}",
    ".ffw-bar{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483002;width:min(560px,calc(100vw - 24px));background:#fff;border:2px solid #0b3d2e;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.30);padding:12px 14px}",
    ".ffw-bar-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}",
    ".ffw-rec-dot{width:12px;height:12px;border-radius:50%;background:#c62828;animation:ffw-pulse 1.1s ease-in-out infinite;flex:0 0 auto}",
    "@keyframes ffw-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.8)}}",
    "@media (prefers-reduced-motion: reduce){.ffw-rec-dot{animation:none}}",
    ".ffw-bar-title{font-weight:700;flex:1 1 auto}",
    ".ffw-hint{color:#445;font-size:13px}",
    ".ffw-transcript{max-height:26vh;overflow-y:auto;background:#f4f7f6;border:1px solid #cdd7d3;border-radius:8px;padding:10px 12px;min-height:46px;white-space:pre-wrap;word-break:break-word}",
    ".ffw-transcript-interim{color:#667}",
    ".ffw-transcript-empty{color:#889;font-style:italic}",
    ".ffw-bar-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}",
    ".ffw-btn{appearance:none;border:2px solid transparent;border-radius:8px;padding:10px 14px;font-weight:700;font-size:14px;cursor:pointer;-webkit-tap-highlight-color:transparent}",
    ".ffw-btn:focus-visible{outline:3px solid #ffd24d;outline-offset:2px}",
    ".ffw-btn-stop{background:#c62828;color:#fff;border-color:#7f1d1d;flex:1 1 auto}",
    ".ffw-btn-stop:hover{background:#a91f1f}",
    ".ffw-btn-primary{background:#0b6b4f;color:#fff;border-color:#0b3d2e}",
    ".ffw-btn-primary:hover{background:#0a5c44}",
    ".ffw-btn-ghost{background:#fff;color:#101418;border-color:#9aa7a1}",
    ".ffw-btn-ghost:hover{background:#eef2f0}",
    ".ffw-btn-danger{background:#fff;color:#b71c1c;border-color:#e0a1a1}",
    ".ffw-btn-danger:hover{background:#fbeaea}",
    ".ffw-count{background:#0b3d2e;color:#fff;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:700}",
    ".ffw-pin{position:absolute;z-index:2147483001;min-width:24px;height:24px;padding:0 6px;border-radius:999px;background:#c62828;color:#fff;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);font-weight:800;font-size:13px;line-height:20px;text-align:center;pointer-events:none}",
    ".ffw-arming,.ffw-arming *{cursor:crosshair !important}",
    ".ffw-overlay{position:fixed;inset:0;z-index:2147483003;background:rgba(8,14,12,.55);display:flex;align-items:center;justify-content:center;padding:16px}",
    ".ffw-panel{width:min(620px,100%);max-height:88vh;overflow-y:auto;background:#fff;border:2px solid #0b3d2e;border-radius:14px;box-shadow:0 16px 50px rgba(0,0,0,.4);padding:18px 18px 16px}",
    ".ffw-panel h2{margin:0 0 4px;font-size:19px}",
    ".ffw-panel .ffw-sub{color:#445;margin:0 0 14px;font-size:13px}",
    ".ffw-field-label{font-weight:700;margin:12px 0 6px}",
    ".ffw-review-text{width:100%;min-height:96px;border:1px solid #9aa7a1;border-radius:8px;padding:10px 12px;font:inherit;resize:vertical}",
    ".ffw-pinlist{list-style:none;margin:0;padding:0}",
    ".ffw-pinlist li{display:flex;gap:10px;align-items:flex-start;border:1px solid #dde5e2;border-radius:8px;padding:8px 10px;margin-bottom:8px}",
    ".ffw-pinlist .ffw-pin-num{flex:0 0 auto;background:#c62828;color:#fff;border-radius:999px;width:24px;height:24px;line-height:24px;text-align:center;font-weight:800;font-size:13px}",
    ".ffw-pin-body{flex:1 1 auto;min-width:0}",
    ".ffw-pin-text{font-weight:600;word-break:break-word}",
    ".ffw-pin-sel{color:#556;font-size:12px;word-break:break-all;font-family:ui-monospace,Menlo,Consolas,monospace}",
    ".ffw-panel-actions{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}",
    ".ffw-panel-actions .ffw-btn-primary{flex:1 1 auto}",
    ".ffw-status{margin-top:10px;font-size:13px;font-weight:600}",
    ".ffw-status-ok{color:#0b6b4f}",
    ".ffw-status-warn{color:#b26a00}",
    ".ffw-status-err{color:#b71c1c}"
  ].join("");

  function injectStyles() {
    if (document.getElementById("ffw-styles")) { return; }
    var s = document.createElement("style");
    s.id = "ffw-styles";
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  // ---- State ---------------------------------------------------------------
  var state = {
    recording: false,
    finalTranscript: "",
    interimTranscript: "",
    pins: [],            // { n, selector, text, rect }
    recognition: null,
    speechSupported: false
  };

  // DOM refs created lazily
  var el = {
    root: null,
    fab: null,
    bar: null,
    transcriptBox: null,
    countBadge: null,
    pinLayer: null
  };

  // ---- Utilities -----------------------------------------------------------
  function elt(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null) { n.textContent = text; }
    return n;
  }

  function trim(s) { return (s || "").replace(/\s+/g, " ").trim(); }

  function deviceKind() {
    var w = window.innerWidth || document.documentElement.clientWidth || 0;
    var mobileUA = /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent || "");
    return (mobileUA || w < 768) ? "mobile" : "desktop";
  }

  // Build a robust CSS selector path for an element.
  function cssPath(node) {
    if (!(node instanceof Element)) { return ""; }
    if (node.id) {
      // ids can contain characters that need escaping
      var byId = "#" + cssEscape(node.id);
      try {
        if (document.querySelectorAll(byId).length === 1) { return byId; }
      } catch (e) { /* fall through */ }
    }
    var parts = [];
    var cur = node;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      var seg = cur.nodeName.toLowerCase();
      if (cur.id) {
        seg += "#" + cssEscape(cur.id);
        parts.unshift(seg);
        break;
      }
      // stable-ish class (first class token only, ignore our own ffw- classes)
      var cls = firstStableClass(cur);
      if (cls) { seg += "." + cssEscape(cls); }
      // nth-of-type disambiguation among same-tag siblings
      var idx = nthOfType(cur);
      if (idx > 0) { seg += ":nth-of-type(" + idx + ")"; }
      parts.unshift(seg);
      cur = cur.parentElement;
      if (parts.length >= 6) { break; }
    }
    return parts.join(" > ");
  }

  function firstStableClass(node) {
    if (!node.classList || !node.classList.length) { return ""; }
    for (var i = 0; i < node.classList.length; i++) {
      var c = node.classList[i];
      if (c.indexOf("ffw-") === 0) { continue; }
      if (/\d{4,}/.test(c)) { continue; } // skip hashy generated classes
      return c;
    }
    return "";
  }

  function nthOfType(node) {
    var parent = node.parentElement;
    if (!parent) { return 0; }
    var same = 0, index = 0;
    var kids = parent.children;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].nodeName === node.nodeName) {
        same++;
        if (kids[i] === node) { index = same; }
      }
    }
    return same > 1 ? index : 0;
  }

  function cssEscape(s) {
    if (window.CSS && CSS.escape) { return window.CSS.escape(s); }
    return String(s).replace(/[^a-zA-Z0-9_-]/g, function (ch) { return "\\" + ch; });
  }

  // ---- Persistence ---------------------------------------------------------
  function saveLocal(bundle) {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) { arr = []; }
      arr.push(bundle);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---- Context bundle ------------------------------------------------------
  function buildBundle(transcript) {
    return {
      schemaVersion: SCHEMA_VERSION,
      transcript: trim(transcript),
      pins: state.pins.map(function (p) {
        return {
          n: p.n,
          selector: p.selector,
          text: p.text,
          rect: p.rect
        };
      }),
      context: {
        url: location.href,
        title: document.title || "",
        referrer: document.referrer || "",
        device: deviceKind(),
        userAgent: navigator.userAgent || "",
        viewport: {
          width: window.innerWidth || 0,
          height: window.innerHeight || 0
        },
        scroll: {
          x: window.scrollX || window.pageXOffset || 0,
          y: window.scrollY || window.pageYOffset || 0
        },
        language: navigator.language || "",
        speechUsed: state.speechSupported
      },
      // Backend stamps the authoritative time. This is a client hint only.
      timestamp: null,
      clientTimestamp: new Date().toISOString()
    };
  }

  // ---- Pins ----------------------------------------------------------------
  function ensurePinLayer() {
    if (el.pinLayer && el.pinLayer.isConnected) { return; }
    el.pinLayer = elt("div", "ffw-pin-layer");
    el.pinLayer.style.position = "absolute";
    el.pinLayer.style.top = "0";
    el.pinLayer.style.left = "0";
    el.pinLayer.style.width = "0";
    el.pinLayer.style.height = "0";
    el.pinLayer.style.zIndex = "2147483001";
    document.body.appendChild(el.pinLayer);
  }

  function addPin(target) {
    if (!(target instanceof Element)) { return; }
    ensurePinLayer();
    var rect = target.getBoundingClientRect();
    var n = state.pins.length + 1;
    var pin = {
      n: n,
      selector: cssPath(target),
      text: trim(target.innerText || target.textContent || target.getAttribute("aria-label") || target.getAttribute("alt") || "").slice(0, 240),
      rect: {
        x: Math.round(rect.left + window.scrollX),
        y: Math.round(rect.top + window.scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
    state.pins.push(pin);

    var marker = elt("div", "ffw-pin", String(n));
    marker.style.left = (pin.rect.x) + "px";
    marker.style.top = (pin.rect.y) + "px";
    marker.setAttribute("data-ffw-pin", String(n));
    el.pinLayer.appendChild(marker);

    updateCount();
  }

  function clearPins() {
    state.pins = [];
    if (el.pinLayer) { el.pinLayer.innerHTML = ""; }
    updateCount();
  }

  function updateCount() {
    if (el.countBadge) {
      el.countBadge.textContent = String(state.pins.length);
    }
  }

  // Capture-phase click handler: intercept clicks while recording so a tap
  // pins the element instead of activating it. Ignores taps on our own UI.
  function onCaptureClick(ev) {
    if (!state.recording) { return; }
    var t = ev.target;
    if (isOwnUi(t)) { return; }
    ev.preventDefault();
    ev.stopPropagation();
    addPin(t);
  }

  function isOwnUi(node) {
    while (node && node.nodeType === 1) {
      if (node.classList && (
        node.classList.contains("ffw-bar") ||
        node.classList.contains("ffw-fab") ||
        node.classList.contains("ffw-pin") ||
        node.classList.contains("ffw-pin-layer") ||
        node.classList.contains("ffw-overlay"))) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  // ---- Transcript rendering ------------------------------------------------
  function renderTranscript() {
    if (!el.transcriptBox) { return; }
    el.transcriptBox.innerHTML = "";
    var fin = trim(state.finalTranscript);
    var interim = trim(state.interimTranscript);
    if (!fin && !interim) {
      var empty = elt("span", "ffw-transcript-empty", "Listening. Start speaking and it will appear here.");
      el.transcriptBox.appendChild(empty);
      return;
    }
    if (fin) { el.transcriptBox.appendChild(document.createTextNode(fin + " ")); }
    if (interim) {
      el.transcriptBox.appendChild(elt("span", "ffw-transcript-interim", interim));
    }
    el.transcriptBox.scrollTop = el.transcriptBox.scrollHeight;
  }

  // ---- Speech recognition --------------------------------------------------
  function makeRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { return null; }
    var r = new SR();
    r.lang = SPEECH_LANG;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = function (e) {
      var interim = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var res = e.results[i];
        if (res.isFinal) {
          state.finalTranscript += res[0].transcript;
        } else {
          interim += res[0].transcript;
        }
      }
      state.interimTranscript = interim;
      renderTranscript();
    };
    r.onerror = function (e) {
      // no-speech / aborted are non-fatal; keep the session usable
      if (e && (e.error === "not-allowed" || e.error === "service-not-allowed")) {
        state.speechSupported = false;
      }
    };
    r.onend = function () {
      // Auto-restart while still recording (Chrome ends after silence).
      if (state.recording && state.recognition) {
        try { state.recognition.start(); } catch (e) { /* already started */ }
      }
    };
    return r;
  }

  // ---- Recording lifecycle -------------------------------------------------
  function startRecording() {
    if (state.recording) { return; }
    state.recording = true;
    state.finalTranscript = "";
    state.interimTranscript = "";
    clearPins();

    if (el.fab) { el.fab.style.display = "none"; }
    document.documentElement.classList.add("ffw-arming");
    buildBar();

    state.speechSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    if (state.speechSupported) {
      state.recognition = makeRecognition();
      try { state.recognition.start(); }
      catch (e) { state.speechSupported = false; }
    }
    if (!state.speechSupported) {
      // Fallback: swap the transcript box for a textarea.
      showTextareaFallback();
    }
  }

  function stopRecording() {
    if (!state.recording) { return; }
    state.recording = false;
    document.documentElement.classList.remove("ffw-arming");

    if (state.recognition) {
      try { state.recognition.stop(); } catch (e) { /* ignore */ }
      state.recognition = null;
    }
    // If a fallback textarea exists, pull its value into finalTranscript.
    var ta = document.getElementById("ffw-fallback-textarea");
    if (ta) { state.finalTranscript = ta.value || ""; }

    removeBar();
    showReview();
  }

  function abortAll() {
    state.recording = false;
    document.documentElement.classList.remove("ffw-arming");
    if (state.recognition) {
      try { state.recognition.stop(); } catch (e) {}
      state.recognition = null;
    }
    removeBar();
    removeOverlay();
    clearPins();
    state.finalTranscript = "";
    state.interimTranscript = "";
    if (el.fab) { el.fab.style.display = ""; }
  }

  // ---- UI: recording bar ---------------------------------------------------
  function buildBar() {
    removeBar();
    var bar = elt("div", "ffw-bar");
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Feedback recording");

    var head = elt("div", "ffw-bar-head");
    head.appendChild(elt("span", "ffw-rec-dot"));
    head.appendChild(elt("span", "ffw-bar-title", "Recording feedback"));
    var badgeWrap = elt("span", "ffw-count", "0");
    el.countBadge = badgeWrap;
    var pinLabel = elt("span", "ffw-hint");
    pinLabel.appendChild(document.createTextNode("pins "));
    pinLabel.appendChild(badgeWrap);
    head.appendChild(pinLabel);
    bar.appendChild(head);

    bar.appendChild(elt("div", "ffw-hint", "Speak your feedback. Tap any part of the page to pin a comment to it."));

    var box = elt("div", "ffw-transcript");
    box.setAttribute("aria-live", "polite");
    el.transcriptBox = box;
    bar.appendChild(box);

    var actions = elt("div", "ffw-bar-actions");
    var stopBtn = elt("button", "ffw-btn ffw-btn-stop", "Stop and review");
    stopBtn.type = "button";
    stopBtn.addEventListener("click", stopRecording);
    var cancelBtn = elt("button", "ffw-btn ffw-btn-ghost", "Cancel");
    cancelBtn.type = "button";
    cancelBtn.addEventListener("click", abortAll);
    actions.appendChild(stopBtn);
    actions.appendChild(cancelBtn);
    bar.appendChild(actions);

    el.root.appendChild(bar);
    el.bar = bar;
    renderTranscript();
  }

  function showTextareaFallback() {
    if (!el.transcriptBox) { return; }
    el.transcriptBox.innerHTML = "";
    var note = elt("div", "ffw-hint", "Voice capture is not available in this browser. Type your feedback below. You can still tap the page to pin comments.");
    var ta = document.createElement("textarea");
    ta.id = "ffw-fallback-textarea";
    ta.className = "ffw-review-text";
    ta.setAttribute("aria-label", "Feedback text");
    ta.placeholder = "Type your feedback here.";
    el.transcriptBox.appendChild(note);
    el.transcriptBox.appendChild(ta);
    ta.focus();
  }

  function removeBar() {
    if (el.bar && el.bar.parentNode) { el.bar.parentNode.removeChild(el.bar); }
    el.bar = null;
    el.transcriptBox = null;
    el.countBadge = null;
  }

  // ---- UI: review panel ----------------------------------------------------
  function showReview() {
    removeOverlay();
    var overlay = elt("div", "ffw-overlay");
    var panel = elt("div", "ffw-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Review feedback before sending");

    panel.appendChild(elt("h2", null, "Review your feedback"));
    panel.appendChild(elt("p", "ffw-sub", "Check the transcript and pinned spots, then send or discard."));

    panel.appendChild(elt("div", "ffw-field-label", "Transcript"));
    var ta = elt("textarea", "ffw-review-text");
    ta.id = "ffw-review-transcript";
    ta.value = trim(state.finalTranscript);
    ta.setAttribute("aria-label", "Feedback transcript");
    panel.appendChild(ta);

    panel.appendChild(elt("div", "ffw-field-label", "Pinned spots (" + state.pins.length + ")"));
    if (state.pins.length) {
      var ul = elt("ul", "ffw-pinlist");
      state.pins.forEach(function (p) {
        var li = elt("li");
        li.appendChild(elt("span", "ffw-pin-num", String(p.n)));
        var body = elt("div", "ffw-pin-body");
        body.appendChild(elt("div", "ffw-pin-text", p.text ? ('"' + p.text + '"') : "(no visible text)"));
        body.appendChild(elt("div", "ffw-pin-sel", p.selector));
        li.appendChild(body);
        ul.appendChild(li);
      });
      panel.appendChild(ul);
    } else {
      panel.appendChild(elt("p", "ffw-hint", "No spots pinned. That is fine, the transcript will still be sent."));
    }

    var status = elt("div", "ffw-status");
    status.id = "ffw-review-status";

    var actions = elt("div", "ffw-panel-actions");
    var sendBtn = elt("button", "ffw-btn ffw-btn-primary", "Send feedback");
    sendBtn.type = "button";
    sendBtn.addEventListener("click", function () {
      state.finalTranscript = ta.value || "";
      sendBundle(sendBtn, status);
    });
    var discardBtn = elt("button", "ffw-btn ffw-btn-danger", "Discard");
    discardBtn.type = "button";
    discardBtn.addEventListener("click", abortAll);
    actions.appendChild(sendBtn);
    actions.appendChild(discardBtn);

    panel.appendChild(actions);
    panel.appendChild(status);
    overlay.appendChild(panel);
    el.root.appendChild(overlay);
    el.overlay = overlay;
    ta.focus();
  }

  function removeOverlay() {
    if (el.overlay && el.overlay.parentNode) { el.overlay.parentNode.removeChild(el.overlay); }
    el.overlay = null;
  }

  // ---- Send ----------------------------------------------------------------
  function sendBundle(btn, statusNode) {
    var bundle = buildBundle(state.finalTranscript);
    if (btn) { btn.disabled = true; btn.textContent = "Sending..."; }

    function done(msg, cls) {
      if (statusNode) {
        statusNode.textContent = msg;
        statusNode.className = "ffw-status " + cls;
      }
      window.setTimeout(function () { abortAll(); }, 1200);
    }

    if (!WIDGET_ENDPOINT) {
      var ok = saveLocal(bundle);
      done(ok
        ? "Saved locally (no endpoint configured). Feedback stored in this browser."
        : "Could not save. Please copy your notes manually.", ok ? "ffw-status-ok" : "ffw-status-err");
      return;
    }

    if (!window.fetch) {
      saveLocal(bundle);
      done("Sent via local fallback (fetch unavailable).", "ffw-status-warn");
      return;
    }

    window.fetch(WIDGET_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bundle),
      keepalive: true
    }).then(function (res) {
      if (res && res.ok) {
        done("Feedback sent. Thank you.", "ffw-status-ok");
      } else {
        saveLocal(bundle);
        done("Server error. Saved locally so nothing is lost.", "ffw-status-warn");
      }
    }).catch(function () {
      saveLocal(bundle);
      done("Network error. Saved locally so nothing is lost.", "ffw-status-warn");
    });
  }

  // ---- Boot ----------------------------------------------------------------
  function buildFab() {
    var fab = elt("button", "ffw-fab");
    fab.type = "button";
    fab.setAttribute("aria-label", "Give feedback by voice");
    fab.appendChild(elt("span", "ffw-fab-dot"));
    fab.appendChild(document.createTextNode("Feedback"));
    fab.addEventListener("click", startRecording);
    el.root.appendChild(fab);
    el.fab = fab;
  }

  function boot() {
    injectStyles();
    var root = elt("div", "ffw-root");
    root.style.position = "static";
    document.body.appendChild(root);
    el.root = root;
    buildFab();
    // Capture-phase so pins win over normal click handlers while recording.
    document.addEventListener("click", onCaptureClick, true);
    // Public hook for tests / debugging.
    window.FieldFeedback = {
      start: startRecording,
      stop: stopRecording,
      abort: abortAll,
      getBundle: function () { return buildBundle(state.finalTranscript); },
      getStored: function () {
        try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"); }
        catch (e) { return []; }
      },
      setEndpoint: function (u) { WIDGET_ENDPOINT = u || ""; }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
