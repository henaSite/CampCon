# Supabase setup checklist

## Phase 1 project requirements

- Create a Supabase project and copy its Project URL and public anon/publishable key into `js/config.js`.
- Apply `supabase/migrations/001_profiles.sql`.
- Enable email/password sign-up and require email confirmation.
- Configure the Site URL plus local and production auth redirect allowlists.
- Configure an SMTP provider and auth email templates before production use.
- Test verification links and reset links on both localhost and the deployed HTTPS domain.

## Security notes

- Browser code may contain only the project URL and public anon/publishable key.
- Never expose the service-role key, database password, SMTP credentials, or SMS provider secrets.
- The profile table has RLS enabled and grants users access only to their own row. The profile bootstrap trigger is a narrowly scoped security-definer function with a fixed search path.
- Keep phone details private by default. Public profile fields and cross-user visibility require carefully scoped RLS policies in a later migration.

## Phone authentication/recovery (not enabled in Phase 1)

The initial registration flow verifies email and stores a unique phone number in the private profile record; it does not claim the phone is verified. Do not enable phone password recovery until the app has a verified phone identity flow, an SMS provider configured in Supabase Auth, rate limits, and a recovery flow tested end to end. Do not replace this with a locally generated or simulated OTP.
