const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';

window.CAMPUS_CONNECT_CONFIG = {
  supabaseUrl,
  supabaseAnonKey,
  appName: 'Campus Connect',
  appVersion: '0.1.0',
  authRedirectUrl: window.location.origin,
  storageBucket: 'campus-connect',
};
