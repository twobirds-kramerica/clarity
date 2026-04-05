/**
 * QA Audit Panel — Two Birds Innovation
 * Activate by adding ?qa=true to any page URL.
 * Loads axe-core (MIT, open source) and runs accessibility audit.
 * Also runs layout checks for mobile breakpoints.
 * Never shows in production — only when ?qa=true is present.
 */
(function() {
  if (!new URLSearchParams(window.location.search).has('qa')) return;

  // Load axe-core from CDN
  var s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.7.0/axe.min.js';
  s.onload = function() {
    axe.run().then(function(results) {
      // Layout checks
      var layoutIssues = [];
      if (document.documentElement.scrollWidth > window.innerWidth)
        layoutIssues.push('OVERFLOW: page wider than viewport by ' + (document.documentElement.scrollWidth - window.innerWidth) + 'px');

      document.querySelectorAll('a, button, [role="button"]').forEach(function(el) {
        var rect = el.getBoundingClientRect();
        if (rect.height > 0 && rect.height < 44 && el.offsetParent !== null)
          layoutIssues.push('SMALL TAP (' + Math.round(rect.height) + 'px): ' + el.tagName + ' — "' + (el.textContent || '').trim().substring(0, 30) + '"');
      });

      // Build panel
      var panel = document.createElement('div');
      panel.id = 'qa-panel';
      panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:50vh;overflow-y:auto;background:#1a1a2e;color:#e6edf3;font-family:-apple-system,monospace;font-size:13px;padding:16px;z-index:99999;border-top:3px solid #e63946;';

      var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
      html += '<h3 style="margin:0;color:#ff9f1c;">QA Audit — ' + window.innerWidth + 'px viewport</h3>';
      html += '<button onclick="document.getElementById(\'qa-panel\').remove()" style="padding:6px 16px;background:#2ec4b6;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Dismiss</button>';
      html += '</div>';

      // Accessibility results
      html += '<div style="margin-bottom:12px;">';
      html += '<strong style="color:#e63946;">' + results.violations.length + ' accessibility violations</strong> · ';
      html += '<strong style="color:#2ec4b6;">' + results.passes.length + ' passes</strong> · ';
      html += '<strong style="color:#ff9f1c;">' + results.incomplete.length + ' needs review</strong>';
      html += '</div>';

      if (results.violations.length > 0) {
        html += '<div style="margin-bottom:12px;">';
        results.violations.forEach(function(v) {
          html += '<div style="margin:4px 0;padding:6px 8px;background:rgba(230,57,70,0.15);border-left:3px solid #e63946;border-radius:2px;">';
          html += '<strong>' + v.impact.toUpperCase() + ':</strong> ' + v.help + ' <span style="color:#8b949e;">(' + v.nodes.length + ' instances)</span>';
          html += '</div>';
        });
        html += '</div>';
      }

      // Layout results
      if (layoutIssues.length > 0) {
        html += '<div style="margin-bottom:12px;">';
        html += '<strong style="color:#ff9f1c;">' + layoutIssues.length + ' layout issues:</strong>';
        layoutIssues.forEach(function(issue) {
          html += '<div style="margin:2px 0;padding:4px 8px;background:rgba(255,159,28,0.15);border-left:3px solid #ff9f1c;border-radius:2px;">' + issue + '</div>';
        });
        html += '</div>';
      } else {
        html += '<div style="color:#2ec4b6;margin-bottom:8px;">Layout check passed at ' + window.innerWidth + 'px</div>';
      }

      // Bilingual check (DCC specific)
      var enCount = document.querySelectorAll('[data-en]').length;
      var frCount = document.querySelectorAll('[data-fr]').length;
      if (enCount > 0) {
        var match = enCount === frCount;
        html += '<div style="color:' + (match ? '#2ec4b6' : '#e63946') + ';">Bilingual: ' + enCount + ' data-en, ' + frCount + ' data-fr' + (match ? ' ✓' : ' ✗ MISMATCH') + '</div>';
      }

      panel.innerHTML = html;
      document.body.appendChild(panel);
    });
  };
  document.head.appendChild(s);
})();
