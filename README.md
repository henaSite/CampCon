# Campus Connect

Campus Connect is a digital platform designed to connect members of a school community through a simple and accessible Lost and Found system. It helps users report missing belongings, share information about discovered items and communicate with one another to help return lost properties to their rightful owners.

## Phase 1

This phase establishes the responsive public landing page and Supabase-backed account foundation:

- Mobile-first landing, registration, login, and password recovery pages
- Five coordinated themes persisted in the browser for this phase
- Supabase email/password sign-up and login, email verification, and secure email password reset
- A profile table bootstrap migration that enforces unique phone numbers and private row-level access
- Supabase configuration uses only the public project URL and anon key; never put the service-role key in browser code

The authenticated dashboard, phone-based login and OTP recovery, reports, messaging, admin tools, and account settings are later phases. The UI does not pretend those flows work yet. Email recovery is real once configured; phone OTP recovery is not simulated.

## Technologies

- HTML5, CSS3, Vanilla JavaScript
- Supabase Auth and PostgreSQL
- Vercel static hosting

## Project structure

```text
.
├── assets/logo.svg
├── css/styles.css
├── css/phase1-polish.css
├── docs/supabase-setup.md
├── js/app.js
├── js/auth.js
├── js/config.js
├── pages/forgot-password.html
├── pages/login.html
├── pages/register.html
├── pages/reset-password.html
└── supabase/migrations/001_profiles.sql
```

## Run locally

1. Clone the repository.
2. Complete the Supabase setup below.
3. Serve the repository root with a local static server. For example:

   ```bash
   python3 -m http.server 8000
   ```

4. Open `http://localhost:8000`.

Do not open pages with a `file://` URL: Auth redirects and browser storage require an HTTP origin.

## Supabase setup

1. Create a Supabase project.
2. In **Project Settings → API**, copy the project URL and the `anon`/publishable key into `js/config.js`. This key is public by design; row-level security is essential. Never use the `service_role` key in frontend code.
3. Run `supabase/migrations/001_profiles.sql` in the Supabase SQL Editor, or apply it using the Supabase CLI.
4. In **Authentication → URL Configuration**, add the local URL and deployed site URL to the allowed redirect URLs. Set the Site URL to your production address. For local reset redirects, allow `http://localhost:8000/pages/reset-password.html`; also allow the deployed `/pages/reset-password.html` URL.
5. Keep email/password authentication enabled and require email confirmation. Configure the email templates and SMTP provider for production deliverability; Supabase's default email service is rate limited.
6. Confirm the email confirmation and recovery redirect templates return users to the configured site URLs.
7. Optional production configuration: configure a custom SMTP provider. Phone OTP is not part of this phase and requires Supabase phone auth plus a supported SMS provider (such as Twilio) and a verified-phone account flow in a later phase.

The `profiles` trigger reads `full_name` and `phone` from signup metadata. The table keeps the phone number behind RLS so it is not publicly readable. Duplicate phone numbers are rejected by the database unique constraint. A user can select/read/update only their own profile under the included policies.

## Configuration

`js/config.js` contains public placeholders. Replace them with your Supabase project URL and anon/publishable key. These are not secrets. Do not commit credentials beyond the public anon key; never expose database passwords, service-role keys, or SMTP/SMS provider secrets. Production secrets belong in Supabase/Vercel server-side configuration.

## Deploy to Vercel

1. Import the GitHub repository into Vercel.
2. Use the repository root as the project root and deploy as a static site; no build command is required.
3. Add the production domain to Supabase Auth's allowed redirect URLs and set the Supabase Site URL.
4. Configure `js/config.js` with the public Supabase URL and anon key before deployment. (A later deployment phase can replace this static file with a safe public runtime config endpoint.)
5. Test sign-up confirmation, login, reset email, and password update on the deployed HTTPS origin.

## Current limitations / external setup

- Supabase project URL/key, SQL migration, email confirmation, SMTP, and redirect allowlist must be configured by the project owner.
- Email/password authentication and email recovery require those settings; forms display a configuration error rather than simulating success.
- Phone numbers are collected and stored uniquely, but login by phone and phone OTP password recovery require a verified Auth phone identity and SMS provider integration, planned for a later phase.
- Profile email is held by Supabase Auth; the profile table intentionally does not duplicate private email data.
- No Student Voice, complaints, or suggestion system is included.
