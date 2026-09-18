# Supabase setup and launch checks

The owner approved free-plan setup on 15 September 2026. A dedicated James Massage Free project is running in Sydney. The schema and book function are deployed; origin configuration, rate-limit salt, public-signup restrictions and GitHub connection variables are set. Public availability reads and private-table denial checks passed. Function preflight, input-validation and disallowed-origin checks passed. The owner account is created and allowlisted. A rolled-back hosted transaction verified owner access, two weekly slots preserving 09:00 Melbourne across DST, remedial pricing, booked-slot exclusion, private/client session note updates and cancellation. Interactive owner login, browser booking submission and the remaining full smoke tests below still need verification.

The following procedure documents setup for a new, dedicated project; do not rerun the initial migration against the existing project. Never paste passwords or secret keys into chat, source code, frontend variables or GitHub repository files.

1. With owner approval, create a project; choose an Australian region if available. Review the current free-plan limits and inactivity pausing before relying on it for live bookings.
2. Run `supabase/migrations/202609150001_bookings.sql` once in the SQL editor, or apply it with the Supabase CLI. Database tests exercise this exact migration in local PostgreSQL (PGlite), but hosted setup still needs end-to-end verification.
3. In Auth, disable public sign-ups. Create the owner's user manually with a strong password and mark the email confirmed. There is no customer registration, email confirmation workflow, or automated password-reset email in this application. The owner can manage/reset access through Supabase's dashboard.
4. Add the owner's **Auth user UUID**, not email, to the admin allowlist through the SQL editor:

   ```sql
   insert into public.admins (user_id) values ('OWNER_AUTH_USER_UUID');
   ```

5. Deploy the `book` Edge Function with JWT verification disabled as specified in `supabase/config.toml`. Public customers do not need an account. The Edge Function is the only public write path; the underlying booking RPC only permits `service_role`.
6. Set Edge Function secrets:
   - `ALLOWED_ORIGINS`: comma-separated exact origins, e.g. `https://jamesmassage.com.au,https://www.jamesmassage.com.au`. A repository URL's origin excludes its path.
   - `BOOKING_RATE_SALT`: a randomly generated secret of at least 32 bytes. Used to hash rate-limit buckets; never sent to the browser.
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are normally supplied by Supabase. The service-role key must remain on the server.
7. Set **browser-safe** deployment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable key, or legacy anon key). These are intentionally public; database policies protect records. Never substitute a secret/service-role key. In GitHub Actions these are repository **Variables** under Settings → Secrets and variables → Actions → Variables.
8. Build/deploy again. Admin uses an allowlisted Supabase password login. Browser sessions are stored in sessionStorage, not persistent localStorage, so closing the tab clears the stored session.
9. Add real availability only after production smoke tests below pass. Configure the domain only after hosting eligibility has been resolved. No email address is invented or shown as a cancellation contact; cancellation emails have been removed from scope.

## Required hosted smoke test before launch

Use only explicitly designated test records, then remove them through the dashboard:

- Public user can read open times but cannot read any clients, appointments, notes or admin membership.
- A signed-in user absent from `admins` cannot read or change records.
- Owner can sign in, create/delete slots, read appointments and save both note types.
- Two requests for one slot produce exactly one booking. A retry with the same request UUID returns the same receipt.
- Booking prices cannot be changed by the client. Cancelling can keep the slot closed or reopen it.
- Weekly slots crossing daylight saving keep the chosen Melbourne wall-clock time.
- Booking errors and rate limits return useful messages, with no contact/health details in logs.
- Validate CORS against the deployed origin, and verify any forwarded-IP rate-limit header against the actual Supabase gateway. Per-contact throttling also applies; neither replaces stronger bot protection if abuse occurs.

## Retention and portability

Agree a record retention policy with the owner before collecting real intake/health data. Arrange periodic database backups/exports outside the public repository; backup availability depends on the Supabase plan. Client identity is matched by phone number alone, with Australian +61 and domestic formats normalised to the same number. The database enforces one client per phone number. The public form never updates existing identity/private notes. Correct or merge client records through the authenticated provider dashboard as needed.
