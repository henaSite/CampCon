// js/dashboard.js
// Authenticated Lost & Found Feed, Report Submission, and Comments

(function () {
  let supabaseClient = null;
  let currentUser = null;
  let allReports = [];
  let activeCommentItem = { id: null, type: null };

  const FALLBACK_CATEGORIES = [
    'Phones', 'Laptops', 'Bags', 'Wallets', 'Identification cards',
    'Books and documents', 'Keys', 'Clothing', 'Accessories', 'Other'
  ];

  function getClient() {
    return window.CampusConnectAuth?.getClient?.() || null;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, (tag) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
  }

  function showBanner(message, isError = false) {
    const banner = document.getElementById('statusBanner');
    if (!banner) return;
    banner.textContent = message;
    banner.style.display = 'block';
    banner.style.background = isError ? 'rgba(239, 68, 68, 0.14)' : 'rgba(16, 185, 129, 0.14)';
    banner.style.color = isError ? '#dc2626' : '#059669';
    setTimeout(() => { banner.style.display = 'none'; }, 5000);
  }

  async function initDashboard() {
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
      await applySavedTheme();
      await checkAdminNav();
      await loadCategories();
      await loadReports();
      bindEvents();
    } catch (error) {
      showBanner(error?.message || 'Unable to initialize the dashboard.', true);
    }
  }

  async function applySavedTheme() {
    const { data: profile } = await supabaseClient.from('profiles').select('theme').eq('id', currentUser.id).maybeSingle();
    const savedTheme = profile?.theme || localStorage.getItem('campcon_theme') || 'light';
    document.body.dataset.theme = savedTheme;
    localStorage.setItem('campcon_theme', savedTheme);
  }

  async function checkAdminNav() {
    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', currentUser.id).maybeSingle();
    if (profile && ['super_admin', 'admin', 'moderator'].includes(profile.role)) {
      const adminLink = document.getElementById('navAdminLink');
      if (adminLink) adminLink.style.display = 'inline-block';
    }
  }

  async function loadCategories() {
    const { data } = await supabaseClient.from('categories').select('name').order('name', { ascending: true });
    const categories = data?.length ? data.map((category) => category.name) : FALLBACK_CATEGORIES;
    const filterSelect = document.getElementById('categoryFilter');
    const modalSelect = document.getElementById('itemCategoryInput');
    if (filterSelect) filterSelect.innerHTML = '<option value="all">All Categories</option>' + categories.map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('');
    if (modalSelect) modalSelect.innerHTML = categories.map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('');
  }

  async function loadReports() {
    const feed = document.getElementById('reportsFeed');
    if (feed) feed.innerHTML = '<p style="color: var(--text-secondary, #6b7280);">Loading campus reports...</p>';
    const [lostRes, foundRes] = await Promise.all([
      supabaseClient.from('lost_items').select('*, profiles(full_name)').in('status', ['approved', 'recovered']).order('created_at', { ascending: false }),
      supabaseClient.from('found_items').select('*, profiles(full_name)').in('status', ['approved', 'recovered']).order('created_at', { ascending: false })
    ]);
    if (lostRes.error || foundRes.error) {
      if (feed) feed.innerHTML = '<p style="color:#dc2626;">Could not load reports. Check that SQL migration 005 has been run in Supabase.</p>';
      return;
    }
    const lostList = (lostRes.data || []).map((item) => ({ ...item, reportType: 'lost', eventDate: item.date_lost }));
    const foundList = (foundRes.data || []).map((item) => ({ ...item, reportType: 'found', eventDate: item.date_found }));
    allReports = [...lostList, ...foundList].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    renderFilteredReports();
  }

  function renderFilteredReports() {
    const feed = document.getElementById('reportsFeed');
    if (!feed) return;
    const search = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
    const typeVal = document.getElementById('typeFilter')?.value || 'all';
    const catVal = document.getElementById('categoryFilter')?.value || 'all';
    const filtered = allReports.filter((item) => {
      if (typeVal !== 'all' && item.reportType !== typeVal) return false;
      if (catVal !== 'all' && item.category !== catVal) return false;
      if (search && !`${item.item_name} ${item.description} ${item.location} ${item.category}`.toLowerCase().includes(search)) return false;
      return true;
    });
    if (!filtered.length) {
      feed.innerHTML = '<div class="report-card" style="grid-column:1 / -1;text-align:center;padding:2.5rem;"><h3>No matching reports yet</h3><p style="color:var(--text-secondary,#6b7280);margin-top:.4rem;">Try clearing your filters or submit a new Lost/Found report above.</p></div>';
      return;
    }
    feed.innerHTML = filtered.map((item) => {
      const isLost = item.reportType === 'lost';
      const isRecovered = item.status === 'recovered';
      const badgeClass = isRecovered ? 'badge-recovered' : (isLost ? 'badge-lost' : 'badge-found');
      const badgeText = isRecovered ? 'Recovered' : (isLost ? 'Lost' : 'Found');
      const posterName = item.profiles?.full_name || 'Campus Member';
      const isOwnPost = item.user_id === currentUser.id;
      return `<article class="report-card"><div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;"><span class="badge ${badgeClass}">${badgeText}</span><span style="font-size:.8rem;color:var(--text-secondary,#6b7280);">${escapeHTML(item.eventDate || '')}</span></div>${item.image_url ? `<img src="${escapeHTML(item.image_url)}" alt="${escapeHTML(item.item_name)}" style="width:100%;height:170px;object-fit:cover;border-radius:.5rem;margin-bottom:.7rem;" />` : ''}<h3 style="margin:0 0 .4rem;font-size:1.1rem;">${escapeHTML(item.item_name)}</h3><p style="font-size:.9rem;color:var(--text-secondary,#4b5563);margin-bottom:.85rem;">${escapeHTML(item.description)}</p><div style="font-size:.82rem;color:var(--text-secondary,#6b7280);margin-bottom:1rem;line-height:1.5;"><div><strong>Location:</strong> ${escapeHTML(item.location)}</div><div><strong>Category:</strong> ${escapeHTML(item.category)}</div><div><strong>Posted by:</strong> ${escapeHTML(posterName)}</div></div></div><div style="display:flex;gap:.5rem;border-top:1px solid var(--border-color,#e5e7eb);padding-top:.85rem;"><button type="button" class="btn btn-outline" style="flex:1;padding:.45rem .6rem;font-size:.85rem;" data-action="comment" data-id="${item.id}" data-type="${item.reportType}" data-title="${escapeHTML(item.item_name)}">Comments</button>${!isOwnPost ? `<a href="inbox.html?user=${encodeURIComponent(item.user_id)}&item=${encodeURIComponent(item.id)}" class="btn btn-primary" style="flex:1;padding:.45rem .6rem;font-size:.85rem;text-align:center;text-decoration:none;">Message</a>` : '<span style="flex:1;text-align:center;font-size:.8rem;align-self:center;color:var(--text-secondary,#6b7280);">Your post</span>'}</div></article>`;
    }).join('');
  }

  function openReportModal(type) {
    const modal = document.getElementById('reportModal');
    if (!modal) return;
    document.getElementById('reportTypeInput').value = type;
    document.getElementById('reportModalTitle').textContent = type === 'lost' ? 'Report a Lost Item' : 'Report a Found Item';
    document.getElementById('itemDateLabel').textContent = type === 'lost' ? 'Date Lost *' : 'Date Found *';
    document.getElementById('itemDateInput').value = new Date().toISOString().split('T')[0];
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeReportModal() {
    const modal = document.getElementById('reportModal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.getElementById('reportForm')?.reset();
  }

  async function handleReportSubmit(event) {
    event.preventDefault();
    const submitBtn = document.getElementById('submitReportBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    try {
      const type = document.getElementById('reportTypeInput').value;
      const eventDate = document.getElementById('itemDateInput').value;
      const payload = {
        user_id: currentUser.id,
        item_name: document.getElementById('itemNameInput').value.trim(),
        category: document.getElementById('itemCategoryInput').value,
        location: document.getElementById('itemLocationInput').value.trim(),
        description: document.getElementById('itemDescriptionInput').value.trim(),
        image_url: document.getElementById('itemImageUrlInput').value.trim() || null,
        status: 'pending',
      };
      payload[type === 'lost' ? 'date_lost' : 'date_found'] = eventDate;
      const { error } = await supabaseClient.from(type === 'lost' ? 'lost_items' : 'found_items').insert([payload]);
      if (error) throw error;
      closeReportModal();
      showBanner('Report submitted! It will appear on the public feed once approved by an admin.');
      await loadReports();
    } catch (error) {
      showBanner(`Error submitting report: ${error.message}`, true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Report';
    }
  }

  async function openCommentsModal(itemId, itemType, itemTitle) {
    activeCommentItem = { id: itemId, type: itemType };
    const modal = document.getElementById('commentsModal');
    const titleEl = document.getElementById('commentsModalTitle');
    if (titleEl) titleEl.textContent = `Comments: ${itemTitle}`;
    if (modal) { modal.classList.add('active'); modal.setAttribute('aria-hidden', 'false'); }
    await loadComments();
  }

  function closeCommentsModal() {
    const modal = document.getElementById('commentsModal');
    if (modal) { modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); }
    activeCommentItem = { id: null, type: null };
  }

  async function loadComments() {
    const list = document.getElementById('commentsList');
    if (!list || !activeCommentItem.id) return;
    list.innerHTML = '<p style="color:var(--text-secondary,#6b7280);">Loading comments...</p>';
    const { data, error } = await supabaseClient.from('comments').select('*, profiles(full_name)').eq('item_id', activeCommentItem.id).eq('item_type', activeCommentItem.type).order('created_at', { ascending: true });
    if (error) { list.innerHTML = '<p style="color:#dc2626;">Failed to load comments.</p>'; return; }
    if (!data?.length) { list.innerHTML = '<p style="color:var(--text-secondary,#6b7280);">No comments yet. Start the conversation below.</p>'; return; }
    list.innerHTML = data.map((comment) => `<div class="comment-item"><div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:.25rem;"><strong>${escapeHTML(comment.profiles?.full_name || 'Campus Member')}</strong><span style="color:var(--text-secondary,#6b7280);">${new Date(comment.created_at).toLocaleString()}</span></div><p style="margin:0;font-size:.9rem;">${escapeHTML(comment.content)}</p></div>`).join('');
  }

  async function handleCommentSubmit(event) {
    event.preventDefault();
    const input = document.getElementById('commentInput');
    const content = input.value.trim();
    if (!content || !activeCommentItem.id) return;
    const { error } = await supabaseClient.from('comments').insert([{ item_id: activeCommentItem.id, item_type: activeCommentItem.type, user_id: currentUser.id, content }]);
    if (error) { showBanner(`Could not post comment: ${error.message}`, true); return; }
    input.value = '';
    await loadComments();
  }

  function bindEvents() {
    document.getElementById('searchInput')?.addEventListener('input', renderFilteredReports);
    document.getElementById('typeFilter')?.addEventListener('change', renderFilteredReports);
    document.getElementById('categoryFilter')?.addEventListener('change', renderFilteredReports);
    document.getElementById('openLostModalBtn')?.addEventListener('click', () => openReportModal('lost'));
    document.getElementById('openFoundModalBtn')?.addEventListener('click', () => openReportModal('found'));
    document.getElementById('closeReportModalBtn')?.addEventListener('click', closeReportModal);
    document.getElementById('cancelReportBtn')?.addEventListener('click', closeReportModal);
    document.getElementById('reportForm')?.addEventListener('submit', handleReportSubmit);
    document.getElementById('closeCommentsModalBtn')?.addEventListener('click', closeCommentsModal);
    document.getElementById('commentForm')?.addEventListener('submit', handleCommentSubmit);
    document.getElementById('reportsFeed')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action="comment"]');
      if (button) openCommentsModal(button.dataset.id, button.dataset.type, button.dataset.title);
    });
  }

  document.addEventListener('DOMContentLoaded', initDashboard);
})();
