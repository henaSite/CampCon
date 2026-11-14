(() => {
  const config = window.CAMPUS_CONNECT_CONFIG || {};
  const validThemes = ['light', 'dark', 'ocean', 'forest', 'sunset'];
  const supabaseApi = window.CampusConnectSupabase;
  let authSubscription;

  function getClient() {
    if (!supabaseApi?.getClient) {
      throw new Error('Supabase is not configured. Check that js/config.js and the Supabase JS v2 library loaded.');
    }
    return supabaseApi.getClient();
  }

  function appUrl(path) {
    return supabaseApi?.appUrl ? supabaseApi.appUrl(path) : new URL(path, window.location.href).href;
  }

  function showStatus(form, message, type = 'error') {
    const status = form.querySelector('.status-message');
    if (!status) return;
    status.textContent = message;
    status.className = `status-message show ${type}`;
  }

  function validPassword(password) {
    return password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
  }

  function setBusy(button, busy, label = 'Please wait…') {
    if (!button) return;
    if (busy) {
      button.dataset.originalText ??= button.textContent;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = label;
    } else {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    }
  }

  function normalizePhone(value) {
    return String(value || '').trim().replace(/[\s()-]/g, '');
  }

  function friendlyError(error) {
    const message = String(error?.message || 'Something went wrong. Please try again.');
    if (error?.code === '23505' || /profiles_phone_key|duplicate key.*phone/i.test(message)) {
      return 'That phone number is already associated with an account. Use another number or contact support.';
    }
    if (/database error saving new user/i.test(message)) {
      return 'We could not create your profile. The phone number may already be registered, or the profile migration may not be installed.';
    }
    return message;
  }

  async function handleSubmit(event) {
    const form = event.target;
    const action = form.dataset.authForm;
    if (!action) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim().toLowerCase();
    const password = String(data.get('password') || '');
    const submit = form.querySelector('[type="submit"]');
    if (action === 'login') supabaseApi?.setRememberSession(data.get('remember') === 'on');
    setBusy(submit, true);

    try {
      const client = getClient();
      if (action === 'register') {
        const fullName = String(data.get('fullName') || '').trim();
        const phone = normalizePhone(data.get('phone'));
        const confirmPassword = String(data.get('confirmPassword') || '');
        if (fullName.length < 2 || fullName.length > 100) throw new Error('Enter a name between 2 and 100 characters.');
        if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('Enter a valid phone number in international format, such as +15551234567.');
        if (!validPassword(password)) throw new Error('Use at least 10 characters with an uppercase letter, a lowercase letter, and a number.');
        if (password !== confirmPassword) throw new Error('The passwords do not match.');
        const { error } = await client.auth.signUp({
          email, password,
          options: { data: { full_name: fullName, phone }, emailRedirectTo: appUrl('pages/login.html') },
        });
        if (error) throw error;
        form.reset();
        showStatus(form, 'Your account request was received. Check your email for a verification link before logging in.', 'success');
      } else if (action === 'login') {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showStatus(form, 'Login successful. Redirecting…', 'success');
        window.setTimeout(() => window.location.assign(appUrl('dashboard.html')), 500);
      } else if (action === 'recover') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: appUrl('pages/reset-password.html') });
        if (error) throw error;
        showStatus(form, 'If an account exists for that address, a secure password reset link will arrive shortly. Check your inbox and spam folder.', 'success');
      } else if (action === 'phone-otp-request') {
        const phone = normalizePhone(data.get('phone'));
        if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('Enter a valid phone number in international format, such as +15551234567.');
        const { error } = await client.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
        if (error) throw error;
        form.dataset.otpPhone = phone;
        form.querySelector('[data-phone-step="request"]')?.setAttribute('hidden', '');
        form.querySelector('[data-phone-step="verify"]')?.removeAttribute('hidden');
        showStatus(form, 'If this number belongs to an eligible phone-auth account, an OTP was sent by your configured SMS provider. Enter it to verify ownership.', 'success');
      } else if (action === 'phone-otp-verify') {
        const phone = form.dataset.otpPhone;
        const token = String(data.get('otp') || '').trim();
        if (!phone) throw new Error('Request a verification code first.');
        if (!/^\d{6,8}$/.test(token)) throw new Error('Enter the verification code from your SMS.');
        const { error } = await client.auth.verifyOtp({ phone, token, type: 'sms' });
        if (error) throw error;
        form.querySelector('[data-phone-step="verify"]')?.setAttribute('hidden', '');
        form.querySelector('[data-phone-step="new-password"]')?.removeAttribute('hidden');
        showStatus(form, 'Phone verified. Choose a new password to complete recovery.', 'success');
      } else if (action === 'phone-password-update' || action === 'update-password') {
        const confirmPassword = String(data.get('confirmPassword') || '');
        if (!validPassword(password)) throw new Error('Use at least 10 characters with an uppercase letter, a lowercase letter, and a number.');
        if (password !== confirmPassword) throw new Error('The passwords do not match.');
        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session) throw new Error('This reset session is invalid or has expired. Request a new reset link or OTP.');
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        form.reset();
        showStatus(form, 'Your password has been updated. You can now log in with your new password.', 'success');
      }
    } catch (error) {
      showStatus(form, friendlyError(error));
    } finally {
      setBusy(submit, false);
    }
  }

  function renderSessionControls(session) {
    const navActions = document.querySelector('.nav-actions');
    if (!navActions) return;
    navActions.querySelectorAll('[data-auth-session-control]').forEach((el) => el.remove());
    navActions.querySelectorAll('[data-auth-guest]').forEach((el) => { el.hidden = Boolean(session); });
    if (!session) return;
    const account = document.createElement('span');
    account.className = 'session-label';
    account.dataset.authSessionControl = 'true';
    account.textContent = 'Signed in';
    const logout = document.createElement('button');
    logout.className = 'button button-secondary';
    logout.type = 'button';
    logout.textContent = 'Log out';
    logout.dataset.authSessionControl = 'true';
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      try {
        const { error } = await getClient().auth.signOut();
        if (error) throw error;
        window.location.assign(appUrl('index.html'));
      } catch (error) {
        logout.disabled = false;
        window.alert(friendlyError(error));
      }
    });
    navActions.append(account, logout);
  }

  async function renderAdminNavigation(session) {
    const nav = document.querySelector('.nav-links');
    if (!nav) return;
    nav.querySelector('[data-admin-nav-link]')?.remove();
    if (!session?.user?.id) return;
    try {
      const { data, error } = await getClient().from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (error || !['admin', 'super_admin'].includes(data?.role)) return;
      const link = document.createElement('a');
      link.href = appUrl('admin.html');
      link.textContent = 'Admin';
      link.dataset.adminNavLink = 'true';
      nav.append(link);
    } catch { /* Keep admin navigation hidden if the role lookup is unavailable. */ }
  }

  async function restoreProfileTheme(session) {
    if (!session) return;
    try {
      const { data, error } = await getClient().from('profiles').select('theme').eq('id', session.user.id).maybeSingle();
      if (error || !validThemes.includes(data?.theme)) return;
      document.body.dataset.theme = data.theme;
      try { localStorage.setItem('campus-connect-theme', data.theme); } catch { /* Keep the theme for this view. */ }
    } catch { /* Preserve local theme when profile data is unavailable. */ }
  }

  function initializeSession() {
    const form = document.querySelector('[data-auth-form="login"]');
    if (form) supabaseApi?.setRememberSession(form.elements.remember?.checked !== false);
    if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase?.createClient) return;
    try {
      const client = getClient();
      client.auth.getSession().then(({ data, error }) => {
        if (!error) {
          renderSessionControls(data.session);
          renderAdminNavigation(data.session);
          restoreProfileTheme(data.session);
        }
      }).catch(() => {});
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        renderSessionControls(session);
        window.setTimeout(() => renderAdminNavigation(session), 0);
        if (session) window.setTimeout(() => restoreProfileTheme(session), 0);
      });
      authSubscription = data.subscription;
    } catch { /* Auth forms show actionable configuration errors on submit. */ }
  }

  window.CampusConnectAuth = Object.freeze({
    getClient,
    appUrl,
    signOut: async () => {
      const { error } = await getClient().auth.signOut();
      if (error) throw error;
    },
    destroy: () => authSubscription?.unsubscribe(),
  });

  document.addEventListener('submit', handleSubmit);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeSession, { once: true });
  else initializeSession();
})();
