/* Admin dashboard session guard and live overview counts. */
(() => {
  'use strict';

  const ADMIN_ROLES = new Set(['super_admin', 'admin']);
  const LOGIN_URL = './pages/login.html';
  const HOME_URL = './index.html';
  const REFRESH_INTERVAL_MS = 60_000;

  let client;
  let refreshTimer;
  let realtimeChannel;
  let authSubscription;
  let loading = false;

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

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) throw error;
    if (!ADMIN_ROLES.has(profile?.role)) {
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
        countRows('lost_items'),
        countRows('found_items'),
        countRows('content_reports', [['status', 'open']]),
        countRows('profiles'),
      ]);

      const [lost, found, abuse, members] = results;
      if (lost.status === 'fulfilled') setCard('Open lost reports', lost.value, 'Lost item reports');
      else setCard('Open lost reports', null, 'Lost item reports unavailable');

      if (found.status === 'fulfilled') setCard('Open found reports', found.value, 'Found item reports');
      else setCard('Open found reports', null, 'Found item reports unavailable');

      if (abuse.status === 'fulfilled') setCard('Reports awaiting review', abuse.value, 'Reports awaiting review');
      else setCard('Reports awaiting review', null, 'Reports awaiting review unavailable');

      // Profile RLS currently allows users to read only their own row. Never present
      // that restricted count as a community-wide member total.
      if (members.status === 'fulfilled' && members.value > 1) {
        setCard('Community members', members.value, 'Community members');
      } else {
        setCard('Community members', null, 'Community member total unavailable (profile RLS)');
      }

      const failed = results.some((result) => result.status === 'rejected');
      showStatus(failed
        ? 'Some totals could not be loaded. Confirm the item tables and admin RLS policies are installed.'
        : 'Counts updated just now.');
    } catch (error) {
      showStatus(error?.message || 'Unable to load dashboard counts.', true);
    } finally {
      loading = false;
    }
  }

  function watchStats() {
    if (!client.channel) return;
    realtimeChannel = client.channel('admin-dashboard-stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lost_items' }, loadStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'found_items' }, loadStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_reports' }, loadStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadStats)
      .subscribe();

    // Keep the overview fresh even if Realtime is not enabled for these tables.
    refreshTimer = window.setInterval(loadStats, REFRESH_INTERVAL_MS);
  }

  async function initialize() {
    try {
      client = getClient();
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (!(await requireAdministrator(client, data.session))) return;

      await loadStats();
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
    realtimeChannel?.unsubscribe();
    authSubscription?.unsubscribe();
  }

  window.addEventListener('pagehide', cleanup, { once: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
