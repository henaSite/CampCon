# Phase 2: Supabase authentication setup and verification

## Required project configuration

1. In `js/config.js`, set `supabaseUrl` to the Supabase Project URL and `supabaseAnonKey` to the public anon/publishable key. Never put a service-role key or database password in browser code.
2. Apply migrations in order: `001_profiles.sql`, then `002_auth_profile_security.sql`.
3. In Supabase Authentication, enable email/password and email confirmations.
4. Add these exact redirect destinations to the Auth URL allowlist (adjust host/port for your environment):
   - `http://localhost:8000/pages/login.html` (email confirmation)
   - `http://localhost:8000/pages/reset-password.html` (password recovery)
   - Your deployed origin plus `/pages/login.html` and `/pages/reset-password.html`.
5. Set the Supabase Site URL to the deployed HTTPS origin and configure a production SMTP provider and email templates. The default email service can be rate-limited.
6. Serve the project over HTTP(S), not `file://`.

The `profiles` row is created by a database trigger in the same transaction as the Auth user insert. Its `full_name` and E.164 phone are taken from signup metadata. The `phone` column has a unique constraint; duplicate phone signup fails rather than silently attaching it to another account. Email uniqueness and password hashing are managed by Supabase Auth.

## Authentication behaviors

- Sign-up is email/password with verification email. Auth may return no session until the user verifies email.
- Login currently uses email/password. A phone saved as signup metadata is not a verified Supabase Auth phone identity and cannot safely be used for password login.
- The remember checkbox selects persistent local storage (checked) or session storage (unchecked). Sign-out clears both client-side token stores through Supabase Auth.
- Session refresh and auth callback URL detection are handled by Supabase JS. Logged-in pages display a sign-out control; session status is restored on page load.
- Email recovery sends a generic confirmation message to avoid revealing whether an address exists. The reset page requires the recovery session from a valid, unexpired Supabase link before changing the password.
- Phone OTP recovery calls Supabase `signInWithOtp` with `shouldCreateUser: false`, verifies the SMS token, then updates the password only after Supabase returns an authenticated session. It does not generate or fake an OTP. This works only if the Auth user has that phone as a verified Supabase Auth phone identity; metadata-only phone numbers from email signup do not qualify.

## Phone OTP provider setup (optional, not tested here)

Enable Phone Auth in Supabase, configure a supported SMS provider (for example Twilio) and its secrets in Supabase dashboard only, configure rate limits, and use an Auth flow that verifies/links the phone number to the account. Test delivery and recovery using a real verified test number. Never put provider credentials in `js/config.js`.

## Phase 2 test checklist

Run from a local HTTP server after project configuration:

1. Register with a new email, unique E.164 number, and valid password; confirm the verification email and verify one `profiles` row exists for the Auth user.
2. Try a duplicate email and duplicate phone; both should fail without creating an extra profile.
3. Try invalid phone format, weak password, and mismatched confirmation; each should be blocked before Auth submission.
4. Log in with verified email; test remember checked across browser restart and unchecked after tab/session close.
5. Refresh a signed-in page, then log out and confirm the session ends.
6. Request an email reset, follow the link, set a valid password, then log in with it. Try an expired link and ensure password update is rejected.
7. Under anon and authenticated roles, verify profiles cannot be read by other users, anon has no access, and users cannot change id/created_at or write other users' rows.
8. Test phone OTP only after SMS provider and verified Auth phone are configured; verify no OTP is delivered when provider settings are absent.

## Results in this change

Repository-level source inspection only. No Supabase credentials, running Supabase project, SQL execution environment, browser automation, or SMS provider were available to execute live Auth/database/SMS tests. Therefore signup delivery, email confirmation, reset emails, persistent sessions against a real project, SQL migration execution, RLS behavior, and OTP delivery remain unverified until the checklist above is run in the configured project.
