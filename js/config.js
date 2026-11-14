// Public browser configuration only. Never place service-role keys or database passwords here.
(() => {
  const config = Object.freeze({
    supabaseUrl: 'https://nmmqsfzfyqasptwkhecy.supabase.co',
    supabaseAnonKey: 'sb_publishable_bozxOQHqZSbqTQ-LkeTNAQ_B5PlfM7A',
    appName: 'Campus Connect',
    appVersion: '0.1.0',
    storageBucket: 'campus-connect',
  });
  const configScript = document.currentScript;
  const appBaseUrl = configScript ? new URL('../', configScript.src) : new URL('./', window.location.href);
  let client = null;
  let rememberSession = true;

  function configured() {
    return Boolean(config.supabaseUrl && config.supabaseAnonKey &&
      !config.supabaseUrl.includes('YOUR_SUPABASE') && !config.supabaseAnonKey.includes('YOUR_SUPABASE'));
  }

  function storageAdapter() {
    return {
      getItem(key) {
        try {
          return rememberSession
            ? (localStorage.getItem(key) ?? sessionStorage.getItem(key))
            : (sessionStorage.getItem(key) ?? localStorage.getItem(key));
        } catch { return null; }
      },
      setItem(key, value) {
        try {
          const destination = rememberSession ? localStorage : sessionStorage;
          const other = rememberSession ? sessionStorage : localStorage;
          destination.setItem(key, value);
          other.removeItem(key);
        } catch { /* Supabase reports storage failures through Auth operations. */ }
      },
      removeItem(key) {
        try { localStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
        try { sessionStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
      },
    };
  }

  function getClient() {
    if (!window.supabase?.createClient) {
      throw new Error('The Supabase client could not load. Check your internet connection and try again.');
    }
    if (!configured()) {
      throw new Error('Supabase is not configured. Add the project URL and public anon key in js/config.js.');
    }
    if (!client) {
      client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: storageAdapter(),
        },
      });
    }
    return client;
  }

  window.CAMPUS_CONNECT_CONFIG = config;
  window.CampusConnectSupabase = Object.freeze({
    getClient,
    setRememberSession(value) { rememberSession = Boolean(value); },
    appUrl(path = '') { return new URL(String(path).replace(/^\//, ''), appBaseUrl).href; },
  });

  // Compatibility for existing feature scripts; this is the same singleton returned by getClient().
  try { window.supabaseClient = getClient(); } catch { /* Pages show actionable errors when they need Supabase. */ }
})();
