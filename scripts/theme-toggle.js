(function () {
  function applyTheme(theme) {
    var t = String(theme || 'dark').toLowerCase() === 'light' ? 'light' : 'dark';
    var root = document.documentElement;
    var body = document.body;
    if (!root || !body) return;
    root.classList.toggle('theme-light', t === 'light');
    body.classList.toggle('theme-light', t === 'light');
    // Shell/page background is token-driven in app CSS; avoid hardcoded overrides here.
    var btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = (t === 'light') ? '☀️' : '🌙';
    try { localStorage.setItem('np-theme', t); } catch (e) {}
  }

  function init() {
    var saved = 'dark';
    try { saved = localStorage.getItem('np-theme') || 'dark'; } catch (e) {}
    applyTheme(saved);
    var btn = document.getElementById('themeToggle');
    if (btn) {
      // In app shell, theme toggle behavior is handled by app.html paired-preset logic.
      var isShell = !!document.getElementById('appFrame');
      if (!isShell) {
        btn.addEventListener('click', function () {
          var isLight = document.body && document.body.classList.contains('theme-light');
          applyTheme(isLight ? 'dark' : 'light');
        });
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
