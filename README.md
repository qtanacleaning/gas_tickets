# Qtana Gas Tickets

Standalone operator portal for uploading Petromayab gas receipts, extracting ticket data, and submitting pending tickets for factura.

This replaces the Google Apps Script flow with:

- Next.js operator UI
- Server-side session cookie for operators
- Supabase Postgres tables and private Storage bucket
- OCR adapter for Anthropic vision models
- Petromayab submission service
- Vercel cron routes for queued OCR and factura submission

## Setup

1. Copy `.env.example` to `.env.local`.
2. Rotate any key that was previously committed in Apps Script, especially the Anthropic key.
3. Create a Supabase project and run `supabase/migrations/20260627000000_create_gas_ticket_portal.sql`.
4. Fill in Supabase, operator, cron, OCR, and Petromayab env vars.
5. Deploy to Vercel and add `CRON_SECRET` to the cron request header as `Authorization: Bearer <secret>` if you call the endpoints manually.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Main Endpoints

- `POST /api/session` - operator login
- `DELETE /api/session` - logout
- `GET /api/tickets` - list recent tickets
- `POST /api/tickets` - create a manual ticket
- `POST /api/tickets/upload` - upload a receipt image
- `POST /api/tickets/submit` - submit one ticket or a small pending batch
- `GET /api/cron/ocr` - process queued receipt OCR
- `GET /api/cron/submit` - submit pending tickets

## Notes

The old Apps Script stored secrets directly in source and used a browser-side PIN. This project moves secrets into server-side environment variables and checks operator access on the server before any ticket data or upload endpoint is available.
