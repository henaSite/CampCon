// js/settings.js
// Settings logic for themes, password changes, blocked users, and logout

(function () {
  let supabaseClient = null;
  let currentUser = null;

  function getClient() {
    if (window.supabaseClient) return window.supabaseClient;
    if (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
      window.supabaseClient = window.supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_ANON_KEY
      );
      return window.supabaseClient;
    }
    return null;
  }

  function showBanner(message, isError = false) {
    const banner = document.getElementById('settingsBanner');
    if (!banner) return;
    banner.textContent = message;
    banner.style.display = 'block';
    banner.style.background = isError ? 'rgba(239, 68, 68, 0.14)' : 'rgba(16, 185, 129, 0.14)';
    banner.style.color = isError ? '#dc2626' : '#059669';
    setTimeout(() => {
      banner.style.display = 'none';
    }, 5000);
  }

  async function initSettings() {
    supabaseClient = getClient();
    if (!supabaseClient) {
      showBanner('Supabase is not configured yet in js/config.js.', true);
      return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session || !session.user) {
      window.location.href = 'pages/login.html';
      return;
    }
    currentUser = session.user;

    await loadUserSettings();
    await loadBlockedUsers();
    bindEvents();
  }

  async function loadUserSettings() {
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('theme, role')
      .eq('id', currentUser.id)
      .maybeSingle();

    const savedTheme = profile?.theme || localStorage.getItem('campcon_theme') || 'light';
    setThemeUI(savedTheme);

    if (profile && ['super_admin', 'admin', 'moderator'].includes(profile.role)) {
      const adminLink = document.getElementById('navAdminLink');
      if (adminLink) adminLink.style.display = 'inline-block';
    }
  }

  function setThemeUI(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('campcon_theme', themeName);

    document.querySelectorAll('.theme-option-btn').forEach((btn) => {
      if (btn.dataset.themeOption === themeName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  async function handleThemeChange(themeName) {
    setThemeUI(themeName);

    const { error } = await supabaseClient
      .from('profiles')
      .update({ theme: themeName })
      .eq('id', currentUser.id);

    if (error) {
      showBanner(`Theme applied locally, but failed to save: ${error.message}`, true);
    } else {
      showBanner(`Theme switched to ${themeName.charAt(0).toUpperCase() + themeName.slice(1)}!`);
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    const newPass = document.getElementById('newPasswordInput').value;
    const confirmPass = document.getElementById('confirmPasswordInput').value;

    if (newPass !== confirmPass) {
      showBanner('New passwords do not match.', true);
      return;
    }

    const btn = document.getElementById('updatePasswordBtn');
    btn.disabled = true;
    btn.textContent = 'Updating...';

    const { error } = await supabaseClient.auth.updateUser({ password: newPass });

    btn.disabled = false;
    btn.textContent = 'Update Password';

    if (error) {
      showBanner(`Error updating password: ${error.message}`, true);
      return;
    }

    document.getElementById('passwordForm').reset();
    showBanner('Password updated successfully!');
  }

  async function loadBlockedUsers() {
    const list = document.getElementById('blockedUsersList');
    if (!list) return;

    const { data, error } = await supabaseClient
      .from('blocked_users')
      .select('id, blocked_id, profiles!blocked_users_blocked_id_fkey(full_name)')
      .eq('blocker_id', currentUser.id);

    if (error || !data || data.length === 0) {
      list.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-secondary, #6b7280);">No blocked users.</p>';
      return;
    }

    list.innerHTML = data.map((b) => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding: 0.5rem 0; border-bottom: 1px solid var(--border-color, #e5e7eb);">
        <span style="font-size: 0.9rem; font-weight: 600;">${b.profiles?.full_name || 'Campus Member'}</span>
        <button type="button" class="btn btn-outline" style="font-size: 0.75rem; padding: 0.25rem 0.5rem;" data-unblock-id="${b.blocked_id}">Unblock</button>
      </div>
    `).join('');
  }

  async function handleUnblock(blockedId) {
    const { error } = await supabaseClient
      .from('blocked_users')
      .delete()
      .eq('blocker_id', currentUser.id)
      .eq('blocked_id', blockedId);

    if (error) {
      showBanner(`Could not unblock user: ${error.message}`, true);
      return;
    }
    showBanner('User unblocked.');
    await loadBlockedUsers();
  }

  async function handleLogout() {
    await supabaseClient.auth.signOut();
    localStorage.removeItem('campcon_theme');
    window.location.href = 'pages/login.html';
  }

  function bindEvents() {
    document.querySelector('.theme-picker-group')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-theme-option]');
      if (btn) {
        handleThemeChange(btn.dataset.themeOption);
      }
    });

    document.getElementById('passwordForm')?.addEventListener('submit', handlePasswordChange);
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);

    document.getElementById('blockedUsersList')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-unblock-id]');
      if (btn) {
        handleUnblock(btn.dataset.unblockId);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', initSettings);
})();