// js/settings.js
// Settings logic for themes, password changes, blocked users, and logout

(function () {
  let supabaseClient = null;
  let currentUser = null;
  const validThemes = ['light', 'dark', 'ocean', 'forest', 'sunset'];
  function getClient() { return window.CampusConnectAuth?.getClient?.() || null; }
  function showBanner(message, isError = false) {
    const banner = document.getElementById('settingsBanner');
    if (!banner) return;
    banner.textContent = message;
    banner.style.display = 'block';
    banner.style.background = isError ? 'rgba(239, 68, 68, 0.14)' : 'rgba(16, 185, 129, 0.14)';
    banner.style.color = isError ? '#dc2626' : '#059669';
    setTimeout(() => { banner.style.display = 'none'; }, 5000);
  }
  async function initSettings() {
    try {
      supabaseClient = getClient();
      if (!supabaseClient) throw new Error('Supabase is not configured. Check js/config.js and the Supabase JS v2 library.');
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      if (!session?.user) {
        const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.assign(`${window.CampusConnectAuth.appUrl('pages/login.html')}?next=${encodeURIComponent(next)}`);
        return;
      }
      currentUser = session.user;
      await loadUserSettings();
      await loadBlockedUsers();
      bindEvents();
    } catch (error) { showBanner(error?.message || 'Unable to initialize settings.', true); }
  }
  async function loadUserSettings() {
    const { data: profile } = await supabaseClient.from('profiles').select('theme, role').eq('id', currentUser.id).maybeSingle();
    setThemeUI(profile?.theme || localStorage.getItem('campcon_theme') || 'light');
    if (profile && ['super_admin', 'admin', 'moderator'].includes(profile.role)) {
      const adminLink = document.getElementById('navAdminLink');
      if (adminLink) adminLink.style.display = 'inline-block';
    }
  }
  function setThemeUI(themeName) {
    const selected = validThemes.includes(themeName) ? themeName : 'light';
    document.body.dataset.theme = selected;
    localStorage.setItem('campcon_theme', selected);
    document.querySelectorAll('.theme-option-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.themeOption === selected);
      button.setAttribute('aria-pressed', String(button.dataset.themeOption === selected));
    });
  }
  async function handleThemeChange(themeName) {
    if (!validThemes.includes(themeName)) return;
    setThemeUI(themeName);
    const { error } = await supabaseClient.from('profiles').update({ theme: themeName }).eq('id', currentUser.id);
    if (error) showBanner(`Theme applied locally, but failed to save: ${error.message}`, true);
    else showBanner(`Theme switched to ${themeName.charAt(0).toUpperCase() + themeName.slice(1)}!`);
  }
  async function handlePasswordChange(event) {
    event.preventDefault();
    const newPass = document.getElementById('newPasswordInput').value;
    const confirmPass = document.getElementById('confirmPasswordInput').value;
    if (newPass !== confirmPass) { showBanner('New passwords do not match.', true); return; }
    const btn = document.getElementById('updatePasswordBtn');
    btn.disabled = true;
    btn.textContent = 'Updating...';
    try {
      const { error } = await supabaseClient.auth.updateUser({ password: newPass });
      if (error) throw error;
      document.getElementById('passwordForm').reset();
      showBanner('Password updated successfully!');
    } catch (error) { showBanner(`Error updating password: ${error.message}`, true); }
    finally { btn.disabled = false; btn.textContent = 'Update Password'; }
  }
  async function loadBlockedUsers() {
    const list = document.getElementById('blockedUsersList');
    if (!list) return;
    const { data, error } = await supabaseClient.from('blocked_users').select('id, blocked_id, profiles!blocked_users_blocked_id_fkey(full_name)').eq('blocker_id', currentUser.id);
    if (error || !data?.length) { list.innerHTML = '<p style="font-size:.85rem;color:var(--text-secondary,#6b7280);">No blocked users.</p>'; return; }
    list.innerHTML = data.map((blocked) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:.5rem 0;border-bottom:1px solid var(--border-color,#e5e7eb);"><span style="font-size:.9rem;font-weight:600;">${blocked.profiles?.full_name || 'Campus Member'}</span><button type="button" class="btn btn-outline" style="font-size:.75rem;padding:.25rem .5rem;" data-unblock-id="${blocked.blocked_id}">Unblock</button></div>`).join('');
  }
  async function handleUnblock(blockedId) {
    const { error } = await supabaseClient.from('blocked_users').delete().eq('blocker_id', currentUser.id).eq('blocked_id', blockedId);
    if (error) { showBanner(`Could not unblock user: ${error.message}`, true); return; }
    showBanner('User unblocked.');
    await loadBlockedUsers();
  }
  async function handleLogout() {
    try {
      await window.CampusConnectAuth.signOut();
      localStorage.removeItem('campcon_theme');
      window.location.assign(window.CampusConnectAuth.appUrl('pages/login.html'));
    } catch (error) { showBanner(`Could not sign out: ${error.message}`, true); }
  }
  function bindEvents() {
    document.querySelector('.theme-picker-group')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-theme-option]');
      if (button) handleThemeChange(button.dataset.themeOption);
    });
    document.getElementById('passwordForm')?.addEventListener('submit', handlePasswordChange);
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    document.getElementById('blockedUsersList')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-unblock-id]');
      if (button) handleUnblock(button.dataset.unblockId);
    });
  }
  document.addEventListener('DOMContentLoaded', initSettings);
})();
