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

      var prompt = buildPrompt(businessName, industry, years, teamSize, challenges, aiUsage, revenueGoal);

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
    function buildPrompt(name, industry, years, teamSize, challenges, aiUsage, revenueGoal) {
      return [
        'You are a senior business consultant specialising in AI transformation for Canadian small and medium businesses.',
        '',
        'A business owner has completed a diagnostic questionnaire. Based on their answers, provide:',
        '',
        '1. A SWOT analysis (Strengths, Weaknesses, Opportunities, Threats) — 3 bullet points per category, specific to their situation.',
        '2. Three numbered priority recommendations — each with a clear title, 2-3 sentence explanation, and an effort rating (Low/Medium/High) and impact rating (Low/Medium/High). Recommendations must be actionable and realistic for their team size and goals.',
        '3. Three quick wins — concrete actions the business can do in the next 30 days. Short, punchy, one sentence each.',
        '4. A single "Suggested Next Step" — one concrete action they could take this week.',
        '',
        'Use Canadian English (centre, organisation, analyse, colour, etc.). Be specific — reference their industry, team size, and challenges. Avoid jargon.',
        '',
        'IMPORTANT: Respond in this exact JSON format with no markdown, no code fences, just raw JSON:',
        '{',
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
        '- Revenue goal (next 12 months): ' + revenueGoal
      ].join('\n');
    }

    /* ── Display Results ───────────────────── */
    function displayResults(name, industry, rawText) {
      hideAll();

      var data;
      try {
        var cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        data = JSON.parse(cleaned);
      } catch (e) {
        showError('The AI response could not be parsed. Please try again.');
        return;
      }

      lastReportData = data;
      lastBusinessName = name;

      // Header
      document.getElementById('resultsTitle').textContent = 'Diagnostic: ' + name;
      document.getElementById('resultsSubtitle').textContent = industry + ' — Generated ' + new Date().toLocaleDateString('en-CA');

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
      document.getElementById('ctaLink').href = 'mailto:aaron.patzalek@gmail.com?subject=' + subject + '&body=' + mailBody;

      resultsEl.classList.add('active');
      resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      /* Shift focus so screen readers reliably announce the results heading. */
      try { resultsEl.focus({ preventScroll: true }); } catch(e) {}
    }

    /* ── Save Report ───────────────────────── */
    saveReportBtn.addEventListener('click', function() {
      if (!lastReportData) return;
      var key = new Date().toISOString().split('T')[0] + '_' + lastBusinessName.replace(/[^a-zA-Z0-9]/g, '_');
      try {
        localStorage.setItem('clarity_report_' + key, JSON.stringify({
          business: lastBusinessName,
          date: new Date().toISOString(),
          data: lastReportData
        }));
        saveReportBtn.textContent = 'Saved!';
        setTimeout(function() { saveReportBtn.textContent = 'Save Report'; }, 2000);
      } catch(e) {
        saveReportBtn.textContent = 'Save failed';
        setTimeout(function() { saveReportBtn.textContent = 'Save Report'; }, 2000);
      }
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

    /* ── Boot ──────────────────────────────── */
    init();

  })();
