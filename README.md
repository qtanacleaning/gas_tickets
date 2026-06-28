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

- Admin: full control, manual tickets, queue review, and factura submission.
- Operator: log in with the name/PIN configured in environment variables or assigned by an admin, upload receipt photos, and see commission. Commission is calculated as 10% of the ticket IVA.
- Client: log in with the email/password configured in environment variables. Name, RFC, email, and tax regime are selected automatically from that account.

## Environment Accounts

Operators can be configured with either:

```env
OPERATOR_ACCOUNTS_JSON=[{"name":"Manuel","pin":"1234"}]
```

or:

```env
OPERATOR_1_NAME=Manuel
OPERATOR_1_PIN=1234
```

Clients can be configured with either:

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

When a client logs in, the app automatically uses that client's RFC and fiscal data for uploaded receipts.

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
- `GET /api/client-profile` - load the current client's fiscal profile
- `POST /api/client-profile` - save the current client's fiscal profile
- `GET /api/tickets` - list recent tickets
- `POST /api/tickets` - admin-only manual ticket creation
- `POST /api/tickets/upload` - upload a receipt image
- `POST /api/tickets/submit` - admin-only submit for one ticket or a small pending batch
- `GET /api/cron/ocr` - process queued receipt OCR
- `GET /api/cron/submit` - submit pending tickets

## Notes

The old Apps Script stored secrets directly in source and used a browser-side PIN. This project moves secrets into server-side environment variables and checks role access on the server before any ticket data or upload endpoint is available.
