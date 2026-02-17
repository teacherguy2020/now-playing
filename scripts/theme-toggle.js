(function () {
  function applyTheme(theme) {
    var t = String(theme || 'dark').toLowerCase() === 'light' ? 'light' : 'dark';
    var root = document.documentElement;
    var body = document.body;
    if (!root || !body) return;
    root.classList.toggle('theme-light', t === 'light');
    body.classList.toggle('theme-light', t === 'light');
    root.style.background = (t === 'light') ? '#8e79b6' : '#0c1526';
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
      btn.addEventListener('click', function () {
        var isLight = document.body && document.body.classList.contains('theme-light');
        applyTheme(isLight ? 'dark' : 'light');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
