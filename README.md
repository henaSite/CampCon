# Campus Connect

Campus Connect is a digital platform designed to connect members of a school community through a simple and accessible Lost and Found system. It helps users report missing belongings, share information about discovered items and communicate with one another to help return lost properties to their rightful owners.

## Phase 1 and Phase 2

The project currently provides a responsive public landing and the Supabase-backed authentication foundation:

- Mobile-first landing, registration, login, email recovery, and reset-password pages
- Five coordinated visual themes retained from Phase 1
- Supabase email/password registration and login, email verification, session persistence, logout, and secure email reset
- Database-triggered profile creation with unique E.164 phone numbers and user-only profile RLS
- Prepared real Supabase SMS OTP recovery for accounts with a verified Auth phone identity; no fake OTP flow

The authenticated dashboard, reports, comments, inbox, admin tools, and phone sign-in are later phases. The phone number in an email signup's profile metadata is not a verified Auth phone identity and is not sufficient for phone OTP recovery or phone login.

## Technologies

- HTML5, CSS3, Vanilla JavaScript
- Supabase Auth and PostgreSQL
- Vercel static hosting

## Run locally

1. Clone the repository and configure Supabase as documented in [Phase 2 Auth Setup](docs/phase2-auth.md).
2. Serve the repository root over HTTP, for example:

   ```bash
   python3 -m http.server 8000
   ```

3. Open `http://localhost:8000`. Auth redirects do not work from a `file://` URL.

## Supabase setup

- Add the project URL and public anon/publishable key to `js/config.js`. Never expose service-role keys or provider secrets.
- Apply `supabase/migrations/001_profiles.sql` and `supabase/migrations/002_auth_profile_security.sql` in order.
- Enable email/password Auth and email confirmation; configure allowed redirect URLs for `/pages/login.html` and `/pages/reset-password.html`.
- Configure production SMTP and email templates. For phone OTP, enable Phone Auth and configure an SMS provider and verified Auth phone identity first.
- Detailed setup, security details, testing instructions, and honest test-status notes are in [docs/phase2-auth.md](docs/phase2-auth.md).

## Deployment

Deploy the static site root to Vercel with no build step. Configure the public Supabase URL/key in `js/config.js`, set the production Supabase Site URL, and allow the deployed confirmation/reset redirect URLs. Use HTTPS in production.

## Scope

No Student Voice, complaints, or student suggestion system is included.
