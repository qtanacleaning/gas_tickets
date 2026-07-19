import type { ExtractedTicket, PaymentType } from "@/lib/gas/types";

export type TicketInput = {
  folio: unknown;
  total: unknown;
  iva?: unknown;
  paymentType: unknown;
  ticketDate?: unknown;
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

export function operatorCompensationFromIva(iva: number | null | undefined): number {
  return roundCurrency((iva ?? 0) * 0.10);
}

export function clientCommissionFromIva(iva: number | null | undefined): number {
  return roundCurrency((iva ?? 0) * 0.30);
}

export function normalizeTicketDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const match = raw.match(/^(\d{4})[-\/]([01]?\d)[-\/]([0-3]?\d)$/) ?? raw.match(/^([0-3]?\d)[-\/]([01]?\d)[-\/](\d{4})$/);
  if (!match) return null;

  const year = match[1].length === 4 ? Number(match[1]) : Number(match[3]);
  const month = Number(match[2]);
  const day = match[1].length === 4 ? Number(match[3]) : Number(match[1]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

export function validateTicketInput(input: TicketInput): ValidationResult {
  const errors: string[] = [];
  const folio = String(input.folio ?? "").replace(/\D/g, "").trim();
  const total = normalizeMoney(input.total);
  const iva = normalizeMoney(input.iva);
  const paymentType = normalizePaymentType(input.paymentType);
  const hasTicketDate = String(input.ticketDate ?? "").trim().length > 0;
  const ticketDate = normalizeTicketDate(input.ticketDate);

  if (folio.length < 3 || folio.length > 12) errors.push("Folio must be 3 to 12 digits.");
  if (total === null) errors.push("Total must be a valid amount.");
  if (total !== null && (total < 10 || total > 50000)) {
    errors.push("Total is outside the expected range.");
  }
  if (!paymentType) errors.push("Payment type must be debit or credit.");
  if (hasTicketDate && !ticketDate) errors.push("Ticket date must be a valid date.");

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
      ...(ticketDate ? { ticketDate } : {}),
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
