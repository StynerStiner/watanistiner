# Watani Stiner Website — Project Rules

## CSP (Content Security Policy) — CRITICAL

When adding images, scripts, fonts, or any content from a **new external domain**, you MUST update the CSP header in `vercel.json` or the content will be silently blocked.

### Current CSP whitelist:

**img-src (images):**
- `'self'` — local images
- `https://img.youtube.com` — YouTube thumbnails
- `https://pub-764d2f0e01a94716a648a3e4fdc92cf6.r2.dev` — R2 CDN (our hosted images)
- `https://i.mcdn.cc` — image CDN
- `https://*.stripe.com` — Stripe
- `https://cdn-images-1.medium.com` — Medium article images
- `https://miro.medium.com` — Medium article images
- `data:` — inline data URIs

**script-src (scripts):**
- `'self'`, `'unsafe-inline'`, `'unsafe-eval'`
- `https://js.stripe.com`

**style-src (stylesheets):**
- `'self'`, `'unsafe-inline'`
- `https://fonts.googleapis.com`

**font-src (fonts):**
- `'self'`
- `https://fonts.gstatic.com`

**connect-src (API/fetch calls):**
- `'self'`
- `https://formsubmit.co`
- `https://api.stripe.com`

**form-action (form submissions):**
- `'self'`
- `https://formsubmit.co`
- `https://checkout.stripe.com`

### How to update:
Edit the `Content-Security-Policy` header value in `vercel.json` → `headers` array. Add the new domain to the appropriate directive.

## Vercel Configuration

This is a **static HTML site** with serverless API functions in `/api/`. The `vercel.json` MUST keep these settings to prevent 404 errors:
```json
"buildCommand": "",
"outputDirectory": ".",
"framework": null
```
Do NOT remove these — they prevent Vercel from treating the site as a Node.js app.

## API Endpoints

- `POST /api/submit` — Grant application submission (saves to Google Sheets, emails via FormSubmit, creates Stripe Checkout session)
- `POST /api/stripe-webhook` — Stripe webhook (updates payment status in Google Sheets)

## Environment Variables (Vercel)

- `STRIPE_SECRET_KEY` — Stripe API secret key
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` — Google Cloud service account for Sheets API
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` — Private key for Sheets API
- `GOOGLE_SHEET_ID` — Google Sheet ID for grant applications
- `FORMSUBMIT_URL` — FormSubmit.co endpoint for email notifications

## Mobile Navbar

All pages use a shared mobile navbar pattern:
- Fixed top bar with "WATANI STINER" and hamburger menu
- Dropdown panel (not fullscreen overlay)
- "CLOSE" text label replaces hamburger when open
- Mobile page title shown below topbar
- Desktop nav is completely separate and unchanged

When adding new pages, copy the mobile topbar HTML + CSS from any existing page.

## Grant Application Fee Mapping

- $15: The Watani Fund, The Liberation Builders Grant, The COINTELPRO Survivors Grant
- $10: The Stiner Legacy Grant, The Watani Freedom Fund, The Watani Stiner Scholarship

These are defined in `api/submit.js` in the `GRANT_CONFIG` object AND in the `<select>` dropdown in `apply.html`. Both must stay in sync.

## Security Headers

All security headers are set in `vercel.json`. Do not remove any of them:
- Content-Security-Policy
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection
- Referrer-Policy
- Permissions-Policy
- Strict-Transport-Security (HSTS)

## DNS

- Domain managed on Cloudflare
- A record `@` → `76.76.21.21` (Vercel)
- CNAME `www` → Vercel DNS
- SSL: Full (strict)
- DNSSEC: Enabled
