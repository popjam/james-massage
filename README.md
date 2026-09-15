# James Massage

A mobile-friendly massage booking flow and private practice dashboard. Light blue, a single central booking card, and a small hand-drawn illustration.

## Current status

The website and Supabase integration are implemented. No production backend, real availability, clients, admin account or email service is provisioned. Without backend configuration, public visitors see **Bookings are opening soon** at the time-selection step. On localhost only, a labelled in-memory demo allows the full customer and admin flows to be tested. Demo records disappear on refresh and must never contain real health information.

### Included

- Relaxation: 60 minutes / A$100. Remedial: 60 minutes / A$120.
- Available dates and times, Melbourne timezone including daylight saving.
- Brief booking form, consent, remedial focus areas, on-screen confirmation.
- Optional Google Calendar link and Apple/Outlook calendar download; no emails.
- Admin password login, upcoming/past/cancelled appointments, client history.
- Private per-client notes and separate private per-session notes.
- Individual slots or weekly series (up to 104 weeks per addition), individual exceptions, overlap prevention.
- Atomic booking, idempotent retries, server-controlled prices, rate limits and database access policies.

## Development outside a cloud-synced folder

Keep the **working copy, `node_modules`, `dist`, `.git` and secrets outside Google Drive**. A source-only mirror can be kept in a synced project folder. `.gitignore` does not prevent Google Drive syncing.

In an unsynced directory:

```sh
npm ci
npm run dev
npm test
npm run build
```

Use Node.js 22.18+ or newer. Open the localhost address printed by Vite. Admin is `#admin`.

## Hosting

`.github/workflows/pages.yml` builds/tests the static site and deploys only `dist`. Paths are relative so a repository Pages URL works without a custom domain. The private server source and tests are never included in the deployed static artifact (they may be visible as source if the repository is public).

**Hosting restriction:** GitHub Pages documents restrictions on sites primarily facilitating commercial transactions. This repository is prepared for Pages at the owner's request, but an unrestricted host should be selected before activating real business bookings. The static build can also be hosted by Cloudflare Pages. No domain DNS changes have been made.

See [backend setup](docs/BACKEND.md), [data protection and verification](docs/SECURITY.md), and [artwork prompt](docs/ARTWORK.md).
