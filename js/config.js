// Public browser configuration only. The anon key is intended for client use; protect data with RLS.
window.CAMPUS_CONNECT_CONFIG = Object.freeze({
  supabaseUrl: 'YOUR_SUPABASE_PROJECT_URL',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
  appName: 'Campus Connect',
  appVersion: '0.1.0',
  storageBucket: 'campus-connect',
});
