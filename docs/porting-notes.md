# Apps Script Porting Notes

## What Moved

The original Apps Script had four responsibilities in one file:

- Drive watcher and OCR pipeline
- Google Sheet queue
- Petromayab session, ticket lookup, and invoice creation
- Public upload page with a client-side PIN

The standalone app splits those into production services:

- `src/lib/gas/ocr.ts` handles image OCR and regex fallback parsing.
- `src/lib/gas/petromayab.ts` handles Petromayab session, CSRF, ticket lookup, and factura creation.
- `src/lib/gas/repository.ts` stores receipts, tickets, and attempts in Supabase.
- `src/lib/gas/workflows.ts` orchestrates upload, OCR, manual entry, and submission.
- `src/app/api/**/route.ts` exposes thin HTTP route handlers.
- `src/components/OperatorPortal.tsx` is the operator surface.

## Data Model

`gas_receipts` replaces the Google Drive root folder plus Processed/Errors folders.

`gas_tickets` replaces the Tickets sheet.

`gas_ticket_attempts` replaces Apps Script logs and gives a durable audit trail for OCR and factura attempts.

## Security Changes

- No Anthropic key in source.
- No Petromayab constants in browser code.
- No browser-side PIN.
- Private Supabase Storage bucket.
- Server-side route guards for operator endpoints.
- Separate cron secret for automation endpoints.

## Remaining Production Choices

- Replace shared operator password with Supabase Auth if each operator needs identity and per-user audit logs.
- Add email or WhatsApp summaries if the old Apps Script summary emails are still useful.
- Add a review screen for low-confidence OCR once real receipt examples are available.
