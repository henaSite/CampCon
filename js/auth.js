(() => {
  const config = window.CAMPUS_CONNECT_CONFIG || {};
  let client;

  function getClient(remember = true) {
    if (!window.supabase?.createClient) throw new Error('The Supabase client could not load. Check your network connection and try again.');
    const url = config.supabaseUrl;
    const key = config.supabaseAnonKey;
    if (!url || !key || url.includes('YOUR_SUPABASE') || key.includes('YOUR_SUPABASE')) {
      throw new Error('Supabase is not configured yet. Add your project URL and anon key in js/config.js.');
    }
    if (!client) {
      client = window.supabase.createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: remember ? window.localStorage : window.sessionStorage },
      });
    }
    return client;
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

  function setBusy(form, busy) {
    const button = form.querySelector('[type="submit"]');
    if (!button) return;
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = 'Please wait…';
    } else if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
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
    setBusy(form, true);

    try {
      const auth = getClient(action !== 'login' || data.get('remember') === 'on');
      if (action === 'register') {
        const fullName = String(data.get('fullName') || '').trim();
        const phone = String(data.get('phone') || '').trim().replace(/[\s()-]/g, '');
        const confirmPassword = String(data.get('confirmPassword') || '');
        if (fullName.length < 2) throw new Error('Enter your full name.');
        if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('Enter a valid phone number in international format, such as +15551234567.');
        if (!validPassword(password)) throw new Error('Use at least 10 characters with an uppercase letter, a lowercase letter, and a number.');
        if (password !== confirmPassword) throw new Error('The passwords do not match.');
        const { error } = await auth.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, phone }, emailRedirectTo: `${window.location.origin}/pages/login.html` },
        });
        if (error) throw error;
        form.reset();
        showStatus(form, 'Account created. Check your email for a verification link before logging in. If the address is already registered, follow the existing account’s verification or recovery flow.', 'success');
      } else if (action === 'login') {
        const { error } = await auth.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showStatus(form, 'You are signed in. The authenticated home dashboard will be added in a later phase.', 'success');
      } else if (action === 'recover') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
        const { error } = await auth.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/pages/reset-password.html` });
        if (error) throw error;
        showStatus(form, 'If an account exists for that address, a secure password reset link will arrive shortly. Check your inbox and spam folder.', 'success');
      } else if (action === 'update-password') {
        const confirmPassword = String(data.get('confirmPassword') || '');
        if (!validPassword(password)) throw new Error('Use at least 10 characters with an uppercase letter, a lowercase letter, and a number.');
        if (password !== confirmPassword) throw new Error('The passwords do not match.');
        const { data: sessionData, error: sessionError } = await auth.auth.getSession();
        if (sessionError) throw sessionError;
        if (!sessionData.session) throw new Error('This reset link is invalid or has expired. Request a new reset link.');
        const { error } = await auth.auth.updateUser({ password });
        if (error) throw error;
        form.reset();
        showStatus(form, 'Your password has been updated. You can now log in with your new password.', 'success');
      }
    } catch (error) {
      showStatus(form, error?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(form, false);
    }
  }

  document.addEventListener('submit', handleSubmit);
})();
