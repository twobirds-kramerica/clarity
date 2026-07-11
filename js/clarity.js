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
    var submitBtn    = null;
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
      proxy: {
        label:      'Built-in analysis',
        keyLabel:   '',
        placeholder:'',
        signupUrl:  '',
        signupText: '',
        needsKey:   false
      },
      anthropic: {
        label:      'Anthropic Claude',
        keyLabel:   'Anthropic service credential',
        placeholder:'sk-ant-...',
        signupUrl:  'https://console.anthropic.com/',
        signupText: 'Get an Anthropic credential →',
        needsKey:   true
      },
      openai: {
        label:      'OpenAI GPT-4o',
        keyLabel:   'OpenAI service credential',
        placeholder:'sk-...',
        signupUrl:  'https://platform.openai.com/api-keys',
        signupText: 'Get an OpenAI credential →',
        needsKey:   true
      },
      gemini: {
        label:      'Google Gemini',
        keyLabel:   'Google AI Studio service credential',
        placeholder:'AIza...',
        signupUrl:  'https://aistudio.google.com/apikey',
        signupText: 'Get a Gemini credential →',
        needsKey:   true
      },
      ollama: {
        label:      'Ollama (local)',
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
        introSection.classList.remove('active');
        form.classList.remove('active');
        setupScreen.classList.add('active');
        if (setupProvider) setupProvider.focus();
        /* Track setup screen view */
        try {
          var stats = JSON.parse(localStorage.getItem('clarity_stats') || '{}');
          stats.setup_views = (stats.setup_views || 0) + 1;
          localStorage.setItem('clarity_stats', JSON.stringify(stats));
        } catch(e) {}
      }
    }

    function getProvider() {
      try { return localStorage.getItem('llm_provider') || 'proxy'; }
      catch(e) { return 'proxy'; }
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
      var meta = PROVIDER_META[provider] || PROVIDER_META.proxy;
      if (provider === 'proxy') {
        note.textContent = 'Your answers are analysed by Clarity\'s built-in analysis engine. Nothing you enter is stored on our servers.';
      } else {
        note.textContent = 'Analysis engine: ' + meta.label +
          '. Your credential and business details stay in your browser and are sent only to ' +
          meta.label + ' directly.';
      }
    }

    function renderSetupForProvider(provider) {
      var meta = PROVIDER_META[provider] || PROVIDER_META.proxy;
      if (setupApiKeyLabel) setupApiKeyLabel.textContent = meta.keyLabel || 'Service credential';
      if (setupApiKey) {
        setupApiKey.placeholder = meta.placeholder;
        setupApiKey.value = '';
        setupApiKey.required = meta.needsKey;
      }
      if (setupApiKeyGroup) {
        setupApiKeyGroup.style.display = meta.needsKey ? '' : 'none';
      }
      if (getKeyLink) {
        getKeyLink.style.display = meta.signupUrl ? '' : 'none';
        getKeyLink.href = meta.signupUrl || '#';
        getKeyLink.textContent = meta.signupText;
        if (window.markNewTabLink) window.markNewTabLink(getKeyLink);
      }
      if (activateBtn) {
        activateBtn.textContent = provider === 'proxy' ? 'Use built-in analysis →' : 'Connect my own service';
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

    /* ── Advanced settings (analysis engine) ─ */
    /* Opens the settings panel without wiping the stored configuration;
       the Activate flow overwrites it only when the user saves a change. */
    resetKeyLink.addEventListener('click', function(e) {
      e.preventDefault();
      hideApp();
      hideAll();
      setupApiKey.value = '';
      if (setupProvider) setupProvider.value = getProvider();
      renderSetupForProvider(getProvider());
      setupScreen.classList.add('active');
      if (setupProvider) setupProvider.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    var setupBackBtn = document.getElementById('setupBackBtn');
    if (setupBackBtn) {
      setupBackBtn.addEventListener('click', function(e) {
        e.preventDefault();
        showApp();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    /* ── Checkbox max-3 logic ──────────────── */
    var checkboxes = [];

    function enforceMaxChecked() {
      var checked = document.querySelectorAll('input[name="challenges"]:checked');
      var labels = document.querySelectorAll('#challengeGroup .checkbox-group label');
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

    /* ── Step navigation ──────────────────── */
    var currentStep = 1;
    var totalSteps  = 6;

    function updateProgress() {
      var fill  = document.getElementById('progressFill');
      var label = document.getElementById('progressLabel');
      if (fill)  fill.style.width = Math.round((currentStep / totalSteps) * 100) + '%';
      if (label) label.textContent = 'Question ' + currentStep + ' of ' + totalSteps;
    }

    function validateStep(step) {
      if (step === 1) {
        var name = document.getElementById('businessName').value.trim();
        if (!name) { document.getElementById('businessName').focus(); return false; }
      } else if (step === 2) {
        var selected = getSelectedIndustries();
        if (selected.length === 0) {
          var firstInd = document.querySelector('input[name="industries"]');
          if (firstInd) firstInd.focus();
          return false;
        }
        if (selected.length >= 2 && !getPrimaryIndustry()) {
          var primarySel = document.getElementById('primaryIndustry');
          if (primarySel) primarySel.focus();
          return false;
        }
      } else if (step === 3) {
        if (!document.getElementById('teamSize').value) { document.getElementById('teamSize').focus(); return false; }
        if (!document.getElementById('yearsInBusiness').value) { document.getElementById('yearsInBusiness').focus(); return false; }
      } else if (step === 4) {
        if (document.querySelectorAll('input[name="challenges"]:checked').length === 0) {
          var firstCb = document.querySelector('input[name="challenges"]');
          if (firstCb) firstCb.focus();
          return false;
        }
      } else if (step === 5) {
        if (!document.getElementById('systemsLevel').value) { document.getElementById('systemsLevel').focus(); return false; }
      }
      return true;
    }

    function showStep(toStep, direction) {
      var outEl = document.getElementById('step' + currentStep);
      var inEl  = document.getElementById('step' + toStep);
      if (!outEl || !inEl) return;
      var outClass = direction === 'forward' ? 'slide-out-left' : 'slide-out-right';
      var inClass  = direction === 'forward' ? 'slide-in-right' : 'slide-in-left';
      outEl.classList.add(outClass);
      setTimeout(function() {
        outEl.classList.remove('active', outClass);
        inEl.classList.add('active', inClass);
        requestAnimationFrame(function() {
          requestAnimationFrame(function() { inEl.classList.remove(inClass); });
        });
        currentStep = toStep;
        updateProgress();
        var firstInput = inEl.querySelector('input:not([type="checkbox"]), select');
        if (firstInput) firstInput.focus();
      }, 220);
    }

    function resetSteps() {
      currentStep = 1;
      document.querySelectorAll('.question-card').forEach(function(card) {
        card.classList.remove('active', 'slide-out-left', 'slide-out-right', 'slide-in-right', 'slide-in-left');
      });
      var first = document.getElementById('step1');
      if (first) first.classList.add('active');
      updateProgress();
    }

    form.addEventListener('click', function(e) {
      var next = e.target.closest('.next-btn[data-next]');
      var back = e.target.closest('.back-btn[data-back]');
      if (next) {
        if (!stepsInjected) injectRemainingSteps();
        if (!validateStep(currentStep)) return;
        showStep(parseInt(next.getAttribute('data-next'), 10), 'forward');
      } else if (back) {
        showStep(parseInt(back.getAttribute('data-back'), 10), 'back');
      }
    });

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
      var industries   = getSelectedIndustries();
      var primary      = getPrimaryIndustry();
      var years        = document.getElementById('yearsInBusiness').value;
      var teamSize     = document.getElementById('teamSize').value;
      var challenges   = getCheckedChallenges();
      var systemsLevel = document.getElementById('systemsLevel').value;
      var ownerGoal    = ((document.getElementById('ownerGoal') || {}).value || '').trim();
      var personalData = (document.getElementById('personalData') || {}).value || '';

      // Validate
      if (meta.needsKey && !apiKey) {
        showError('No service credential found. Open Advanced settings at the bottom of the page and re-enter it, or switch to the built-in analysis.');
        return;
      }
      if (!businessName || !primary || !years || !teamSize || !systemsLevel) {
        showError('Please complete all fields before submitting.');
        return;
      }
      if (challenges.length === 0) {
        showError('Please select at least one time sink.');
        return;
      }
      var industry     = primary.label;
      var benchmarkKey = primary.benchmark;

      lastBusinessName = businessName;

      // Show loading
      hideAll();
      loadingEl.classList.add('active');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Analysing...';
      document.getElementById('diagnosticForm').setAttribute('aria-busy', 'true');

      var prompt = buildPrompt(businessName, industries, primary, years, teamSize, challenges, systemsLevel, ownerGoal, personalData);

      /* Provider-aware call: llmChat picks the provider + default model
         from localStorage (set by the Activate flow). Anthropic callers
         still get Sonnet 4.6 by default via LLM_PROVIDERS.anthropic;
         OpenAI gets gpt-4o; Gemini gets gemini-2.0-flash; Ollama gets llama3. */
      llmChat(prompt, { maxTokens: 4096, provider: provider, apiKey: apiKey })
      .then(function(text) {
        if (!text) throw new Error('No response received from the analysis engine.');
        displayResults(businessName, industry, text, benchmarkKey);
      })
      .catch(function(err) {
        /* Proxy failures surface as cryptic network errors — give the
           no-key user a path forward instead of a dead end. */
        if (provider === 'proxy') {
          showError('Clarity’s built-in analysis engine is temporarily unavailable. You can see a sample report right now, or try again in a few minutes.');
        } else {
          showError(err.message || 'That credential didn’t work. You can fix it under Advanced settings, or switch back to the built-in analysis, which needs no setup.');
        }
      })
      .finally(function() {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Generate my report';
        loadingEl.classList.remove('active');
        document.getElementById('diagnosticForm').setAttribute('aria-busy', 'false');
      });
    }

    /* ── Build Prompt ──────────────────────── */
    function buildPrompt(name, industries, primary, years, teamSize, challenges, systemsLevel, ownerGoal, personalData) {
      var secondary = industries
        .filter(function(s) { return s.label !== primary.label; })
        .map(function(s) { return s.label; });
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
        '6. A competitive landscape snapshot for their primary line of business: a 2-3 sentence overview of the competitive pressures a business of their size and stage typically faces in that industry in Canada, then exactly 3 specific competitive pressures as short bullets, then one sentence on where a business like theirs can realistically stand out. Ground every point in what they told you (industry, size, years in business, systems, time sinks). Write about operations, service, pricing, and customer expectations. Do not name real competitors and do not invent statistics.',
        '7. A market trends summary for their primary line of business: exactly 3 trends currently shaping that industry for Canadian small and mid-size businesses. Each trend needs a short plain-language title and a 1-2 sentence note on what it means for a business of their size. Focus on operations, labour, customer behaviour, and costs. Keep trends qualitative. Do not fabricate specific statistics, percentages, or dollar figures.',
        '8. A TIM WOODS waste scan: TIM WOODS is the lean-manufacturing checklist of eight sources of operational waste (Transport, Inventory, Motion, Waiting, Overproduction, Overprocessing, Defects, Skills). Identify the 2 to 4 wastes that most clearly show up in what this owner told you, not all eight, and not the ones that do not fit. For each, name the waste and write a 1-2 sentence note tying it directly to their stated time sinks, systems level, or team size. Do not invent a waste that has no basis in their answers.',
        '9. A fishbone (Ishikawa) root-cause breakdown for the single biggest problem in their answers (usually their top time sink or their one-year goal). State the problem in one plain sentence, then give one likely root cause in each of these four categories: People, Process, Tools & Systems, Environment. Skip a category only if it genuinely does not apply; do not force a weak cause into every box.',
        '',
        'Use Canadian English (centre, organisation, analyse, colour, programme, etc.). Be specific — reference their industry, team size, and challenges directly. Avoid generic jargon. Do not use em dashes anywhere in your output; use commas or periods instead.',
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
        '  "next_step": "The single next step they should take this week.",',
        '  "competitive_landscape": {',
        '    "summary": "2-3 sentence overview of the competitive pressures for a business of this size and stage.",',
        '    "pressures": ["pressure 1", "pressure 2", "pressure 3"],',
        '    "edge": "One sentence on where this business can realistically stand out."',
        '  },',
        '  "market_trends": [',
        '    {"trend": "Short plain-language title", "note": "What it means for a business this size."},',
        '    {"trend": "Short plain-language title", "note": "What it means for a business this size."},',
        '    {"trend": "Short plain-language title", "note": "What it means for a business this size."}',
        '  ],',
        '  "tim_woods": [',
        '    {"waste": "Waiting|Motion|Transport|Inventory|Overproduction|Overprocessing|Defects|Skills", "note": "How this waste shows up for them, 1-2 sentences."}',
        '  ],',
        '  "fishbone": {',
        '    "problem": "One plain sentence naming the core problem.",',
        '    "causes": [',
        '      {"category": "People", "cause": "One likely root cause."},',
        '      {"category": "Process", "cause": "One likely root cause."},',
        '      {"category": "Tools & Systems", "cause": "One likely root cause."},',
        '      {"category": "Environment", "cause": "One likely root cause."}',
        '    ]',
        '  }',
        '}',
        '',
        'Business Details:',
        '- Name: ' + name,
        '- Primary line of business (benchmark against this): ' + primary.label,
        secondary.length ? ('- Also operates in: ' + secondary.join('; ')) : '',
        '- Years in business: ' + years,
        '- Team size: ' + teamSize,
        '- Biggest weekly time sinks: ' + challenges.join(', '),
        '- How their systems connect today: ' + systemsLevel,
        ownerGoal ? ('- The owner\'s stated priority for the next year: ' + ownerGoal) : '',
        personalData ? ('- Customer personal data: ' + personalData) : ''
      ].filter(Boolean).concat(
        personalData && personalData.indexOf('No') === -1 ? [
          '',
          'PIPEDA NOTE: This business collects or handles customer personal information. In your recommendations, include one specific note about Canadian privacy obligations under PIPEDA (Personal Information Protection and Electronic Documents Act) — specifically how any AI tools they adopt must handle personal data lawfully. Flag if their described data handling raises any compliance considerations. Keep it brief (2 sentences max) and practical, not alarmist.'
        ] : []
      ).join('\n');
    }

    /* ── Display Results ───────────────────── */
    /* rawTextOrData: string (from API) or pre-parsed object (demo mode).
       benchmarkKey: INDUSTRY_BENCHMARKS lookup key; defaults to industry. */
    function displayResults(name, industry, rawTextOrData, benchmarkKey) {
      hideAll();
      benchmarkKey = benchmarkKey || industry;

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

      // Readiness score + industry benchmark + plain-language band interpretation
      var readinessLine = document.getElementById('readinessLine');
      if (readinessLine && data.readiness_score) {
        var score = parseInt(data.readiness_score, 10);
        if (!isNaN(score) && score >= 1 && score <= 10) {
          var benchmark = INDUSTRY_BENCHMARKS[benchmarkKey];
          var lineText = 'Readiness: ' + score + '/10';
          if (benchmark) {
            var diff = score - benchmark.score;
            var rel = diff > 0 ? 'above' : diff < 0 ? 'below' : 'at';
            lineText += ' (' + rel + ' the ' + benchmarkKey + ' sector average of ' + benchmark.score + '/10)';
          }
          var bandNote = score <= 3
            ? 'Most businesses at this stage benefit from documenting processes before adopting AI tools.'
            : score <= 6
            ? 'You have a foundation in place. Targeted improvements in your weakest areas will get you ready for meaningful AI adoption.'
            : 'Your readiness puts you ahead of most Canadian SMEs. The opportunity is deploying AI into processes that are already working.';
          readinessLine.innerHTML = escapeHtml(lineText) + '<br><span style="font-size:0.9em;opacity:0.82;">' + escapeHtml(bandNote) + '</span>';
          readinessLine.style.display = '';
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

      // Effort vs. Payback Matrix (plots the recommendations above)
      renderEffortMatrix(data.recommendations || []);

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

      // Competitive Landscape Snapshot (built from what the user told us)
      renderCompetitiveLandscape(data.competitive_landscape);

      // Market Trends Summary (industry-specific, clearly labelled as synthesised)
      renderMarketTrends(data.market_trends, industry);

      // TIM WOODS waste scan (only the wastes that showed up in their answers)
      renderTimWoods(data.tim_woods);

      // Fishbone (Ishikawa) root-cause breakdown of their biggest problem
      renderFishbone(data.fishbone);

      // Industry benchmark context note (surfaces the sector note from INDUSTRY_BENCHMARKS)
      var benchNoteEl = document.getElementById('benchmarkContextNote');
      if (benchNoteEl) {
        var benchmarkEntry = INDUSTRY_BENCHMARKS[benchmarkKey];
        if (benchmarkEntry && benchmarkEntry.note) {
          benchNoteEl.innerHTML = '<div class="benchmark-note"><strong>' + escapeHtml(benchmarkKey) + ' sector context:</strong> ' + escapeHtml(benchmarkEntry.note) + '</div>';
        } else {
          benchNoteEl.innerHTML = '';
        }
      }

      resultsEl.classList.add('active');
      resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      /* Shift focus so screen readers reliably announce the results heading. */
      try { resultsEl.focus({ preventScroll: true }); } catch(e) {}

      /* Track completion — sovereign localStorage counter.
         Read with: JSON.parse(localStorage.getItem('clarity_stats') || '{}') in devtools. */
      try {
        var stats = JSON.parse(localStorage.getItem('clarity_stats') || '{}');
        stats.completions = (stats.completions || 0) + 1;
        stats.last_completion = new Date().toISOString();
        stats.last_industry = (typeof industry !== 'undefined') ? industry : 'unknown';
        localStorage.setItem('clarity_stats', JSON.stringify(stats));
      } catch(e) {}
    }

    /* ── Effort vs. Payback Matrix ───────────── */
    /* Plots the priority recommendations on a 2x2 grid: effort (x) vs.
       payback (y). Low/Medium/High map to fixed positions; overlapping
       points are nudged sideways so every number stays visible. */
    function renderEffortMatrix(recs) {
      var el = document.getElementById('effortMatrix');
      if (!el) return;
      recs = (recs || []).filter(function(r) { return r && r.title; });
      if (!recs.length) { el.innerHTML = ''; return; }

      var POS = { low: 18, medium: 50, high: 82 };
      var used = {};
      var dots = '';
      var legend = '';
      var described = [];

      recs.forEach(function(rec, i) {
        var effort = String(rec.effort || 'Medium').toLowerCase();
        var impact = String(rec.impact || 'Medium').toLowerCase();
        var x = POS[effort] || 50;
        var y = 100 - (POS[impact] || 50); /* high payback sits at the top */
        var key = x + ',' + y;
        var bump = used[key] || 0;
        used[key] = bump + 1;
        x = Math.min(90, x + bump * 9); /* nudge duplicates right */
        dots += '<span class="matrix-dot" style="left:' + x + '%;top:' + y + '%;" aria-hidden="true">' + (i + 1) + '</span>';
        legend += '<li><span class="matrix-legend-num" aria-hidden="true">' + (i + 1) + '</span>' + escapeHtml(rec.title) +
          '<span class="matrix-legend-meta">Effort: ' + escapeHtml(rec.effort || 'Medium') + ', payback: ' + escapeHtml(rec.impact || 'Medium') + '</span></li>';
        described.push('Recommendation ' + (i + 1) + ', ' + rec.title + ': ' + (rec.effort || 'Medium').toLowerCase() + ' effort, ' + (rec.impact || 'Medium').toLowerCase() + ' payback');
      });

      el.innerHTML =
        '<h3>Effort vs. Payback</h3>' +
        '<p class="matrix-note">Where each recommendation sits. The closer to the top left, the sooner it pays for itself.</p>' +
        '<div class="matrix-wrap">' +
          '<span class="matrix-axis-y" aria-hidden="true">Payback &rarr;</span>' +
          '<div class="matrix-plot" role="img" aria-label="' + escapeHtml('Effort versus payback matrix. ' + described.join('. ') + '.') + '">' +
            '<div class="matrix-quad matrix-quad-tl"><span>Do these first</span></div>' +
            '<div class="matrix-quad matrix-quad-tr"><span>Worth planning</span></div>' +
            '<div class="matrix-quad matrix-quad-bl"><span>Nice to have</span></div>' +
            '<div class="matrix-quad matrix-quad-br"><span>Think twice</span></div>' +
            dots +
          '</div>' +
          '<span class="matrix-axis-x" aria-hidden="true">Effort &rarr;</span>' +
        '</div>' +
        '<ol class="matrix-legend">' + legend + '</ol>';
    }

    /* ── Competitive Landscape Snapshot ──────── */
    /* Built by the analysis from what the user told us about their
       industry, size, and situation. No live market scan, no named
       competitors, no invented statistics. */
    function renderCompetitiveLandscape(cl) {
      var el = document.getElementById('competitiveLandscape');
      if (!el) return;
      if (!cl || !cl.summary) { el.innerHTML = ''; return; }
      var pressures = (cl.pressures || []).map(function(p) {
        return '<li>' + escapeHtml(p) + '</li>';
      }).join('');
      el.innerHTML =
        '<h3>Competitive Landscape</h3>' +
        '<p>' + escapeHtml(cl.summary) + '</p>' +
        (pressures ? '<ul class="comp-pressures">' + pressures + '</ul>' : '') +
        (cl.edge ? '<p class="comp-edge"><strong>Where you can stand out:</strong> ' + escapeHtml(cl.edge) + '</p>' : '') +
        '<p class="synth-note">Based on what you told us about your business and how businesses like yours typically compete. Not a live market scan.</p>';
    }

    /* ── Market Trends Summary ───────────────── */
    /* Industry-specific, qualitative. Clearly labelled as synthesised;
       live economic figures come from the Bank of Canada section below. */
    function renderMarketTrends(trends, industry) {
      var el = document.getElementById('marketTrends');
      if (!el) return;
      trends = (trends || []).filter(function(t) { return t && t.trend; });
      if (!trends.length) { el.innerHTML = ''; return; }
      var cards = trends.map(function(t) {
        return '<div class="trend-card"><h4>' + escapeHtml(t.trend) + '</h4>' +
          (t.note ? '<p>' + escapeHtml(t.note) + '</p>' : '') + '</div>';
      }).join('');
      el.innerHTML =
        '<h3>Market Trends' + (industry ? ': ' + escapeHtml(industry) : '') + '</h3>' +
        cards +
        '<p class="synth-note">General direction of your industry for Canadian small and mid-size businesses, written for your situation. Qualitative, not sourced statistics. Live economic figures appear in the Canadian Economic Context section below.</p>';
    }

    /* ── TIM WOODS Waste Scan ─────────────────── */
    /* Lean-manufacturing's eight sources of waste. Only the ones the
       analysis ties to the owner's own answers are shown; not a full
       eight-item checklist every time. */
    function renderTimWoods(items) {
      var el = document.getElementById('timWoods');
      if (!el) return;
      items = (items || []).filter(function(w) { return w && w.waste; });
      if (!items.length) { el.innerHTML = ''; return; }
      var cards = items.map(function(w) {
        return '<div class="waste-card"><h4>' + escapeHtml(w.waste) + '</h4>' +
          (w.note ? '<p>' + escapeHtml(w.note) + '</p>' : '') + '</div>';
      }).join('');
      el.innerHTML =
        '<h3>Where Time and Money Leak (TIM WOODS)</h3>' +
        '<p class="matrix-note">Eight classic sources of operational waste from lean manufacturing, adapted for a service business. Only the ones showing up in your answers are listed.</p>' +
        '<div class="waste-grid">' + cards + '</div>' +
        '<p class="synth-note">TIM WOODS: Transport, Inventory, Motion, Waiting, Overproduction, Overprocessing, Defects, Skills. Based on what you told us, not an on-site audit.</p>';
    }

    /* ── Fishbone (Ishikawa) Root-Cause Breakdown ── */
    /* Traces the owner's single biggest problem back to one likely
       cause in each of People, Process, Tools & Systems, Environment. */
    function renderFishbone(fb) {
      var el = document.getElementById('fishbone');
      if (!el) return;
      if (!fb || !fb.problem) { el.innerHTML = ''; return; }
      var causes = (fb.causes || []).filter(function(c) { return c && c.cause; });
      var cards = causes.map(function(c) {
        return '<div class="fishbone-branch"><h4>' + escapeHtml(c.category || 'Cause') + '</h4>' +
          '<p>' + escapeHtml(c.cause) + '</p></div>';
      }).join('');
      el.innerHTML =
        '<h3>Root Cause: Fishbone Analysis</h3>' +
        '<p class="fishbone-problem"><strong>The problem:</strong> ' + escapeHtml(fb.problem) + '</p>' +
        (cards ? '<div class="fishbone-grid">' + cards + '</div>' : '') +
        '<p class="synth-note">An Ishikawa (fishbone) diagram traces one problem back to its likely causes across people, process, tools, and environment. Based on your answers, not an on-site audit.</p>';
    }

    /* ── Save Report — email gate then download ── */
    var CLARITY_WORKER_URL = 'https://clarity-email-gate.twobirdsinnovation.workers.dev';
    var emailCapturedKey   = 'clarity_email_captured';

    function buildReportText() {
      var d = lastReportData;
      var date = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
      return [
        'CLARITY BUSINESS OPERATIONS REPORT',
        'Two Birds Innovation — twobirds-kramerica.github.io/clarity/',
        '================================================',
        '',
        'Business: ' + (lastBusinessName || 'Not specified'),
        'Date: ' + date,
        'Readiness Score: ' + (d.readiness_score ? d.readiness_score + ' / 10' : 'N/A'),
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
        'PRIORITY RECOMMENDATIONS',
        '------------------------',
        (d.recommendations || []).map(function(r, i) {
          return (i + 1) + '. ' + (r.title || '') + ' (Effort: ' + (r.effort || 'N/A') + ' | Impact: ' + (r.impact || 'N/A') + ')\n   ' + (r.description || '');
        }).join('\n\n'),
        '',
        'QUICK WINS (next 30 days)',
        '-------------------------',
        (d.quick_wins || []).map(function(q) { return '  * ' + q; }).join('\n'),
        '',
        'SUGGESTED NEXT STEP',
        '-------------------',
        d.next_step || '',
        ''
      ].concat(d.competitive_landscape && d.competitive_landscape.summary ? [
        'COMPETITIVE LANDSCAPE',
        '---------------------',
        d.competitive_landscape.summary,
        (d.competitive_landscape.pressures || []).map(function(p) { return '  * ' + p; }).join('\n'),
        d.competitive_landscape.edge ? 'Where you can stand out: ' + d.competitive_landscape.edge : '',
        ''
      ] : []).concat((d.market_trends || []).length ? [
        'MARKET TRENDS',
        '-------------',
        (d.market_trends || []).map(function(t) { return '  * ' + (t.trend || '') + (t.note ? ' - ' + t.note : ''); }).join('\n'),
        ''
      ] : []).concat((d.tim_woods || []).length ? [
        'TIM WOODS — WHERE TIME AND MONEY LEAK',
        '--------------------------------------',
        (d.tim_woods || []).map(function(w) { return '  * ' + (w.waste || '') + (w.note ? ' - ' + w.note : ''); }).join('\n'),
        ''
      ] : []).concat(d.fishbone && d.fishbone.problem ? [
        'ROOT CAUSE: FISHBONE ANALYSIS',
        '------------------------------',
        'The problem: ' + d.fishbone.problem,
        (d.fishbone.causes || []).map(function(c) { return '  * ' + (c.category || '') + ': ' + (c.cause || ''); }).join('\n'),
        ''
      ] : []).concat([
        '================================================',
        'Generated by Clarity — a free Two Birds Innovation tool.',
        'Questions? Book a free 30-minute discovery call: cal.com/twobirds-4n5ajg/30min',
        ''
      ]).join('\n');
    }

    function doReportDownload() {
      if (!lastReportData) return;
      var blob = new Blob([buildReportText()], { type: 'text/plain;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var filename = 'clarity-report-' + (lastBusinessName || 'business').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() + '-' + new Date().toISOString().slice(0, 10) + '.txt';
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      saveReportBtn.textContent = '✓ Downloaded';
      setTimeout(function() { saveReportBtn.textContent = 'Save Report'; }, 3000);
    }

    function removeEmailGate() {
      var existing = document.getElementById('saveEmailGate');
      if (existing) existing.remove();
    }

    saveReportBtn.addEventListener('click', function() {
      if (!lastReportData) return;

      /* Skip gate if email already captured */
      if (localStorage.getItem(emailCapturedKey)) {
        doReportDownload();
        return;
      }

      removeEmailGate();

      var safeName = (lastBusinessName || 'your business').replace(/[<>]/g, '');
      var gate = document.createElement('div');
      gate.id = 'saveEmailGate';
      gate.style.cssText = 'margin-top:0.75rem;padding:1rem;background:var(--cream);border:1px solid var(--border);border-radius:var(--radius);text-align:left;';
      gate.innerHTML =
        '<p style="font-size:0.9rem;color:var(--charcoal);margin-bottom:0.6rem;">Get a follow-up with AI tips for <strong>' + safeName + '</strong>? Optional &mdash; skip below to download now.</p>' +
        '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.5rem;">' +
        '<input type="email" id="gateEmail" placeholder="your@email.com" autocomplete="email"' +
        ' style="flex:1;min-width:180px;padding:0.55rem 0.75rem;border:1px solid var(--border);border-radius:6px;font-size:0.9rem;font-family:inherit;color:var(--text);background:var(--white);">' +
        '<button type="button" id="gateSubmitBtn" class="btn btn-accent" style="white-space:nowrap;padding:0.55rem 1rem;">Send &amp; Download</button>' +
        '</div>' +
        '<button type="button" id="gateSkipBtn" style="background:none;border:none;color:var(--text-light);font-size:0.82rem;cursor:pointer;text-decoration:underline;padding:0;">No thanks, just download</button>';

      var actionsDiv = saveReportBtn.closest('.results-actions') || saveReportBtn.parentElement;
      actionsDiv.insertAdjacentElement('afterend', gate);
      document.getElementById('gateEmail').focus();

      document.getElementById('gateSubmitBtn').addEventListener('click', function() {
        var email = (document.getElementById('gateEmail').value || '').trim();
        if (!email || !email.includes('@')) { document.getElementById('gateEmail').focus(); return; }
        var btn = document.getElementById('gateSubmitBtn');
        btn.disabled = true; btn.textContent = 'Saving…';
        fetch(CLARITY_WORKER_URL + '/capture-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, source: 'pdf-download' })
        })
        .then(function() {
          localStorage.setItem(emailCapturedKey, '1');
          removeEmailGate();
          doReportDownload();
        })
        .catch(function() {
          /* Network failure — never block the download */
          removeEmailGate();
          doReportDownload();
        });
      });

      document.getElementById('gateSkipBtn').addEventListener('click', function() {
        removeEmailGate();
        doReportDownload();
      });
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
      var readinessLine = document.getElementById('readinessLine');
      if (readinessLine) readinessLine.style.display = 'none';
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
      checkboxes.forEach(function(cb) {
        cb.disabled = false;
        cb.parentElement.classList.remove('disabled-check');
      });
      resetSteps();
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
    /* Active key: shared Two Birds Web3Forms inbox (same key DCC uses in
       feedback-github.js). Web3Forms access keys are public-by-design — they
       identify the destination inbox, contain no secret, and are safe in
       client-side static code. Replace with a Clarity-dedicated key later if
       lead volume warrants its own inbox. Wired 2026-06-06 (S-CLARITY-EMAIL-CAPTURE). */
    var WEB3FORMS_KEY    = '5e0ecf7e-fb33-4541-be2e-1938bce868f4';
    var FORMSPREE_ENDPOINT = ''; // optional override; leave empty to use Web3Forms/mailto

    var leadCaptureForm = document.getElementById('leadCaptureForm');
    var leadSubmitBtn   = document.getElementById('leadSubmitBtn');
    var leadConfirm     = document.getElementById('leadCaptureConfirm');

    function showLeadConfirm() {
      leadCaptureForm.style.display = 'none';
      if (leadConfirm) leadConfirm.style.display = '';
    }

    /* Fallback when the form backend is unreachable: do NOT claim success and
       do NOT publish an email address on the funnel (positioning brief 2026-07-10,
       section 6). Offer the booking link as the honest manual path instead. */
    function leadMailtoFallback(email, business, score, topRec) {
      if (leadSubmitBtn) { leadSubmitBtn.disabled = false; leadSubmitBtn.textContent = 'Email me a follow-up'; }
      if (leadConfirm) {
        leadConfirm.style.display = '';
        leadConfirm.innerHTML = 'Automatic send didn’t go through. <a href="https://cal.com/twobirds-4n5ajg/30min" target="_blank" rel="noopener" style="color:#4A5640;font-weight:700;">Book a free 30-minute discovery call instead</a> and bring your report along.';
      }
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
          .then(function(r) {
            if (r && r.ok) { showLeadConfirm(); }
            else { leadMailtoFallback(email, lastBusinessName, score, topRec); }
          })
          .catch(function() {
            /* network failure — never strand the lead; hand off to mailto */
            leadMailtoFallback(email, lastBusinessName, score, topRec);
          });
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
        leadMailtoFallback(email, lastBusinessName, score, topRec);
      });
    }

    /* ── Demo Mode ─────────────────────────── */
    var SAMPLE_DATA = {
      readiness_score: 3,
      pipeda_note: 'Acme Mechanical collects customer contact information (name, address, phone) for job scheduling. Under PIPEDA, you must obtain consent before using customer data with third-party AI tools like ChatGPT — avoid pasting customer names or addresses into AI prompts. Consider a simple privacy notice on your booking form stating that contact data is used for service coordination only.',
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
      next_step: "This week: open a free Claude account (claude.ai) and ask it to write a follow-up email template for a quoted plumbing job. Use your own voice — paste in a rough draft and ask it to polish. Send that template to your next 5 leads and see if your conversion rate changes.",
      competitive_landscape: {
        summary: "Acme competes in a crowded regional trades market where most shops win work on relationships and response time, not price alone. At ten years in with a lean crew, the pressure is less about finding leads and more about quoting fast enough to win the work already coming in.",
        pressures: [
          "Larger regional contractors can quote and schedule faster, which wins the time-sensitive jobs.",
          "Skilled-labour shortages push wages up and make peak-season capacity the limiting factor.",
          "Customers increasingly expect same-day quotes and easy booking, even from small shops."
        ],
        edge: "A decade of local trust and referral work is the edge: faster follow-up on quotes would convert demand Acme already has, without spending a dollar on advertising."
      },
      market_trends: [
        {
          trend: "Speed of quoting decides more jobs",
          note: "Customers gather several quotes in a day. Shops that respond first with a clear written estimate win a growing share of the work."
        },
        {
          trend: "Software is now standard on the office side",
          note: "Scheduling, invoicing, and job-tracking tools are common in shops of every size, and customers notice when the paperwork side runs smoothly."
        },
        {
          trend: "Labour stays tight",
          note: "Hiring licensed trades remains hard across Ontario, so the shops that grow are the ones getting more billable hours out of the crew they already have."
        }
      ],
      tim_woods: [
        {
          waste: "Waiting",
          note: "Quotes sit unsent for days after a site visit, so leads cool off before a number ever reaches them."
        },
        {
          waste: "Motion",
          note: "Job details get re-typed from a paper intake sheet into the invoicing tool, then again into the scheduling board."
        },
        {
          waste: "Defects",
          note: "Missed follow-ups on quoted jobs mean rework chasing customers who have already gone with someone else."
        }
      ],
      fishbone: {
        problem: "Quoted jobs are won or lost on how fast Acme follows up, and that follow-up is inconsistent.",
        causes: [
          { category: "People", cause: "Follow-up falls to whoever has a free minute, so it depends on who is least busy that week." },
          { category: "Process", cause: "There is no set day or trigger for a follow-up call or message after a quote goes out." },
          { category: "Tools & Systems", cause: "Quotes and job status live in separate places, so nothing flags an unanswered quote automatically." },
          { category: "Environment", cause: "Peak season overlaps with the busiest quoting period, leaving the least time free exactly when follow-up matters most." }
        ]
      }
    };

    var showSampleBtn = document.getElementById('showSampleBtn');
    var demoBanner = document.getElementById('demoBanner');
    var dismissDemo = document.getElementById('dismissDemo');

    function runDemoMode() {
      try {
        var stats = JSON.parse(localStorage.getItem('clarity_stats') || '{}');
        stats.demo_clicks = (stats.demo_clicks || 0) + 1;
        localStorage.setItem('clarity_stats', JSON.stringify(stats));
      } catch(e) {}
      setupScreen.classList.remove('active');
      displayResults('Acme Mechanical (Sample Business)', 'Trades', SAMPLE_DATA);
      /* displayResults() calls hideAll(), which hides the banner — show it after. */
      if (demoBanner) demoBanner.style.display = '';
    }

    if (showSampleBtn) {
      showSampleBtn.addEventListener('click', function(e) { e.preventDefault(); runDemoMode(); });
    }

    var showSampleBtn2 = document.getElementById('showSampleBtn2');
    if (showSampleBtn2) {
      showSampleBtn2.addEventListener('click', function(e) { e.preventDefault(); runDemoMode(); });
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
          if (setupProvider) setupProvider.focus();
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    /* ── Lazy step injection ──────────────── */
    var stepsInjected = false;

    function injectRemainingSteps() {
      if (stepsInjected) return;
      stepsInjected = true;
      var industryOptions = [
        { label: 'Automotive repair and service', benchmark: 'Automotive' },
        { label: 'Construction and skilled trades (plumbing, HVAC, electrical, general contracting)', benchmark: 'Trades' },
        { label: 'Health and wellness practice (massage, physio, chiropractic, osteopathy, clinic)', benchmark: 'Healthcare' },
        { label: 'Manufacturing and fabrication', benchmark: 'Manufacturing' },
        { label: 'Professional services (accounting, legal, consulting, design)', benchmark: 'Professional Services' },
        { label: 'Restaurant, cafe, or food service', benchmark: 'Food & Hospitality' },
        { label: 'Retail (in-store, online, or both)', benchmark: 'Retail' },
        { label: 'Transportation, shipping, and warehousing', benchmark: 'Transportation & Logistics' },
        { label: 'Property, landscaping, and cleaning services', benchmark: 'Trades' },
        { label: 'Personal services (salon, fitness, training, childcare)', benchmark: 'Personal Services' },
        { label: 'Agriculture and food production', benchmark: 'Agriculture' }
      ];
      var industryCheckboxes = industryOptions.map(function(opt) {
        return '<label><input type="checkbox" name="industries" value="' + opt.label.replace(/"/g, '&quot;') + '" data-benchmark="' + opt.benchmark + '"> ' + opt.label + '</label>';
      }).join('');

      var html =
        '<div class="question-card" id="step2">' +
        '<h2 class="question-heading">What does your business do?</h2>' +
        '<fieldset class="form-group" id="industryGroup" aria-describedby="industryHint">' +
        '<legend style="display:none">Business areas</legend>' +
        '<p class="checkbox-hint" id="industryHint">Select every area that applies. Most businesses span more than one.</p>' +
        '<div class="checkbox-group">' + industryCheckboxes + '</div>' +
        '<div style="margin-top:0.75rem;">' +
        '<label for="industryOther" style="font-weight:600;font-size:0.9rem;">Something else</label>' +
        '<input type="text" id="industryOther" placeholder="Describe it in a few words (optional)">' +
        '</div></fieldset>' +
        '<div class="form-group" id="primaryIndustryGroup" style="display:none;">' +
        '<label for="primaryIndustry">Which of these brings in the most revenue?</label>' +
        '<span class="hint">We&#x27;ll benchmark you against that one.</span>' +
        '<select id="primaryIndustry"><option value="">Select one</option></select>' +
        '</div>' +
        '<div class="step-nav has-back">' +
        '<button type="button" class="btn-ghost back-btn" data-back="1">&larr; Back</button>' +
        '<button type="button" class="btn btn-primary next-btn" data-next="3">Continue &rarr;</button>' +
        '</div></div>' +

        '<div class="question-card" id="step3">' +
        '<h2 class="question-heading">How big is the operation?</h2>' +
        '<div class="form-row">' +
        '<div class="form-group"><label for="teamSize">People in the business, including you</label>' +
        '<select id="teamSize" required>' +
        '<option value="">Select one</option>' +
        '<option value="Just me">Just me</option>' +
        '<option value="2 to 4 people">2 to 4</option>' +
        '<option value="5 to 19 people">5 to 19</option>' +
        '<option value="20 to 99 people">20 to 99</option>' +
        '<option value="100 or more people">100 or more</option>' +
        '</select></div>' +
        '<div class="form-group"><label for="yearsInBusiness">Years in business</label>' +
        '<select id="yearsInBusiness" required>' +
        '<option value="">Select one</option>' +
        '<option value="Under 1 year">Under 1</option>' +
        '<option value="1-3 years">1 to 3</option>' +
        '<option value="3-10 years">3 to 10</option>' +
        '<option value="10+ years">10 or more</option>' +
        '</select></div></div>' +
        '<div class="step-nav has-back">' +
        '<button type="button" class="btn-ghost back-btn" data-back="2">&larr; Back</button>' +
        '<button type="button" class="btn btn-primary next-btn" data-next="4">Continue &rarr;</button>' +
        '</div></div>' +

        '<div class="question-card" id="step4">' +
        '<h2 class="question-heading">Where does the day go?</h2>' +
        '<fieldset class="form-group" id="challengeGroup" aria-describedby="challengeHint">' +
        '<legend style="display:none">Biggest time sinks</legend>' +
        '<p class="checkbox-hint" id="challengeHint">Which of these eat the most time in a typical week? Select up to 3.</p>' +
        '<div class="checkbox-group">' +
        '<label><input type="checkbox" name="challenges" value="Answering and returning calls"> Answering and returning calls</label>' +
        '<label><input type="checkbox" name="challenges" value="Scheduling and reminders"> Scheduling and reminders</label>' +
        '<label><input type="checkbox" name="challenges" value="Quoting and invoicing"> Quoting and invoicing</label>' +
        '<label><input type="checkbox" name="challenges" value="Paperwork and intake forms"> Paperwork and intake forms</label>' +
        '<label><input type="checkbox" name="challenges" value="Chasing payments"> Chasing payments</label>' +
        '<label><input type="checkbox" name="challenges" value="Tracking jobs or orders"> Tracking jobs or orders</label>' +
        '<label><input type="checkbox" name="challenges" value="Staff coordination"> Staff coordination</label>' +
        '<label><input type="checkbox" name="challenges" value="Something else"> Something else</label>' +
        '</div></fieldset>' +
        '<div class="step-nav has-back">' +
        '<button type="button" class="btn-ghost back-btn" data-back="3">&larr; Back</button>' +
        '<button type="button" class="btn btn-primary next-btn" data-next="5">Continue &rarr;</button>' +
        '</div></div>' +

        '<div class="question-card" id="step5">' +
        '<h2 class="question-heading">How do your systems talk to each other?</h2>' +
        '<div class="form-group">' +
        '<label for="systemsLevel">Where things stand today</label>' +
        '<select id="systemsLevel" required>' +
        '<option value="">Select one</option>' +
        '<option value="Mostly on paper">Mostly on paper</option>' +
        '<option value="Digital tools, but they don&#x27;t connect; we re-enter things by hand">Digital tools, but they don&#x27;t connect; we re-enter things by hand</option>' +
        '<option value="Partly connected">Partly connected</option>' +
        '<option value="Well connected">Well connected</option>' +
        '</select></div>' +
        '<div class="step-nav has-back">' +
        '<button type="button" class="btn-ghost back-btn" data-back="4">&larr; Back</button>' +
        '<button type="button" class="btn btn-primary next-btn" data-next="6">Continue &rarr;</button>' +
        '</div></div>' +

        '<div class="question-card" id="step6">' +
        '<h2 class="question-heading">If one thing ran smoother a year from now, what should it be?</h2>' +
        '<div class="form-group">' +
        '<label for="ownerGoal">Your answer</label>' +
        '<input type="text" id="ownerGoal" placeholder="Plain words are fine. &#x27;Stop losing after-hours calls&#x27; is a perfect answer.">' +
        '</div>' +
        '<div class="form-group">' +
        '<label for="personalData">Do you collect customer personal information?</label>' +
        '<select id="personalData">' +
        '<option value="">Select one (optional)</option>' +
        '<option value="Yes: we store names, emails, and purchase history">Yes: we store customer data (names, emails, purchase history)</option>' +
        '<option value="Yes: we handle sensitive data (health, financial, or government ID)">Yes: we handle sensitive data (health, financial, or government ID)</option>' +
        '<option value="Minimal: we collect only what&#x27;s needed for a transaction">Minimal: we only collect what&#x27;s needed for a transaction</option>' +
        '<option value="No: we do not collect or store personal information">No: we do not collect or store personal information</option>' +
        '</select>' +
        '<p class="field-hint">Helps us flag Canadian privacy (PIPEDA) considerations in your report.</p>' +
        '</div>' +
        '<div class="step-nav has-back">' +
        '<button type="button" class="btn-ghost back-btn" data-back="5">&larr; Back</button>' +
        '<button type="submit" class="btn btn-primary" id="submitBtn">Generate my report &rarr;</button>' +
        '</div></div>';

      form.insertAdjacentHTML('beforeend', html);
      checkboxes = document.querySelectorAll('input[name="challenges"]');
      checkboxes.forEach(function(cb) {
        cb.addEventListener('change', enforceMaxChecked);
      });
      document.querySelectorAll('input[name="industries"]').forEach(function(cb) {
        cb.addEventListener('change', refreshPrimaryIndustry);
      });
      var otherInput = document.getElementById('industryOther');
      if (otherInput) otherInput.addEventListener('input', refreshPrimaryIndustry);
      submitBtn = document.getElementById('submitBtn');
    }

    /* ── Industry multi-select helpers ─────── */
    function getSelectedIndustries() {
      var selected = [];
      document.querySelectorAll('input[name="industries"]:checked').forEach(function(cb) {
        selected.push({ label: cb.value, benchmark: cb.getAttribute('data-benchmark') || 'Other' });
      });
      var otherInput = document.getElementById('industryOther');
      var otherVal = otherInput ? otherInput.value.trim() : '';
      if (otherVal) selected.push({ label: otherVal, benchmark: 'Other' });
      return selected;
    }

    function refreshPrimaryIndustry() {
      var group = document.getElementById('primaryIndustryGroup');
      var select = document.getElementById('primaryIndustry');
      if (!group || !select) return;
      var selected = getSelectedIndustries();
      if (selected.length < 2) {
        group.style.display = 'none';
        select.innerHTML = '<option value="">Select one</option>';
        return;
      }
      var previous = select.value;
      select.innerHTML = '<option value="">Select one</option>' + selected.map(function(s) {
        return '<option value="' + s.label.replace(/"/g, '&quot;') + '">' + s.label + '</option>';
      }).join('');
      if (previous && selected.some(function(s) { return s.label === previous; })) {
        select.value = previous;
      }
      group.style.display = '';
    }

    function getPrimaryIndustry() {
      var selected = getSelectedIndustries();
      if (selected.length === 0) return null;
      if (selected.length === 1) return selected[0];
      var select = document.getElementById('primaryIndustry');
      var chosen = select ? select.value : '';
      var match = null;
      selected.forEach(function(s) { if (s.label === chosen) match = s; });
      return match;
    }

    /* ── Boot ──────────────────────────────── */
    init();

    if ('requestIdleCallback' in window) {
      requestIdleCallback(injectRemainingSteps, { timeout: 1500 });
    } else {
      setTimeout(injectRemainingSteps, 200);
    }

    /* Debug helper: clarityStats() in devtools shows funnel data. */
    window.clarityStats = function() {
      try { return JSON.parse(localStorage.getItem('clarity_stats') || '{}'); }
      catch(e) { return {}; }
    };

  })();
