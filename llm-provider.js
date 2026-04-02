/**
 * LLM Portability Layer — Two Birds Innovation
 * Drop into any static HTML project. Switch providers by changing one line.
 *
 * Usage:
 *   var result = await llmChat(prompt, { system: '...', maxTokens: 1500 });
 *
 * Configuration:
 *   llmSetProvider('anthropic', apiKey);        // default
 *   llmSetProvider('openai', apiKey);           // GPT-4o
 *   llmSetProvider('ollama');                   // local, no key
 */

var LLM_PROVIDERS = {
  anthropic: {
    name: 'Claude (Anthropic)',
    url: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-haiku-4-5-20251001',
    buildRequest: function(apiKey, model, prompt, system, maxTokens) {
      var body = { model: model, max_tokens: maxTokens || 2048, messages: [{ role: 'user', content: prompt }] };
      if (system) body.system = system;
      return {
        url: this.url,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(body)
      };
    },
    parseResponse: function(data) { return data.content[0].text; }
  },

  openai: {
    name: 'GPT-4o (OpenAI)',
    url: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o',
    buildRequest: function(apiKey, model, prompt, system, maxTokens) {
      var messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: prompt });
      return {
        url: this.url,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({ model: model, max_tokens: maxTokens || 2048, messages: messages })
      };
    },
    parseResponse: function(data) { return data.choices[0].message.content; }
  },

  gemini: {
    name: 'Gemini (Google)',
    defaultModel: 'gemini-2.0-flash',
    buildRequest: function(apiKey, model, prompt, system, maxTokens) {
      var contents = [{ parts: [{ text: (system ? system + '\n\n' : '') + prompt }] }];
      return {
        url: 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: contents, generationConfig: { maxOutputTokens: maxTokens || 2048 } })
      };
    },
    parseResponse: function(data) { return data.candidates[0].content.parts[0].text; }
  },

  ollama: {
    name: 'Ollama (Local)',
    url: 'http://localhost:11434/api/chat',
    defaultModel: 'llama3',
    buildRequest: function(apiKey, model, prompt, system, maxTokens) {
      var messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: prompt });
      return {
        url: this.url,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model, messages: messages, stream: false })
      };
    },
    parseResponse: function(data) { return data.message.content; }
  }
};

/**
 * Send a chat message to the configured LLM provider.
 * @param {string} prompt - User prompt
 * @param {object} opts - { system, maxTokens, provider, model, apiKey }
 * @returns {Promise<string>} - Response text
 */
async function llmChat(prompt, opts) {
  opts = opts || {};
  var providerKey = opts.provider || localStorage.getItem('llm_provider') || 'anthropic';
  var provider = LLM_PROVIDERS[providerKey];
  if (!provider) throw new Error('Unknown LLM provider: ' + providerKey);

  var apiKey = opts.apiKey || localStorage.getItem('llm_api_key') || localStorage.getItem('cc_api_key') || '';
  var model = opts.model || localStorage.getItem('llm_model') || provider.defaultModel;
  var req = provider.buildRequest(apiKey, model, prompt, opts.system, opts.maxTokens);

  var response = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body });

  if (!response.ok) {
    var errData;
    try { errData = await response.json(); } catch(e) { errData = {}; }
    var errMsg = (errData.error && errData.error.message) ? errData.error.message : 'API request failed (HTTP ' + response.status + ')';
    throw new Error(errMsg);
  }

  var data = await response.json();
  return provider.parseResponse(data);
}

/** Set the active LLM provider. */
function llmSetProvider(providerKey, apiKey, model) {
  localStorage.setItem('llm_provider', providerKey);
  if (apiKey) localStorage.setItem('llm_api_key', apiKey);
  if (model) localStorage.setItem('llm_model', model);
}

/** Get current provider info. */
function llmGetProvider() {
  var key = localStorage.getItem('llm_provider') || 'anthropic';
  return { key: key, name: (LLM_PROVIDERS[key] || {}).name || key };
}
