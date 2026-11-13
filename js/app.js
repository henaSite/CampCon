document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const savedTheme = localStorage.getItem('campus-connect-theme') || 'light';
  const themeButtons = document.querySelectorAll('[data-theme-option]');

  applyTheme(savedTheme);

  themeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextTheme = button.dataset.themeOption;
      applyTheme(nextTheme);
      localStorage.setItem('campus-connect-theme', nextTheme);
    });
  });

  function applyTheme(theme) {
    body.setAttribute('data-theme', theme);
    themeButtons.forEach((button) => {
      const active = button.dataset.themeOption === theme;
      button.setAttribute('aria-pressed', String(active));
      button.style.borderColor = active ? 'var(--primary)' : 'var(--border)';
      button.style.boxShadow = active ? '0 0 0 4px rgba(37, 99, 235, 0.08)' : 'none';
    });
  }

  const forms = document.querySelectorAll('form[data-validate]');
  forms.forEach((form) => {
    form.addEventListener('submit', (event) => {
      const status = form.querySelector('.status-message');
      if (!status) return;

      const requiredInputs = form.querySelectorAll('input[required], select[required], textarea[required]');
      let valid = true;

      requiredInputs.forEach((input) => {
        if (!input.value.trim()) {
          valid = false;
        }
      });

      if (!valid) {
        event.preventDefault();
        status.className = 'status-message show error';
        status.textContent = 'Please complete all required fields before continuing.';
        return;
      }

      event.preventDefault();
      status.className = 'status-message show success';
      status.textContent = 'Your details were validated. Connect your Supabase project to activate the live authentication flow.';
    });
  });
});
