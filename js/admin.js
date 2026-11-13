/* Admin dashboard session guard, overview counts, report moderation, and user management. */
(() => {
  'use strict';

  const ADMIN_ROLES = new Set(['super_admin', 'admin']);
  const ROLES = ['user', 'moderator', 'admin', 'super_admin'];
  const LOGIN_URL = './pages/login.html';
  const HOME_URL = './index.html';
  const REFRESH_INTERVAL_MS = 60_000;

  let client;
  let currentRole = 'user';
  let refreshTimer;
  let realtimeChannel;
  let authSubscription;
  let loading = false;
  let reportsLoading = false;
  let reportFilter = 'pending';
  let reportRows = [];
  let userSearchTimer;
  let usersLoading = false;

  function setCard(label, value, note) {
    const card = [...document.querySelectorAll('#stats .stat-card')].find((item) =>
      item.querySelector('span')?.textContent.trim().toLowerCase() === label.toLowerCase(),
    );
    if (!card) return;
    const number = card.querySelector('strong');
    const caption = card.querySelector('span');
    if (number) number.textContent = value == null ? '—' : new Intl.NumberFormat().format(value);
    if (caption && note) caption.textContent = note;
  }

  function statusNode() {
    let node = document.querySelector('#admin-stats-status');
    if (!node) {
      node = document.createElement('p');
      node.id = 'admin-stats-status';
      node.className = 'form-help';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      document.querySelector('#stats .stats-grid')?.insertAdjacentElement('afterend', node);
    }
    return node;
  }

  function showStatus(message, isError = false) {
    const node = statusNode();
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('status-message', isError);
    node.classList.toggle('show', isError);
    node.classList.toggle('error', isError);
  }

  function getClient() {
    if (!window.CampusConnectAuth?.getClient) {
      throw new Error('Authentication is unavailable. Check that the Supabase scripts are loaded.');
    }
    return window.CampusConnectAuth.getClient();
  }

  function redirectToLogin() {
    const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(`${LOGIN_URL}?next=${encodeURIComponent(next)}`);
  }

  async function requireAdministrator(supabase, session) {
    if (!session?.user?.id) {
      redirectToLogin();
      return false;
    }
    const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
    if (error) throw error;
    currentRole = profile?.role || 'user';
    if (!ADMIN_ROLES.has(currentRole)) {
      window.location.replace(HOME_URL);
      return false;
    }
    return true;
  }

  async function countRows(table, filters = []) {
    let query = client.from(table).select('id', { count: 'exact', head: true });
    for (const [column, value] of filters) query = query.eq(column, value);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  }

  async function loadStats() {
    if (loading) return;
    loading = true;
    try {
      const results = await Promise.allSettled([
        countRows('lost_items'), countRows('found_items'),
        countRows('content_reports', [['status', 'open']]), countRows('profiles'),
      ]);
      const [lost, found, abuse, members] = results;
      if (lost.status === 'fulfilled') setCard('Open lost reports', lost.value, 'Lost item reports');
      else setCard('Open lost reports', null, 'Lost item reports unavailable');
      if (found.status === 'fulfilled') setCard('Open found reports', found.value, 'Found item reports');
      else setCard('Open found reports', null, 'Found item reports unavailable');
      if (abuse.status === 'fulfilled') setCard('Reports awaiting review', abuse.value, 'Reports awaiting review');
      else setCard('Reports awaiting review', null, 'Reports awaiting review unavailable');
      // profiles RLS currently scopes normal reads to the current user, so don't
      // present a restricted profile count as the site-wide member total.
      if (members.status === 'fulfilled' && members.value > 1) setCard('Community members', members.value, 'Community members');
      else setCard('Community members', null, 'Community member total unavailable (profile RLS)');
      showStatus(results.some((result) => result.status === 'rejected')
        ? 'Some totals could not be loaded. Confirm the item tables and admin RLS policies are installed.'
        : 'Counts updated just now.');
    } catch (error) {
      showStatus(error?.message || 'Unable to load dashboard counts.', true);
    } finally {
      loading = false;
    }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function reportTitle(report) {
    return report.title || report.item_name || report.name || report.item || 'Untitled item report';
  }

  function isPending(report) {
    return ['pending', 'open', 'submitted'].includes(String(report.status || 'pending').toLowerCase());
  }

  function createReportCard(report) {
    const card = element('article', 'item-card admin-report-card');
    const head = element('div', 'item-head');
    const titleWrap = element('div');
    titleWrap.append(element('h3', '', reportTitle(report)));
    titleWrap.append(element('p', '', `${report.kind} report${report.location ? ` · ${report.location}` : ''}`));
    const state = element('span', 'pill', String(report.status || 'pending'));
    state.classList.add(String(report.status || 'pending').toLowerCase());
    head.append(titleWrap, state);
    card.append(head);
    if (report.description) card.append(element('p', '', report.description));
    if (report.created_at) {
      const date = new Date(report.created_at);
      if (!Number.isNaN(date.valueOf())) card.append(element('small', 'form-help', `Reported ${date.toLocaleString()}`));
    }
    const actions = element('div', 'admin-report-actions');
    for (const [nextStatus, label] of [['approved', 'Approve'], ['rejected', 'Reject'], ['recovered', 'Mark as Recovered']]) {
      const button = element('button', 'button button-secondary', label);
      button.type = 'button';
      button.addEventListener('click', () => updateReport(report, nextStatus, button));
      actions.append(button);
    }
    const deleteButton = element('button', 'button button-secondary', 'Delete');
    deleteButton.type = 'button';
    deleteButton.addEventListener('click', () => deleteReport(report, deleteButton));
    actions.append(deleteButton);
    card.append(actions);
    return card;
  }

  function ensureReportsUI() {
    const section = document.querySelector('#moderate-reports');
    if (!section) return null;
    let panel = section.querySelector('[data-admin-reports]');
    if (panel) return panel;
    panel = element('div', 'feature-card admin-panel');
    panel.dataset.adminReports = 'true';
    const toolbar = element('div', 'admin-report-toolbar');
    toolbar.append(element('h3', '', 'Item reports'));
    const filters = element('div', 'admin-report-filters');
    for (const [value, label] of [['pending', 'Pending'], ['all', 'All reports']]) {
      const button = element('button', 'button button-secondary', label);
      button.type = 'button';
      button.dataset.reportFilter = value;
      button.setAttribute('aria-pressed', String(reportFilter === value));
      button.addEventListener('click', () => {
        reportFilter = value;
        filters.querySelectorAll('[data-report-filter]').forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.reportFilter === value)));
        renderReports();
      });
      filters.append(button);
    }
    toolbar.append(filters);
    const message = element('p', 'form-help', 'Loading reports…');
    message.id = 'admin-reports-status';
    message.setAttribute('role', 'status');
    const list = element('div', 'admin-report-list');
    list.id = 'admin-report-list';
    panel.append(toolbar, message, list);
    const existing = section.querySelector('.admin-panel');
    if (existing) existing.replaceWith(panel);
    else section.append(panel);
    return panel;
  }

  function renderReports() {
    const panel = ensureReportsUI();
    const list = panel?.querySelector('#admin-report-list');
    const status = panel?.querySelector('#admin-reports-status');
    if (!list || !status) return;
    const visible = reportFilter === 'pending' ? reportRows.filter(isPending) : reportRows;
    list.replaceChildren(...visible.map(createReportCard));
    status.textContent = reportsLoading ? 'Loading reports…' : visible.length
      ? `${visible.length} ${reportFilter === 'pending' ? 'pending ' : ''}report${visible.length === 1 ? '' : 's'}.`
      : reportFilter === 'pending' ? 'There are no pending item reports.' : 'There are no item reports.';
  }

  async function loadReports() {
    if (reportsLoading || !client || !document.querySelector('#moderate-reports')) return;
    reportsLoading = true;
    renderReports();
    const results = await Promise.all(REPORT_TABLES.map(async ({ name, label }) => {
      const { data, error } = await client.from(name).select('*').limit(200);
      if (error) throw new Error(`${label} reports could not be loaded: ${error.message}`);
      return (data || []).map((report) => ({ ...report, table: name, kind: label }));
    }).map((request) => request.catch((error) => ({ loadError: error.message }))));
    reportRows = results.flatMap((result) => Array.isArray(result) ? result : []);
    reportRows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    reportsLoading = false;
    renderReports();
    const failures = results.filter((result) => !Array.isArray(result));
    if (failures.length) {
      const status = document.querySelector('#admin-reports-status');
      if (status) status.textContent = `${failures.map((failure) => failure.loadError).join(' ')} Check table names, read grants, and RLS policies.`;
    }
  }

  async function updateReport(report, status, button) {
    button.disabled = true;
    try {
      const { error } = await client.from(report.table).update({ status }).eq('id', report.id);
      if (error) throw error;
      await Promise.all([loadReports(), loadStats()]);
    } catch (error) {
      window.alert(error?.message || 'Could not update this report. Check the table schema and admin update policies.');
    } finally { button.disabled = false; }
  }

  async function deleteReport(report, button) {
    if (!window.confirm(`Permanently delete “${reportTitle(report)}”? This cannot be undone.`)) return;
    button.disabled = true;
    try {
      const { error } = await client.from(report.table).delete().eq('id', report.id);
      if (error) throw error;
      await Promise.all([loadReports(), loadStats()]);
    } catch (error) {
      window.alert(error?.message || 'Could not delete this report. Check the admin delete policy.');
    } finally { button.disabled = false; }
  }

  function ensureUsersUI() {
    const section = document.querySelector('#manage-users');
    if (!section) return null;
    let panel = section.querySelector('[data-admin-users]');
    if (panel) return panel;
    panel = element('div', 'feature-card admin-panel');
    panel.dataset.adminUsers = 'true';
    const field = element('div', 'field');
    const label = element('label', '', 'Search by name, email, or phone');
    label.htmlFor = 'admin-user-search';
    const input = element('input');
    input.id = 'admin-user-search';
    input.type = 'search';
    input.autocomplete = 'off';
    input.placeholder = 'Start typing to search';
    input.setAttribute('aria-label', 'Search users by name, email, or phone');
    input.addEventListener('input', () => {
      window.clearTimeout(userSearchTimer);
      userSearchTimer = window.setTimeout(() => loadUsers(input.value.trim()), 250);
    });
    field.append(label, input);
    const note = element('p', 'form-help', 'Account suspension is an application status; a trusted server function is required to ban a user from Supabase Auth.');
    const status = element('p', 'form-help', 'Enter a search term or wait for the user list.');
    status.id = 'admin-users-status';
    status.setAttribute('role', 'status');
    const list = element('div', 'admin-user-list');
    list.id = 'admin-user-list';
    panel.append(field, note, status, list);
    const existing = section.querySelector('.admin-panel');
    if (existing) existing.replaceWith(panel);
    else section.append(panel);
    return panel;
  }

  function renderUser(user) {
    const card = element('article', 'item-card admin-user-card');
    const info = element('div', 'admin-user-info');
    info.append(element('h3', '', user.full_name || 'Campus member'));
    info.append(element('p', '', [user.email, user.phone].filter(Boolean).join(' · ') || 'No contact details'));
    info.append(element('small', 'form-help', `Role: ${user.role}${user.suspended_at ? ' · Suspended' : ''}`));
    card.append(info);

    const controls = element('div', 'admin-user-controls');
    if (currentRole === 'super_admin') {
      const roleLabel = element('label', 'form-help', 'Role');
      const roleSelect = element('select');
      roleSelect.setAttribute('aria-label', `Change role for ${user.full_name || user.email || 'user'}`);
      ROLES.forEach((role) => {
        const option = element('option', '', role.replace('_', ' '));
        option.value = role;
        option.selected = role === user.role;
        roleSelect.append(option);
      });
      roleSelect.addEventListener('change', () => changeRole(user, roleSelect.value, roleSelect));
      roleLabel.append(roleSelect);
      controls.append(roleLabel);
    }

    if (user.role !== 'super_admin' || currentRole === 'super_admin') {
      const suspend = element('button', 'button button-secondary', user.suspended_at ? 'Restore account' : 'Suspend account');
      suspend.type = 'button';
      suspend.addEventListener('click', () => setSuspended(user, !user.suspended_at, suspend));
      controls.append(suspend);
    }
    card.append(controls);
    return card;
  }

  async function loadUsers(searchTerm = '') {
    const panel = ensureUsersUI();
    if (!panel || usersLoading) return;
    usersLoading = true;
    const status = panel.querySelector('#admin-users-status');
    const list = panel.querySelector('#admin-user-list');
    status.textContent = 'Searching users…';
    try {
      const { data, error } = await client.rpc('admin_search_users', { search_term: searchTerm });
      if (error) throw error;
      list.replaceChildren(...(data || []).map(renderUser));
      status.textContent = data?.length ? `${data.length} user${data.length === 1 ? '' : 's'}${data.length === 50 ? ' (showing the first 50; refine search)' : ''}.` : 'No matching users.';
    } catch (error) {
      list.replaceChildren();
      status.textContent = `${error?.message || 'Unable to search users.'} Apply the admin user-management migration and verify your access.`;
    } finally { usersLoading = false; }
  }

  async function changeRole(user, role, select) {
    if (!ROLES.includes(role) || currentRole !== 'super_admin') return;
    select.disabled = true;
    try {
      const { error } = await client.rpc('set_profile_role', { target_user_id: user.user_id, new_role: role });
      if (error) throw error;
      await loadUsers(document.querySelector('#admin-user-search')?.value.trim() || '');
    } catch (error) {
      window.alert(error?.message || 'Could not update this role.');
      select.value = user.role;
    } finally { select.disabled = false; }
  }

  async function setSuspended(user, shouldSuspend, button) {
    const verb = shouldSuspend ? 'Suspend' : 'Restore';
    if (!window.confirm(`${verb} access for ${user.full_name || user.email || 'this account'}?`)) return;
    button.disabled = true;
    try {
      const { error } = await client.rpc('set_profile_suspension', {
        target_user_id: user.user_id,
        should_suspend: shouldSuspend,
      });
      if (error) throw error;
      await loadUsers(document.querySelector('#admin-user-search')?.value.trim() || '');
    } catch (error) {
      window.alert(error?.message || 'Could not update account suspension.');
    } finally { button.disabled = false; }
  }

  function watchStats() {
    if (!client.channel) return;
    realtimeChannel = client.channel('admin-dashboard-stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lost_items' }, () => { loadStats(); loadReports(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'found_items' }, () => { loadStats(); loadReports(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_reports' }, loadStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { loadStats(); loadUsers(document.querySelector('#admin-user-search')?.value.trim() || ''); })
      .subscribe();
    refreshTimer = window.setInterval(() => { loadStats(); loadReports(); }, REFRESH_INTERVAL_MS);
  }

  async function initialize() {
    try {
      client = getClient();
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (!(await requireAdministrator(client, data.session))) return;
      ensureReportsUI();
      ensureUsersUI();
      await Promise.all([loadStats(), loadReports(), loadUsers()]);
      watchStats();
      const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
        if (!session) redirectToLogin();
      });
      authSubscription = listener.subscription;
    } catch (error) {
      showStatus(error?.message || 'Unable to verify administrator access.', true);
      if (!window.CampusConnectAuth?.getClient) window.setTimeout(redirectToLogin, 1200);
    }
  }

  function cleanup() {
    if (refreshTimer) window.clearInterval(refreshTimer);
    window.clearTimeout(userSearchTimer);
    realtimeChannel?.unsubscribe();
    authSubscription?.unsubscribe();
  }

  window.addEventListener('pagehide', cleanup, { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
