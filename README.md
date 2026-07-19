# Gasolina Tickets

Standalone portal for uploading Petromayab gas receipts, extracting ticket data, and submitting pending tickets for factura.

This project includes:

- Next.js role-based UI for admins, operators, and clients
- Server-side session cookie for role access
- Supabase Postgres tables and private Storage bucket
- OCR adapter for Anthropic vision models
- Petromayab submission service
- Vercel cron routes for queued OCR and factura submission

## Setup

1. Copy `.env.example` to `.env.local`.
2. Rotate any key that was previously committed in Apps Script, especially the Anthropic key.
3. Create a Supabase project and run every SQL file in `supabase/migrations/` in order.
4. Fill in Supabase, role access, cron, OCR, and Petromayab env vars.
5. Deploy to Vercel and add `CRON_SECRET` to the cron request header as `Authorization: Bearer <secret>` if you call the endpoints manually.

## Roles

- Admin: manages operator and client accounts, manual tickets, the submission queue, monthly reports, and commission payments.
- Operator: logs in with a name/PIN, uploads receipts into the unassigned ticket pool, receives immediate OCR/resubmission feedback, and sees compensation. Compensation is 10% of IVA on successfully invoiced tickets.
- Client: logs in with the email/password created by an admin, maintains the fiscal profile used for facturacion, and sees monthly IVA and commission. Client commission is 30% of IVA on successfully invoiced tickets.

## Environment Accounts

Set `ADMIN_PASSWORD` for the administrator login. Existing installations that
still use the former `OPERATOR_PASSWORD` variable remain supported as a
temporary compatibility fallback.

Operators can be configured with either:

```env
OPERATOR_ACCOUNTS_JSON=[{"name":"Manuel","pin":"1234"}]
```

or:

```env
OPERATOR_1_NAME=Manuel
OPERATOR_1_PIN=1234
```

Client accounts should normally be created by an admin in the portal. Environment accounts remain supported as a migration fallback and can be configured with either:

```env
CLIENT_ACCOUNTS_JSON=[{"name":"Client Company","email":"client@example.com","password":"secret","rfc":"XAXX010101000","taxRegime":"601"}]
```

or:

```env
CLIENT_1_NAME=Client Company
CLIENT_1_EMAIL=client@example.com
CLIENT_1_PASSWORD=secret
CLIENT_1_RFC=XAXX010101000
CLIENT_1_TAX_REGIME=601
```

Operator receipts enter an unassigned pool. Admin assigns recognized tickets to clients before factura submission, and the app then submits the assigned client's RFC instead of a hardcoded RFC.

Operator withdrawals and client commission payments are manual for now. Admin selects specific successfully invoiced tickets, records the calculated movement, and locks those ticket amounts against duplicate settlement.

## Database updates

Run all migrations in `supabase/migrations/` in filename order. The July 2026 migrations add ticket dates, database-backed client credentials, fiscal profiles, notifications, monthly reporting, and ticket-locked settlement ledgers. Deploying the application code before both migrations will leave the new role workflows unavailable.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Main Endpoints

- `POST /api/session` - role login
- `DELETE /api/session` - logout
- `GET /api/operators` - admin-only operator list
- `POST /api/operators` - admin-only operator create/update with PIN
- `GET /api/clients` - admin-only client account list
- `POST /api/clients` - admin-only client account create/update
- `GET /api/client-profile` - load the current client's fiscal profile
- `POST /api/client-profile` - save the current client's fiscal profile
- `GET /api/tickets` - list recent tickets
- `POST /api/tickets` - admin-only manual ticket creation
- `POST /api/tickets/upload` - upload a receipt image
- `POST /api/tickets/submit` - admin-only submit for one ticket or a small pending batch
- `GET /api/reports/monthly` - role-scoped monthly submitted-ticket report
- `GET /api/dashboard` - operator/client role dashboard metrics
- `GET /api/notifications` - role-scoped notification feed
- `GET/POST /api/settlements` - admin ticket selection and manual withdrawal/payment recording
- `GET /api/commissions` - admin/operator commission balances
- `POST /api/commissions` - admin-only commission payment entry
- `GET /api/cron/ocr` - process queued receipt OCR
- `GET /api/cron/submit` - submit pending tickets

## Notes

The old Apps Script stored secrets directly in source and used a browser-side PIN. This project moves secrets into server-side environment variables and checks role access on the server before any ticket data or upload endpoint is available.
