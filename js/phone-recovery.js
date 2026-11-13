(() => {
  const form = document.querySelector('[data-phone-recovery]');
  if (!form) return;
  const submitButtons = form.querySelectorAll('[data-action]');

  form.addEventListener('submit', async (event) => {
    const button = event.submitter || document.activeElement;
    const action = button?.dataset.action;
    if (!action) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submitAction = action === 'phone-otp-request' ? 'phone-otp-request' :
      action === 'phone-otp-verify' ? 'phone-otp-verify' : 'phone-password-update';
    form.dataset.authForm = submitAction;
    const syntheticSubmit = new Event('submit', { bubbles: true, cancelable: true });
    Object.defineProperty(syntheticSubmit, 'target', { value: form });
    // Delegate to the shared handler so phone recovery uses the same Supabase client and validation.
    document.dispatchEvent(syntheticSubmit);
  });

  // The shared auth submit handler reads the action from the form. Keep the action corresponding
  // to the clicked step, while letting native constraint validation run on only visible fields.
  submitButtons.forEach((button) => {
    button.addEventListener('click', () => {
      form.dataset.authForm = button.dataset.action;
      if (button.dataset.action === 'phone-password-update') form.dataset.authForm = 'phone-password-update';
    });
  });
})();
