# Data boundaries

Public source contains only application code, assets, placeholder environment variable names, and explicitly fictional sample data using `example.com`. No real client information, private notes, admin password, service-role key or precise treatment location is committed.

## Access

- Public reads use `available_slots()`, which returns only IDs and start/end timestamps.
- Every table enables row-level security. Anonymous users have no table grants.
- Authenticated users can read records only if their Auth UUID is allowlisted in `admins`.
- Browser update permissions are restricted to the two private-notes columns. Slot mutations and cancellation use admin-checked database functions.
- Public booking writes go through the Edge Function and a server-only transaction. Slot row locks and a partial unique index prevent duplicate confirmed bookings.
- A database exclusion constraint prevents overlapping active slots. A recurring series is added atomically; one overlap rolls back the entire addition.
- Server code validates consent, names, contact details, treatment and text lengths. Prices are server-defined.
- Idempotency UUIDs permit safe retries without duplicating appointments. Receipts contain no client identity or health data.
- Rate-limit keys are salted hashes with limited retention, not stored raw IP/email values. The Edge Function does not log request bodies.
- Notes are rendered as text by React, never as HTML. Calendar content uses fixed labels and server-generated references, and omits contact/health/private-note fields.
- Demo mode is restricted to loopback hostnames and disabled when a backend is configured. Demo data is memory-only.

## Validation limits

Automated tests execute the actual migration in local PostgreSQL (PGlite) with anonymous, ordinary authenticated, admin and service roles. They cover access policies, server price, retries, uniqueness, recurring DST transitions, overlaps, cancellations and note separation. Local tests do not establish that a future hosted Supabase project's settings/secrets/CORS are correct; complete the hosted smoke tests in BACKEND.md before launch.

The owner approved and created a Supabase Free project in Sydney; no paid plan was selected. Free-tier quotas and backend backups must be reviewed at setup. A public GitHub repository is not a location for client data even if the website's admin interface requires a login.
