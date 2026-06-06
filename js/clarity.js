/* Clarity — AI Business Diagnostic app logic.
   Extracted from index.html inline <script> 2026-04-22 (sprint 47,
   applying S-KEVIN-CSP-READY pattern). Behaviour preserved. */
  (function() {
    'use strict';

    /* ── Element References ─────────────────── */
    var setupScreen        = document.getElementById('setupScreen');
    var setupProvider      = document.getElementById('setupProvider');
    var setupApiKey        = document.getElementById('setupApiKey');
    var setupApiKeyGroup   = document.getElementById('setupApiKeyGroup');
    var setupApiKeyLabel   = document.getElementById('setupApiKeyLabel');
    var getKeyLink         = document.getElementById('getKeyLink');
    var activateBtn  = document.getElementById('activateBtn');
    var introSection = document.getElementById('introSection');
    var form         = document.getElementById('diagnosticForm');
    var loadingEl    = document.getElementById('loading');
    var errorBox     = document.getElementById('errorBox');
    var errorMessage = document.getElementById('errorMessage');
    var resultsEl    = document.getElementById('results');
    var submitBtn    = document.getElementById('submitBtn');
    var tryAgainBtn  = document.getElementById('tryAgainBtn');
    var saveReportBtn = document.getElementById('saveReportBtn');
    var runAnotherBtn = document.getElementById('runAnotherBtn');
    var resetKeyLink  = document.getElementById('resetKeyLink');

    var lastReportData = null;
    var lastBusinessName = '';

    /* ── Canadian SME AI Readiness Benchmarks ───────────────────
       Scores (1–10) represent estimated average AI readiness for
       Canadian small and medium businesses in each sector.
       Sources: BDC "AI for Canadian SMEs" 2023, ISED Digital Economy
       data, StatCan ICT use in business survey (2022-23).
       Updated annually. ---------------------------------------- */
    var INDUSTRY_BENCHMARKS = {
      'Professional Services': { score: 4, note: 'Highest adoption among SMEs — document AI, client communication, research tools common.' },
      'Legal & Accounting':    { score: 4, note: 'Document drafting, compliance tools, and bookkeeping automation leading adoption.' },
      'Real Estate':           { score: 4, note: 'CRM tools, AI property descriptions, and virtual tour platforms fairly common.' },
      'Retail':                { score: 3, note: 'E-commerce AI (product recommendations, inventory) ahead of in-store; physical retail early.' },
      'Healthcare':            { score: 3, note: 'Regulated environment slows adoption; scheduling and documentation AI leading.' },
      'Manufacturing':         { score: 3, note: 'Ontario auto sector drives some adoption; predictive maintenance and quality control tools.' },
      'Transportation & Logistics': { score: 3, note: 'Route optimisation and fleet management AI tools ahead of the broader SME average.' },
      'Automotive':            { score: 3, note: 'Ontario auto cluster has above-average exposure to AI through OEM supply chains.' },
      'Agriculture':           { score: 2, note: 'Precision agriculture growing but concentrated in larger operations; SMEs very early.' },
      'Construction':          { score: 2, note: 'Project scheduling and estimating AI slowly emerging; most firms still paper-heavy.' },
      'Food & Hospitality':    { score: 2, note: 'POS analytics and social media scheduling tools are entry points; adoption low overall.' },
      'Non-Profit':            { score: 2, note: 'Resource-constrained sector; grant-writing AI is the most common use case.' },
      'Personal Services':     { score: 2, note: 'Booking and marketing automation starting to appear; most firms pre-AI.' },
      'Trades':                { score: 2, note: 'Scheduling, estimating, and invoicing apps with AI features are early entry points.' },
      'Other':                 { score: 3, note: 'Represents the broad Canadian SME average across all sectors.' }
    };

    /* ── Provider metadata (mirrors llm-provider.js) ── */
    var PROVIDER_META = {
      anthropic: {
        label:      'Claude (Anthropic)',
        keyLabel:   'Anthropic API key',
        placeholder:'sk-ant-...',
        signupUrl:  'https://console.anthropic.com/',
        signupText: 'Get a free Anthropic API key →',
        needsKey:   true
      },
      openai: {
        label:      'GPT-4o (OpenAI)',
        keyLabel:   'OpenAI API key',
        placeholder:'sk-...',
        signupUrl:  'https://platform.openai.com/api-keys',
        signupText: 'Get an OpenAI API key →',
        needsKey:   true
      },
      gemini: {
        label:      'Gemini (Google)',
        keyLabel:   'Google AI Studio API key',
        placeholder:'AIza...',
        signupUrl:  'https://aistudio.google.com/apikey',
        signupText: 'Get a free Gemini API key →',
        needsKey:   true
      },
      ollama: {
        label:      'Ollama (local, no key)',
        keyLabel:   '',
        placeholder:'',
        signupUrl:  'https://ollama.com/download',
        signupText: 'Download Ollama (runs on localhost:11434) →',
        needsKey:   false
      }
    };

    /* ── Migrate old key name + ensure provider set ─── */
    try {
      var oldKey = localStorage.getItem('clarity-api-key');
      if (oldKey && !localStorage.getItem('clarity_api_key')) {
        localStorage.setItem('clarity_api_key', oldKey);
        localStorage.removeItem('clarity-api-key');
      }
    } catch(e) {}

    /* ── Init: check for provider + key ───── */
    function init() {
      hideAll();
      var provider = getProvider();
      if (setupProvider) setupProvider.value = provider;
      renderSetupForProvider(provider);
      renderActiveProviderNote();

      var meta = PROVIDER_META[provider];
      var key = getApiKey();
      if (meta && (!meta.needsKey || key)) {
        showApp();
      } else {
        setupScreen.classList.add('active');
      }
    }

    function getProvider() {
      try { return localStorage.getItem('llm_provider') || 'anthropic'; }
      catch(e) { return 'anthropic'; }
    }

    function getApiKey() {
      try {
        return localStorage.getItem('llm_api_key')
            || localStorage.getItem('clarity_api_key')
            || '';
      } catch(e) { return ''; }
    }

    function renderActiveProviderNote() {
      var note = document.getElementById('providerNote');
      if (!note) return;
      var provider = getProvider();
      var meta = PROVIDER_META[provider] || PROVIDER_META.anthropic;
      note.textContent = 'Provider: ' + meta.label +
        '. Your key and business data never leave your browser except to call ' +
        meta.label + ' directly.';
    }

    function renderSetupForProvider(provider) {
      var meta = PROVIDER_META[provider] || PROVIDER_META.anthropic;
      if (setupApiKeyLabel) setupApiKeyLabel.textContent = meta.keyLabel || 'API key';
      if (setupApiKey) {
        setupApiKey.placeholder = meta.placeholder;
        setupApiKey.value = '';
        setupApiKey.required = meta.needsKey;
      }
      if (setupApiKeyGroup) {
        setupApiKeyGroup.style.display = meta.needsKey ? '' : 'none';
      }
      if (getKeyLink) {
        getKeyLink.href = meta.signupUrl;
        getKeyLink.textContent = meta.signupText;
      }
    }

    if (setupProvider) {
      setupProvider.addEventListener('change', function() {
        renderSetupForProvider(setupProvider.value);
      });
    }

    function showApp() {
      setupScreen.classList.remove('active');
      introSection.classList.add('active');
      form.classList.add('active');
    }

    function hideApp() {
      introSection.classList.remove('active');
      form.classList.remove('active');
      resultsEl.classList.remove('active');
      loadingEl.classList.remove('active');
      errorBox.classList.remove('active');
    }

    /* ── Setup: Activate ───────────────────── */
    activateBtn.addEventListener('click', function() {
      var provider = (setupProvider && setupProvider.value) || 'anthropic';
      var meta = PROVIDER_META[provider] || PROVIDER_META.anthropic;
      var key = (setupApiKey.value || '').trim();

      if (meta.needsKey && !key) {
        setupApiKey.focus();
        return;
      }

      try {
        localStorage.setItem('llm_provider', provider);
        if (meta.needsKey) {
          localStorage.setItem('llm_api_key', key);
          /* keep legacy key name in sync for anyone watching storage */
          localStorage.setItem('clarity_api_key', key);
        } else {
          localStorage.removeItem('llm_api_key');
          localStorage.removeItem('clarity_api_key');
        }
      } catch(e) {}
      showApp();
      renderActiveProviderNote();
    });

    /* ── Reset API Key + provider ──────────── */
    resetKeyLink.addEventListener('click', function(e) {
      e.preventDefault();
      try {
        localStorage.removeItem('llm_provider');
        localStorage.removeItem('llm_api_key');
        localStorage.removeItem('llm_model');
        localStorage.removeItem('clarity_api_key');
        localStorage.removeItem('clarity-api-key');
      } catch(e) {}
      hideApp();
      hideAll();
      setupApiKey.value = '';
      if (setupProvider) setupProvider.value = 'anthropic';
      renderSetupForProvider('anthropic');
      setupScreen.classList.add('active');
      renderActiveProviderNote();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    /* ── Checkbox max-3 logic ──────────────── */
    var checkboxes = document.querySelectorAll('input[name="challenges"]');
    checkboxes.forEach(function(cb) {
      cb.addEventListener('change', enforceMaxChecked);
    });

    function enforceMaxChecked() {
      var checked = document.querySelectorAll('input[name="challenges"]:checked');
      var labels = document.querySelectorAll('.checkbox-group label');
      if (checked.length >= 3) {
        labels.forEach(function(lbl) {
          var input = lbl.querySelector('input');
          if (!input.checked) {
            lbl.classList.add('disabled-check');
            input.disabled = true;
          }
        });
      } else {
        labels.forEach(function(lbl) {
          var input = lbl.querySelector('input');
          lbl.classList.remove('disabled-check');
          input.disabled = false;
        });
      }
    }

    /* ── Form Submit ───────────────────────── */
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      runDiagnostic();
    });

    function getCheckedChallenges() {
      var checked = document.querySelectorAll('input[name="challenges"]:checked');
      var vals = [];
      checked.forEach(function(cb) { vals.push(cb.value); });
      return vals;
    }

    function runDiagnostic() {
      var provider     = getProvider();
      var meta         = PROVIDER_META[provider] || PROVIDER_META.anthropic;
      var apiKey       = getApiKey();
      var businessName = document.getElementById('businessName').value.trim();
      var industry     = document.getElementById('industry').value;
      var years        = document.getElementById('yearsInBusiness').value;
      var teamSize     = document.getElementById('teamSize').value;
      var challenges   = getCheckedChallenges();
      var aiUsage      = document.getElementById('aiUsage').value;
      var revenueGoal  = document.getElementById('revenueGoal').value;
      var personalData = (document.getElementById('personalData') || {}).value || '';

      // Validate
      if (meta.needsKey && !apiKey) {
        showError('No API key found. Please reset and re-enter your key.');
        return;
      }
      if (!businessName || !industry || !years || !teamSize || !aiUsage || !revenueGoal) {
        showError('Please complete all fields before submitting.');
        return;
      }
      if (challenges.length === 0) {
        showError('Please select at least one challenge.');
        return;
      }

      lastBusinessName = businessName;

      // Show loading
      hideAll();
      loadingEl.classList.add('active');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Analysing...';

      var prompt = buildPrompt(businessName, industry, years, teamSize, challenges, aiUsage, revenueGoal, personalData);

      /* Provider-aware call: llmChat picks the provider + default model
         from localStorage (set by the Activate flow). Anthropic callers
         still get Sonnet 4.6 by default via LLM_PROVIDERS.anthropic;
         OpenAI gets gpt-4o; Gemini gets gemini-2.0-flash; Ollama gets llama3. */
      llmChat(prompt, { maxTokens: 2048, provider: provider, apiKey: apiKey })
      .then(function(text) {
        if (!text) throw new Error('No response received from the API.');
        displayResults(businessName, industry, text);
      })
      .catch(function(err) {
        showError(err.message || 'An unexpected error occurred. Please check your API key and try again.');
      })
      .finally(function() {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Generate My Diagnostic';
        loadingEl.classList.remove('active');
      });
    }

    /* ── Build Prompt ──────────────────────── */
    function buildPrompt(name, industry, years, teamSize, challenges, aiUsage, revenueGoal, personalData) {
      return [
        'You are a senior business consultant specialising in AI transformation for Canadian small and medium businesses in Ontario.',
        '',
        'A business owner has completed a diagnostic questionnaire. Based on their answers, provide:',
        '',
        '1. An AI Readiness Score from 1–10, where 1 = no readiness and 10 = fully optimised for AI. Be honest and specific — most SMEs score between 2 and 6.',
        '2. A SWOT analysis (Strengths, Weaknesses, Opportunities, Threats) — 3 bullet points per category, specific to their situation and Canadian business context.',
        '3. Three numbered priority recommendations — each with a clear title, 2-3 sentence explanation, an effort rating (Low/Medium/High), and an impact rating (Low/Medium/High). Recommendations must name specific, available tools or approaches (e.g. "Claude", "Microsoft Copilot", "Zapier", "QuickBooks AI") where relevant.',
        '4. Three quick wins — concrete actions the business can do in the next 30 days. Short, punchy, one sentence each.',
        '5. A single "Suggested Next Step" — one concrete action they could take this week.',
        '',
        'Use Canadian English (centre, organisation, analyse, colour, programme, etc.). Be specific — reference their industry, team size, and challenges directly. Avoid generic jargon.',
        '',
        'IMPORTANT: Respond in this exact JSON format with no markdown, no code fences, just raw JSON:',
        '{',
        '  "readiness_score": 5,',
        '  "strengths": ["point 1", "point 2", "point 3"],',
        '  "weaknesses": ["point 1", "point 2", "point 3"],',
        '  "opportunities": ["point 1", "point 2", "point 3"],',
        '  "threats": ["point 1", "point 2", "point 3"],',
        '  "recommendations": [',
        '    {"title": "Title", "description": "Description", "effort": "Low|Medium|High", "impact": "Low|Medium|High"},',
        '    {"title": "Title", "description": "Description", "effort": "Low|Medium|High", "impact": "Low|Medium|High"},',
        '    {"title": "Title", "description": "Description", "effort": "Low|Medium|High", "impact": "Low|Medium|High"}',
        '  ],',
        '  "quick_wins": ["action 1", "action 2", "action 3"],',
        '  "next_step": "The single next step they should take this week."',
        '}',
        '',
        'Business Details:',
        '- Name: ' + name,
        '- Industry: ' + industry,
        '- Years in business: ' + years,
        '- Team size: ' + teamSize,
        '- Top challenges: ' + challenges.join(', '),
        '- Current AI usage: ' + aiUsage,
        '- Revenue goal (next 12 months): ' + revenueGoal,
        personalData ? ('- Customer personal data: ' + personalData) : ''
      ].filter(Boolean).concat(
        personalData && personalData.indexOf('No') === -1 ? [
          '',
          'PIPEDA NOTE: This business collects or handles customer personal information. In your recommendations, include one specific note about Canadian privacy obligations under PIPEDA (Personal Information Protection and Electronic Documents Act) — specifically how any AI tools they adopt must handle personal data lawfully. Flag if their described data handling raises any compliance considerations. Keep it brief (2 sentences max) and practical, not alarmist.'
        ] : []
      ).join('\n');
    }

    /* ── Display Results ───────────────────── */
    /* rawTextOrData: string (from API) or pre-parsed object (demo mode) */
    function displayResults(name, industry, rawTextOrData) {
      hideAll();

      var data;
      if (rawTextOrData && typeof rawTextOrData === 'object') {
        data = rawTextOrData;
      } else {
        try {
          var cleaned = rawTextOrData.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
          data = JSON.parse(cleaned);
        } catch (e) {
          showError('The AI response could not be parsed. Please try again.');
          return;
        }
      }

      lastReportData = data;
      lastBusinessName = name;

      // Header
      document.getElementById('resultsTitle').textContent = 'Diagnostic: ' + name;
      document.getElementById('resultsSubtitle').textContent = industry + ' — Generated ' + new Date().toLocaleDateString('en-CA');

      // Readiness score badge + industry benchmark
      var badge = document.getElementById('readinessBadge');
      var scoreEl = document.getElementById('readinessScore');
      var benchmarkEl = document.getElementById('readinessBenchmark');
      if (badge && scoreEl && data.readiness_score) {
        var score = parseInt(data.readiness_score, 10);
        if (!isNaN(score) && score >= 1 && score <= 10) {
          scoreEl.textContent = score + '/10';
          badge.style.display = '';

          // Industry benchmark comparison
          var benchmark = INDUSTRY_BENCHMARKS[industry];
          if (benchmark && benchmarkEl) {
            var diff = score - benchmark.score;
            var direction = diff > 0 ? 'above' : diff < 0 ? 'below' : 'at';
            var directionLabel = diff > 0 ? '↑ above' : diff < 0 ? '↓ below' : '= at';
            var dirClass = diff > 0 ? 'benchmark-ahead' : diff < 0 ? 'benchmark-behind' : 'benchmark-at';
            benchmarkEl.innerHTML =
              '<span class="benchmark-label">Industry avg: <strong>' + benchmark.score + '/10</strong></span>' +
              '<span class="benchmark-diff ' + dirClass + '">' + directionLabel + ' average</span>';
            benchmarkEl.title = benchmark.note + ' (Source: BDC AI Adoption Report 2023, ISED)';
            benchmarkEl.style.display = '';
          }
        }
      }

      // SWOT Grid
      var swotGrid = document.getElementById('swotGrid');
      swotGrid.innerHTML = '';
      var categories = [
        { key: 'strengths', label: 'Strengths', cls: 'swot-s' },
        { key: 'weaknesses', label: 'Weaknesses', cls: 'swot-w' },
        { key: 'opportunities', label: 'Opportunities', cls: 'swot-o' },
        { key: 'threats', label: 'Threats', cls: 'swot-t' }
      ];
      categories.forEach(function(cat) {
        var card = document.createElement('div');
        card.className = 'swot-card ' + cat.cls;
        var items = data[cat.key] || [];
        card.innerHTML = '<h3>' + cat.label + '</h3><ul>' +
          items.map(function(item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') +
          '</ul>';
        swotGrid.appendChild(card);
      });

      // Recommendations with effort/impact badges
      var recsEl = document.getElementById('recommendations');
      recsEl.innerHTML = '<h3>Priority Recommendations</h3>';
      (data.recommendations || []).forEach(function(rec, i) {
        var div = document.createElement('div');
        div.className = 'rec-item';
        var effortCls = 'badge badge-effort';
        var impactCls = 'badge badge-impact-' + (rec.impact || 'medium').toLowerCase();
        div.innerHTML = '<h4>' + (i + 1) + '. ' + escapeHtml(rec.title) + '</h4>' +
          '<p>' + escapeHtml(rec.description) + '</p>' +
          '<div class="rec-badges">' +
            '<span class="' + effortCls + '">Effort: ' + escapeHtml(rec.effort || 'Medium') + '</span>' +
            '<span class="' + impactCls + '">Impact: ' + escapeHtml(rec.impact || 'Medium') + '</span>' +
          '</div>';
        recsEl.appendChild(div);
      });

      // Quick Wins
      var qwEl = document.getElementById('quickWins');
      var quickWins = data.quick_wins || [];
      if (quickWins.length > 0) {
        qwEl.innerHTML = '<h3>Quick Wins — Next 30 Days</h3>';
        quickWins.forEach(function(win, i) {
          var card = document.createElement('div');
          card.className = 'qw-card';
          card.innerHTML = '<span class="qw-num">' + (i + 1) + '</span><span>' + escapeHtml(win) + '</span>';
          qwEl.appendChild(card);
        });
      } else {
        qwEl.innerHTML = '';
      }

      // Next Step
      var nextStepEl = document.getElementById('nextStep');
      nextStepEl.innerHTML = '<h3>Suggested Next Step</h3><p>' + escapeHtml(data.next_step || '') + '</p>';

      // PIPEDA privacy note (shown when business collects personal data)
      var pipedaEl = document.getElementById('pipedaNote');
      var pipedaText = data.pipeda_note || '';
      if (pipedaEl) {
        if (pipedaText) {
          pipedaEl.innerHTML = '<h3>🔒 Canadian Privacy Note (PIPEDA)</h3><p>' + escapeHtml(pipedaText) + '</p>';
          pipedaEl.style.display = '';
        } else {
          pipedaEl.style.display = 'none';
        }
      }

      // Consultation CTA mailto
      var subject = encodeURIComponent('Clarity Consultation Request — ' + name);
      var bodyLines = [
        'Hi Aaron,',
        '',
        'I just ran a Clarity diagnostic for ' + name + '.',
        '',
        'Key highlights from my results:',
        '- Top recommendation: ' + (data.recommendations && data.recommendations[0] ? data.recommendations[0].title : 'N/A'),
        '- Suggested next step: ' + (data.next_step || 'N/A'),
        '',
        'I would like to schedule a 30-minute call to discuss whether an AI Workflow Audit would make sense for my business.',
        '',
        'Best times for me: [please fill in]',
        '',
        'Thanks'
      ];
      var mailBody = encodeURIComponent(bodyLines.join('\n'));
      var ctaLink = document.getElementById('ctaLink');
      ctaLink.href = 'mailto:aaron.patzalek@gmail.com?subject=' + subject + '&body=' + mailBody;
      ctaLink.textContent = 'Email Aaron about my results →';

      resultsEl.classList.add('active');
      resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      /* Shift focus so screen readers reliably announce the results heading. */
      try { resultsEl.focus({ preventScroll: true }); } catch(e) {}
    }

    /* ── Save Report — downloads as formatted text file ── */
    saveReportBtn.addEventListener('click', function() {
      if (!lastReportData) return;
      var d = lastReportData;
      var date = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
      var lines = [
        'CLARITY AI READINESS DIAGNOSTIC REPORT',
        'Two Birds Innovation — twobirds-kramerica.github.io/clarity/',
        '================================================',
        '',
        'Business: ' + (lastBusinessName || 'Not specified'),
        'Date: ' + date,
        'AI Readiness Score: ' + (d.readiness_score ? d.readiness_score + ' / 10' : 'N/A'),
        '',
        'OVERALL ASSESSMENT',
        '------------------',
        d.overall_assessment || '',
        '',
        'SWOT ANALYSIS',
        '-------------',
        'Strengths:',
        (d.strengths || []).map(function(s) { return '  + ' + s; }).join('\n'),
        '',
        'Weaknesses:',
        (d.weaknesses || []).map(function(w) { return '  - ' + w; }).join('\n'),
        '',
        'Opportunities:',
        (d.opportunities || []).map(function(o) { return '  > ' + o; }).join('\n'),
        '',
        'Threats / Risks:',
        (d.threats || []).map(function(t) { return '  ! ' + t; }).join('\n'),
        '',
        'PRIORITY ACTIONS',
        '----------------',
        (d.priority_actions || []).map(function(a, i) { return (i + 1) + '. ' + a; }).join('\n'),
        '',
        'SUGGESTED FIRST STEP',
        '--------------------',
        d.suggested_first_step || '',
        '',
        'TOOLS MENTIONED',
        '---------------',
        (d.named_tools || []).join(', ') || 'None specified',
        '',
        '================================================',
        'Generated by Clarity — a free Two Birds Innovation tool.',
        'Questions? aaron.patzalek@gmail.com | cal.com/twobirds-4n5ajg/30min',
        ''
      ].join('\n');

      var blob = new Blob([lines], { type: 'text/plain;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var filename = 'clarity-report-' + (lastBusinessName || 'business').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() + '-' + new Date().toISOString().slice(0, 10) + '.txt';
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);

      saveReportBtn.textContent = '✓ Downloaded';
      setTimeout(function() { saveReportBtn.textContent = 'Save Report'; }, 3000);
    });

    /* ── Run Another ───────────────────────── */
    runAnotherBtn.addEventListener('click', function() {
      resetForm();
    });

    /* ── Try Again ─────────────────────────── */
    tryAgainBtn.addEventListener('click', function() {
      hideAll();
      introSection.classList.add('active');
      form.classList.add('active');
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    /* ── Utility ───────────────────────────── */
    function showError(msg) {
      hideAll();
      errorMessage.textContent = msg;
      errorBox.classList.add('active');
      loadingEl.classList.remove('active');
    }

    function hideAll() {
      errorBox.classList.remove('active');
      resultsEl.classList.remove('active');
      loadingEl.classList.remove('active');
      var badge = document.getElementById('readinessBadge');
      if (badge) badge.style.display = 'none';
      var bench = document.getElementById('readinessBenchmark');
      if (bench) bench.style.display = 'none';
      if (demoBanner) demoBanner.style.display = 'none';
    }

    function escapeHtml(str) {
      var div = document.createElement('div');
      div.appendChild(document.createTextNode(str));
      return div.innerHTML;
    }

    window.resetForm = function() {
      hideAll();
      form.reset();
      // Re-enable all checkboxes
      checkboxes.forEach(function(cb) {
        cb.disabled = false;
        cb.parentElement.classList.remove('disabled-check');
      });
      introSection.classList.add('active');
      form.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    /* ── Lead Capture ──────────────────────── */
    /* Lead capture uses Web3Forms — the sovereign form backend already in the
       Two Birds stack (decapitation checklist #5; DCC uses it in feedback-github.js).
       No backend, no account required for basic use, CORS-safe for static sites.
       To route Clarity leads to a dedicated inbox, paste a free Web3Forms access
       key (web3forms.com — 30s, no signup needed beyond an email confirmation).
       Until then, the mailto fallback below still delivers every lead to Aaron,
       so capture is NEVER silently lost.
       Legacy: FORMSPREE_ENDPOINT retained as an optional override if ever needed. */
    var WEB3FORMS_KEY    = '';   // paste a Clarity-specific key to enable silent submit
    var FORMSPREE_ENDPOINT = ''; // optional override; leave empty to use Web3Forms/mailto

    var leadCaptureForm = document.getElementById('leadCaptureForm');
    var leadSubmitBtn   = document.getElementById('leadSubmitBtn');
    var leadConfirm     = document.getElementById('leadCaptureConfirm');

    function showLeadConfirm() {
      leadCaptureForm.style.display = 'none';
      if (leadConfirm) leadConfirm.style.display = '';
    }

    if (leadCaptureForm) {
      leadCaptureForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var email = (document.getElementById('leadEmail').value || '').trim();
        if (!email || !email.includes('@')) {
          document.getElementById('leadEmail').focus();
          return;
        }

        var topRec = (lastReportData && lastReportData.recommendations && lastReportData.recommendations[0]) ? lastReportData.recommendations[0].title : 'n/a';
        var score  = (lastReportData && lastReportData.readiness_score) ? lastReportData.readiness_score + '/10' : 'n/a';

        /* Path 1: Web3Forms (sovereign, silent submit) */
        if (WEB3FORMS_KEY) {
          leadSubmitBtn.disabled = true;
          leadSubmitBtn.textContent = 'Sending…';
          fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
              access_key: WEB3FORMS_KEY,
              subject: 'Clarity Lead — ' + lastBusinessName,
              from_name: lastBusinessName || 'Clarity diagnostic',
              email: email,
              readiness_score: score,
              top_recommendation: topRec,
              next_step: (lastReportData && lastReportData.next_step) ? lastReportData.next_step : 'n/a'
            })
          })
          .then(showLeadConfirm)
          .catch(function() { leadSubmitBtn.disabled = false; leadSubmitBtn.textContent = 'Send Me My Results'; });
          return;
        }

        /* Path 2: Formspree override (optional, legacy) */
        if (FORMSPREE_ENDPOINT) {
          leadSubmitBtn.disabled = true;
          leadSubmitBtn.textContent = 'Sending…';
          fetch(FORMSPREE_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
              email: email, business: lastBusinessName, readiness_score: score,
              top_recommendation: topRec,
              next_step: (lastReportData && lastReportData.next_step) ? lastReportData.next_step : 'n/a',
              _subject: 'Clarity Lead — ' + lastBusinessName
            })
          })
          .then(showLeadConfirm)
          .catch(function() { leadSubmitBtn.disabled = false; leadSubmitBtn.textContent = 'Send Me My Results'; });
          return;
        }

        /* Path 3: mailto fallback — lead is never lost even with no key set */
        var subject = encodeURIComponent('Clarity Lead — ' + lastBusinessName);
        var body = encodeURIComponent(
          'Lead email: ' + email + '\n' +
          'Business: ' + lastBusinessName + '\n' +
          'Readiness score: ' + score + '\n' +
          'Top rec: ' + topRec
        );
        window.location.href = 'mailto:aaron.patzalek@gmail.com?subject=' + subject + '&body=' + body;
        showLeadConfirm();
      });
    }

    /* ── Demo Mode ─────────────────────────── */
    var SAMPLE_DATA = {
      readiness_score: 3,
      pipeda_note: 'Riverside Plumbing collects customer contact information (name, address, phone) for job scheduling. Under PIPEDA, you must obtain consent before using customer data with third-party AI tools like ChatGPT — avoid pasting customer names or addresses into AI prompts. Consider a simple privacy notice on your booking form stating that contact data is used for service coordination only.',
      strengths: [
        "Strong customer relationships built over a decade in the trades — clients trust you and refer others, giving you a reliable base to introduce new tools gradually.",
        "Lean team structure means any AI workflow you adopt can be deployed across the whole business quickly, without complex change-management processes.",
        "Established local reputation in Southwestern Ontario reduces your need for paid advertising — AI can amplify organic word-of-mouth rather than replace it."
      ],
      weaknesses: [
        "No current documentation of repeatable processes — without this foundation, AI tools have nothing consistent to learn from or automate.",
        "Estimating and quoting is still done manually, creating a bottleneck that limits how many jobs you can quote per week.",
        "Staff capacity is stretched during peak season, leaving no time to learn or trial new tools even when the value is clear."
      ],
      opportunities: [
        "AI-assisted estimating tools (e.g. Knowify, BuildOps) could cut quoting time by 40–60%, letting you quote more jobs without adding headcount.",
        "Automated follow-up sequences for leads (via a tool like Jobber + AI-drafted messages) could convert more estimates to booked jobs without manual chasing.",
        "Ontario's WSIB and Ministry of Labour compliance requirements create ongoing documentation overhead — AI can draft and maintain safety documentation at a fraction of the current cost."
      ],
      threats: [
        "Larger regional contractors are beginning to adopt AI estimating and project management tools, which will allow them to underbid on speed and responsiveness.",
        "Labour shortages in the trades will worsen — businesses without AI-assisted scheduling and coordination will struggle to deliver on their backlog.",
        "If a competitor launches a customer-facing self-service booking portal before you do, clients who value convenience will shift their preference."
      ],
      recommendations: [
        {
          title: "Start with AI-Assisted Estimating",
          description: "Tools like Knowify or BuildOps integrate with your job types and materials lists to generate accurate quotes in minutes. Start with your 3 most common job types. The payback on a single additional job per month covers the tool cost entirely.",
          effort: "Medium",
          impact: "High"
        },
        {
          title: "Automate Your Follow-Up Sequence",
          description: "Most trades businesses lose 30–40% of quoted jobs simply by not following up. Use Jobber's built-in automation (or a free Zapier workflow) to send a personalised check-in 3 days after every quote. Claude can draft your message templates in 10 minutes.",
          effort: "Low",
          impact: "High"
        },
        {
          title: "Document Your Top 5 Processes with AI",
          description: "Before you can automate anything, you need written processes. Use Claude or ChatGPT to record yourself explaining how you handle a job from enquiry to invoice — 15 minutes of voice notes becomes a clean SOP. Do this for your top 5 workflows first.",
          effort: "Low",
          impact: "Medium"
        }
      ],
      quick_wins: [
        "Use Claude or ChatGPT to draft a templated follow-up email for every quote you send — takes 20 minutes once, saves time on every job.",
        "Ask an AI tool to turn your 3 most common job scopes into reusable quote templates with standard line items.",
        "Record yourself explaining your onboarding process for a new job, then paste the transcript into Claude and ask it to turn it into a one-page checklist."
      ],
      next_step: "This week: open a free Claude account (claude.ai) and ask it to write a follow-up email template for a quoted plumbing job. Use your own voice — paste in a rough draft and ask it to polish. Send that template to your next 5 leads and see if your conversion rate changes."
    };

    var showSampleBtn = document.getElementById('showSampleBtn');
    var demoBanner = document.getElementById('demoBanner');
    var dismissDemo = document.getElementById('dismissDemo');

    if (showSampleBtn) {
      showSampleBtn.addEventListener('click', function(e) {
        e.preventDefault();
        setupScreen.classList.remove('active');
        if (demoBanner) demoBanner.style.display = '';
        displayResults('Riverside Plumbing & Heating', 'Trades', SAMPLE_DATA);
      });
    }

    if (dismissDemo) {
      dismissDemo.addEventListener('click', function(e) {
        e.preventDefault();
        if (demoBanner) demoBanner.style.display = 'none';
        hideAll();
        var provider = getProvider();
        var meta = PROVIDER_META[provider];
        var key = getApiKey();
        if (meta && (!meta.needsKey || key)) {
          showApp();
        } else {
          setupScreen.classList.add('active');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    /* ── Boot ──────────────────────────────── */
    init();

  })();
