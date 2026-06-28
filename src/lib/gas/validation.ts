import type { ExtractedTicket, PaymentType } from "@/lib/gas/types";

export type TicketInput = {
  folio: unknown;
  total: unknown;
  iva?: unknown;
  paymentType: unknown;
};

export type ValidationResult =
  | { ok: true; ticket: ExtractedTicket }
  | { ok: false; errors: string[] };

export function normalizePaymentType(value: unknown): PaymentType | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["credit", "credito", "tarjeta credito", "tarjeta de credito"].includes(normalized)) {
    return "credit";
  }
  if (["debit", "debito", "tarjeta debito", "tarjeta de debito"].includes(normalized)) {
    return "debit";
  }
  return null;
}

export function normalizeMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return roundCurrency(value);
  const normalized = String(value ?? "")
    .replace(/[$,\s]/g, "")
    .trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? roundCurrency(parsed) : null;
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function validateTicketInput(input: TicketInput): ValidationResult {
  const errors: string[] = [];
  const folio = String(input.folio ?? "").replace(/\D/g, "").trim();
  const total = normalizeMoney(input.total);
  const iva = normalizeMoney(input.iva);
  const paymentType = normalizePaymentType(input.paymentType);

  if (folio.length < 3 || folio.length > 12) errors.push("Folio must be 3 to 12 digits.");
  if (total === null) errors.push("Total must be a valid amount.");
  if (total !== null && (total < 10 || total > 50000)) {
    errors.push("Total is outside the expected range.");
  }
  if (!paymentType) errors.push("Payment type must be debit or credit.");

  if (errors.length > 0 || total === null || !paymentType) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    ticket: {
      folio,
      total,
      iva: iva ?? undefined,
      paymentType,
    },
  };
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(value);
}
