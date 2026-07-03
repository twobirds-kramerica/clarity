/* Clarity v2 lab diagnostic flow. Static, no network calls, nothing stored
   beyond the theme preference. Builds on the v2 prototype flow:
   two-door entry (paste site / five questions) + sector-specific output. */
(function () {
  "use strict";

  /* ---------- sector knowledge (carried forward from diagnostic-v2 prototype) */
  var SECTORS = {
    trades: {
      label: "Trades and home services",
      qw: [
        ["Instant quote follow-up", "Auto-send a branded quote and a follow-up text within five minutes of a call. Slow response is the number-one reason trades lose jobs."],
        ["Job photo to invoice", "Turn site photos and a voice note into a draft invoice, so evenings are not spent on paperwork."],
        ["Missed-call text-back", "Every missed call auto-texts \"Sorry we missed you, what do you need?\" That captures the jobs that currently go to a competitor."]
      ],
      m1: ["Wire up missed-call text-back, live in week one", "Draft your quote follow-up templates", "Set up a simple job-to-invoice flow you will actually use"]
    },
    clinic: {
      label: "Clinic or health practice",
      qw: [
        ["Recall and no-show reminders", "Automated, PHIPA-safe appointment reminders plus recall for overdue patients. Fills the schedule without front-desk overtime."],
        ["Intake summarizing", "Turn intake forms into a clean pre-visit summary so practitioners start prepared."],
        ["After-hours FAQ", "A private, no-data assistant answers \"are you taking new patients\" and \"what should I bring\" so the phone stops ringing off the hook."]
      ],
      m1: ["Stand up PHIPA-safe reminders", "Template the top ten patient questions", "Pilot intake summaries with one practitioner"]
    },
    prof: {
      label: "Professional services",
      qw: [
        ["Document-first drafting", "Draft engagement letters and standard filings from your own templates. You review, you do not retype."],
        ["Client-intake triage", "Sort and summarize new-client enquiries so you only touch the ones worth your time."],
        ["Deadline and compliance watch", "Never miss a filing date. Auto-surface what is due this week, per client."]
      ],
      m1: ["Build one drafting template you use weekly", "Set up intake triage and summaries", "Turn on a this-week deadline digest"]
    },
    retail: {
      label: "Local retail and hospitality",
      qw: [
        ["Review-to-response", "Auto-draft on-brand replies to every Google review so your rating, and your ranking, climb."],
        ["Reorder signals", "Flag what is about to sell out and what is dead stock, before you feel it in cash flow."],
        ["Local-search polish", "Fix the Google Business details that decide whether locals find you first."]
      ],
      m1: ["Turn on review-response drafts", "Set up low-stock and dead-stock flags", "Clean up your local-search presence"]
    }
  };

  /* ---------- five-question path (Door B) */
  var QUESTIONS = [
    {
      id: "reach",
      title: "How do new customers usually reach you?",
      opts: [
        ["Phone calls, mostly", 2],
        ["Phone and email", 6],
        ["A form on our website", 10],
        ["Online booking or online orders", 15]
      ]
    },
    {
      id: "records",
      title: "Where does your business information live day to day?",
      opts: [
        ["Paper, whiteboards, and memory", 0],
        ["Spreadsheets", 7],
        ["One main software system", 14],
        ["A few systems that talk to each other", 20]
      ]
    },
    {
      id: "drain",
      title: "What eats the most of your time each week?",
      opts: [
        ["Quotes, invoices, and paperwork", 4],
        ["Scheduling and follow-ups", 4],
        ["Bookkeeping and admin", 4],
        ["Marketing and getting found", 4]
      ]
    },
    {
      id: "ai",
      title: "Have you tried any AI tools in the business yet?",
      opts: [
        ["Not yet", 0],
        ["Dabbled a bit, nothing stuck", 7],
        ["One tool we use regularly", 14],
        ["A few tools in regular use", 20]
      ]
    },
    {
      id: "blocker",
      title: "If a tool could save you five hours a week, what is in the way?",
      opts: [
        ["No time to set anything up", 3],
        ["Not sure what is safe or private", 3],
        ["Cost, or fear of another subscription", 3],
        ["Nothing. Show me what works", 6]
      ]
    }
  ];

  var DRAIN_NOTE = {
    0: "You told us paperwork is the biggest drain, so the moves below lean toward quoting and invoicing first.",
    1: "You told us scheduling and follow-ups are the biggest drain, so start with the automation moves below.",
    2: "You told us bookkeeping and admin are the biggest drain. The moves below cut the repeat typing first.",
    3: "You told us getting found is the biggest drain. The local-visibility moves below come first."
  };

  var state = { sector: "trades", score: 0, answers: {}, qIndex: 0, path: null };

  function $(id) { return document.getElementById(id); }
  function show(id) {
    ["panel-entry", "panel-read", "panel-questions", "panel-report"].forEach(function (p) {
      $(p).classList.toggle("hidden", p !== id);
    });
    var target = $(id);
    if (id !== "panel-entry") {
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      $("diagnostic").scrollIntoView({ block: "start" });
    }
  }

  /* ---------- theme toggle */
  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem("clarity-v2-theme"); } catch (e) {}
  if (stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    root.setAttribute("data-theme", "dark");
  }
  function syncToggle() {
    var dark = root.getAttribute("data-theme") === "dark";
    $("themeToggle").textContent = dark ? "Light mode" : "Dark mode";
    $("themeToggle").setAttribute("aria-pressed", dark ? "true" : "false");
  }
  $("themeToggle").addEventListener("click", function () {
    var dark = root.getAttribute("data-theme") === "dark";
    if (dark) { root.removeAttribute("data-theme"); } else { root.setAttribute("data-theme", "dark"); }
    try { localStorage.setItem("clarity-v2-theme", dark ? "light" : "dark"); } catch (e) {}
    syncToggle();
  });
  syncToggle();

  /* ---------- entry */
  $("sector").addEventListener("change", function (e) { state.sector = e.target.value; });

  /* Door A: read the site (lab preview: honest simulated detection, no network) */
  $("goA").addEventListener("click", function () {
    var url = $("siteUrl").value.trim();
    state.path = "site";
    show("panel-read");
    $("readTitle").textContent = "Reading " + (url || "your site") + "…";
    $("signals").innerHTML = "";
    $("toReport").disabled = true;
    var checks = [
      ["Has a website", "yes"],
      ["Publishes content or a blog", "no"],
      ["Online booking or payments", "no"],
      ["Collects enquiries by form", "yes"],
      ["Visible on Google Business", "yes"],
      ["Any automation in place", "no"]
    ];
    var i = 0;
    var t = setInterval(function () {
      if (i >= checks.length) {
        clearInterval(t);
        $("readNote").textContent = "Lab preview: in production a no-store reader detects these from your live site, client-side or through a thin worker that fetches and forgets. No page content is saved.";
        var yes = checks.filter(function (c) { return c[1] === "yes"; }).length;
        state.score = 30 + yes * 8;
        $("toReport").disabled = false;
        return;
      }
      var c = checks[i++];
      var row = document.createElement("div");
      row.className = "signal";
      var ic = document.createElement("span");
      ic.className = "ic " + (c[1] === "yes" ? "yes" : "no");
      ic.textContent = c[1] === "yes" ? "✓" : "—";
      var tx = document.createElement("span");
      tx.textContent = c[0];
      row.appendChild(ic); row.appendChild(tx);
      $("signals").appendChild(row);
    }, 300);
  });

  $("toReport").addEventListener("click", function () { renderReport(); show("panel-report"); });

  /* Door B: questions */
  $("goB").addEventListener("click", function () {
    state.path = "questions";
    state.qIndex = 0; state.answers = {};
    renderQuestion();
    show("panel-questions");
  });

  function renderQuestion() {
    var q = QUESTIONS[state.qIndex];
    $("qTitle").textContent = q.title;
    $("qCount").textContent = "Question " + (state.qIndex + 1) + " of " + QUESTIONS.length;
    $("qFill").style.width = Math.round(((state.qIndex) / QUESTIONS.length) * 100) + "%";
    var box = $("choices");
    box.innerHTML = "";
    q.opts.forEach(function (opt, idx) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      b.setAttribute("aria-pressed", state.answers[q.id] === idx ? "true" : "false");
      var mk = document.createElement("span"); mk.className = "marker"; mk.setAttribute("aria-hidden", "true");
      var tx = document.createElement("span"); tx.textContent = opt[0];
      b.appendChild(mk); b.appendChild(tx);
      b.addEventListener("click", function () {
        state.answers[q.id] = idx;
        advance();
      });
      box.appendChild(b);
    });
    $("qBack").classList.toggle("hidden", state.qIndex === 0);
  }

  function advance() {
    if (state.qIndex < QUESTIONS.length - 1) {
      state.qIndex++;
      renderQuestion();
      $("qTitle").focus();
    } else {
      var score = 25;
      QUESTIONS.forEach(function (q) {
        var idx = state.answers[q.id];
        if (idx !== undefined) { score += q.opts[idx][1]; }
      });
      state.score = Math.min(score, 96);
      renderReport();
      show("panel-report");
    }
  }

  $("qBack").addEventListener("click", function () {
    if (state.qIndex > 0) { state.qIndex--; renderQuestion(); }
  });
  $("qRestart").addEventListener("click", function () { show("panel-entry"); });

  /* ---------- report */
  function bandLabel(s) {
    if (s < 40) { return "Getting started"; }
    if (s < 70) { return "Building"; }
    return "Ready to scale";
  }
  function bandSentence(s, sectorLabel) {
    if (s < 40) {
      return "Most " + sectorLabel.toLowerCase() + " businesses we see in Southwestern Ontario land between 35 and 55. You are earlier than most, which also means the first moves pay back fastest.";
    }
    if (s < 70) {
      return "Most " + sectorLabel.toLowerCase() + " businesses we see in Southwestern Ontario land between 35 and 55. You are ahead of the pack, and the next moves compound what you already have.";
    }
    return "You are well ahead of most " + sectorLabel.toLowerCase() + " businesses in the region. The moves below are about scale and defence, not catch-up.";
  }

  function renderReport() {
    var s = SECTORS[state.sector];
    $("repSector").textContent = s.label;
    $("repDate").textContent = new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
    $("scoreVal").textContent = state.score;
    $("scoreBand").textContent = bandLabel(state.score);
    $("scoreContext").textContent = bandSentence(state.score, s.label);
    window.requestAnimationFrame(function () {
      $("bandMarker").style.left = "calc(" + state.score + "% - 2px)";
    });

    var drainIdx = state.answers.drain;
    $("drainNote").textContent = (state.path === "questions" && drainIdx !== undefined) ? DRAIN_NOTE[drainIdx] : "";
    $("drainNote").classList.toggle("hidden", !(state.path === "questions" && drainIdx !== undefined));

    var moves = $("moves");
    moves.innerHTML = "";
    s.qw.forEach(function (q) {
      var d = document.createElement("div");
      d.className = "move";
      var inner = document.createElement("div");
      var b = document.createElement("b"); b.textContent = q[0];
      var p = document.createElement("p"); p.textContent = q[1];
      inner.appendChild(b); inner.appendChild(p);
      d.appendChild(inner);
      moves.appendChild(d);
    });

    var m1 = $("monthOneList");
    m1.innerHTML = "";
    s.m1.forEach(function (x) {
      var li = document.createElement("li");
      li.textContent = x;
      m1.appendChild(li);
    });
  }

  $("runAgain").addEventListener("click", function () { show("panel-entry"); });
})();
