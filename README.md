# Campus Connect

Campus Connect is a platform designed to connect members of a school community through a simple and accessible Lost & Found system.

## Overview

This repository contains the initial Phase 1 implementation for Campus Connect, including:

- A responsive landing page
- Registration page
- Login page
- Forgot password page
- Global design system with five application themes
- Basic branding assets
- Supabase configuration placeholders

## Tech stack

- HTML5
- CSS3
- Vanilla JavaScript
- Supabase (planned integration)
- Vercel (deployment target)

## Project structure

- `index.html` – landing page
- `pages/register.html` – registration page
- `pages/login.html` – login page
- `pages/forgot-password.html` – password recovery page
- `css/styles.css` – shared styles and layout
- `js/app.js` – app behavior and theme handling
- `js/config.js` – Supabase environment placeholders
- `assets/logo.svg` – app logo

## Setup

1. Clone the repository.
2. Update `js/config.js` with your real Supabase project URL and anon key.
3. Serve the site locally using a static web server.
4. Deploy to Vercel as a static site or frontend root.

Example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Supabase configuration required

Before full backend functionality is enabled, configure the following in Supabase:

- Authentication providers
- Email recovery settings
- SMS/OTP provider for phone recovery
- Storage buckets for profile photos and item images
- Database tables and Row Level Security policies
- Realtime for inbox messaging

## Notes

This Phase 1 implementation is a clean frontend foundation. It does not replace the required Supabase backend and database configuration, which must be completed before production use.
