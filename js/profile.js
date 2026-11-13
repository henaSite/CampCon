// js/profile.js
// User Profile Management & Personal Report History

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

  function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, (tag) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  function showBanner(message, isError = false) {
    const banner = document.getElementById('profileBanner');
    if (!banner) return;
    banner.textContent = message;
    banner.style.display = 'block';
    banner.style.background = isError ? 'rgba(239, 68, 68, 0.14)' : 'rgba(16, 185, 129, 0.14)';
    banner.style.color = isError ? '#dc2626' : '#059669';
    setTimeout(() => {
      banner.style.display = 'none';
    }, 5000);
  }

  async function initProfile() {
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

    await loadProfileData();
    await loadMyReports();
    bindEvents();
  }

  async function loadProfileData() {
    const emailEl = document.getElementById('displayEmailText');
    if (emailEl) emailEl.textContent = currentUser.email || '';

    const { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (error) {
      showBanner(`Could not load profile: ${error.message}`, true);
      return;
    }

    const savedTheme = profile?.theme || localStorage.getItem('campcon_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    localStorage.setItem('campcon_theme', savedTheme);

    const fullName = profile?.full_name || currentUser.user_metadata?.full_name || 'Campus Member';
    const phone = profile?.phone || '';
    const avatarUrl = profile?.avatar_url || '';
    const role = profile?.role || 'user';

    document.getElementById('displayNameHeading').textContent = fullName;
    document.getElementById('fullNameInput').value = fullName;
    document.getElementById('phoneInput').value = phone;
    document.getElementById('avatarUrlInput').value = avatarUrl;

    const roleBadge = document.getElementById('displayRoleBadge');
    if (roleBadge) {
      roleBadge.textContent = role.replace('_', ' ').toUpperCase();
    }

    if (['super_admin', 'admin', 'moderator'].includes(role)) {
      const adminLink = document.getElementById('navAdminLink');
      if (adminLink) adminLink.style.display = 'inline-block';
    }

    updateAvatarVisual(fullName, avatarUrl);
  }

  function updateAvatarVisual(fullName, avatarUrl) {
    const avatarEl = document.getElementById('avatarDisplay');
    if (!avatarEl) return;

    if (avatarUrl) {
      avatarEl.innerHTML = `<img src="${escapeHTML(avatarUrl)}" alt="${escapeHTML(fullName)}" />`;
    } else {
      const initial = (fullName || 'U').trim().charAt(0).toUpperCase();
      avatarEl.textContent = initial;
    }
  }

  async function handleProfileSave(e) {
    e.preventDefault();
    const saveBtn = document.getElementById('saveProfileBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const fullName = document.getElementById('fullNameInput').value.trim();
    const phone = document.getElementById('phoneInput').value.trim() || null;
    const avatarUrl = document.getElementById('avatarUrlInput').value.trim() || null;

    const { error } = await supabaseClient
      .from('profiles')
      .update({
        full_name: fullName,
        phone,
        avatar_url: avatarUrl
      })
      .eq('id', currentUser.id);

    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Profile Changes';

    if (error) {
      showBanner(`Failed to save profile: ${error.message}`, true);
      return;
    }

    document.getElementById('displayNameHeading').textContent = fullName;
    updateAvatarVisual(fullName, avatarUrl);
    showBanner('Profile updated successfully!');
  }

  async function loadMyReports() {
    const list = document.getElementById('myReportsList');
    if (!list) return;

    const [lostRes, foundRes] = await Promise.all([
      supabaseClient
        .from('lost_items')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false }),
      supabaseClient
        .from('found_items')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
    ]);

    if (lostRes.error || foundRes.error) {
      list.innerHTML = '<p style="color:#dc2626;">Could not load your reports.</p>';
      return;
    }

    const combined = [
      ...(lostRes.data || []).map((r) => ({ ...r, reportType: 'lost', eventDate: r.date_lost })),
      ...(foundRes.data || []).map((r) => ({ ...r, reportType: 'found', eventDate: r.date_found }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (combined.length === 0) {
      list.innerHTML = `
        <p style="color: var(--text-secondary, #6b7280); padding: 1rem 0;">
          You haven't submitted any Lost or Found reports yet.
        </p>`;
      return;
    }

    list.innerHTML = combined.map((item) => {
      const statusClass = `status-${item.status || 'pending'}`;
      const canMarkRecovered = item.status === 'approved';

      return `
        <div class="my-report-item">
          <div>
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem;">
              <strong style="font-size:1rem;">${escapeHTML(item.item_name)}</strong>
              <span style="font-size:0.75rem;color:var(--text-secondary,#6b7280);text-transform:uppercase;">
                (${item.reportType})
              </span>
              <span class="status-pill ${statusClass}">${escapeHTML(item.status)}</span>
            </div>
            <div style="font-size:0.85rem;color:var(--text-secondary,#6b7280);">
              ${escapeHTML(item.location)} &bull; ${escapeHTML(item.eventDate || '')}
            </div>
          </div>

          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            ${canMarkRecovered ? `
              <button type="button" class="btn btn-primary" style="font-size:0.8rem;padding:0.4rem 0.7rem;"
                data-action="recover" data-id="${item.id}" data-type="${item.reportType}">
                Mark Recovered
              </button>` : ''}
            <button type="button" class="btn btn-outline" style="font-size:0.8rem;padding:0.4rem 0.7rem;color:#dc2626;border-color:#dc2626;"
              data-action="delete" data-id="${item.id}" data-type="${item.reportType}">
              Delete
            </button>
          </div>
        </div>`;
    }).join('');
  }

  async function handleReportAction(action, id, type) {
    const table = type === 'lost' ? 'lost_items' : 'found_items';

    if (action === 'recover') {
      const { error } = await supabaseClient
        .from(table)
        .update({ status: 'recovered' })
        .eq('id', id)
        .eq('user_id', currentUser.id);

      if (error) {
        showBanner(`Could not update status: ${error.message}`, true);
        return;
      }
      showBanner('Item marked as Recovered!');
      await loadMyReports();
    } else if (action === 'delete') {
      if (!confirm('Are you sure you want to delete this report?')) return;

      const { error } = await supabaseClient
        .from(table)
        .delete()
        .eq('id', id)
        .eq('user_id', currentUser.id);

      if (error) {
        showBanner(`Could not delete report: ${error.message}`, true);
        return;
      }
      showBanner('Report deleted.');
      await loadMyReports();
    }
  }

  function bindEvents() {
    document.getElementById('profileForm')?.addEventListener('submit', handleProfileSave);

    document.getElementById('myReportsList')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      handleReportAction(btn.dataset.action, btn.dataset.id, btn.dataset.type);
    });
  }

  document.addEventListener('DOMContentLoaded', initProfile);
})();