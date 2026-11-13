(() => {
  const validThemes = ['light', 'dark', 'ocean', 'forest', 'sunset'];
  const storageKey = 'campus-connect-theme';

  function applyTheme(theme) {
    const selected = validThemes.includes(theme) ? theme : 'light';
    document.body.dataset.theme = selected;
    document.querySelectorAll('[data-theme-option]').forEach((button) => {
      const active = button.dataset.themeOption === selected;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-selected', active);
    });
  }

  try {
    applyTheme(localStorage.getItem(storageKey) || 'light');
  } catch {
    applyTheme('light');
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-theme-option]');
    if (!button) return;
    const theme = button.dataset.themeOption;
    applyTheme(theme);
    try { localStorage.setItem(storageKey, theme); } catch { /* Theme remains active for this page view. */ }
  });
})();
