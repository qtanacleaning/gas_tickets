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
- Operator: upload receipt photos and see commission. Commission is calculated as 10% of the ticket IVA.
- Client: save account data (name, RFC, email, tax regime) and upload receipts under that fiscal profile.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Main Endpoints

- `POST /api/session` - role login
- `DELETE /api/session` - logout
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
