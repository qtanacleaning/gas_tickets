import { describe, expect, it } from "vitest";
import {
  clientCommissionFromIva,
  normalizePaymentType,
  normalizeTicketDate,
  operatorCompensationFromIva,
  validateTicketInput,
} from "@/lib/gas/validation";

describe("gas ticket validation", () => {
  it("normalizes Spanish payment labels", () => {
    expect(normalizePaymentType("Tarjeta Credito")).toBe("credit");
    expect(normalizePaymentType("Tarjeta Debito")).toBe("debit");
  });

  it("accepts a valid ticket", () => {
    const result = validateTicketInput({
      folio: "2770441",
      total: "$1,075.60",
      iva: "144.38",
      paymentType: "Debit",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket.total).toBe(1075.6);
      expect(result.ticket.paymentType).toBe("debit");
    }
  });

  it("rejects implausible totals", () => {
    const result = validateTicketInput({
      folio: "2770441",
      total: "2.50",
      paymentType: "Debit",
    });

    expect(result.ok).toBe(false);
  });

  it("normalizes Mexican ticket dates", () => {
    expect(normalizeTicketDate("14/07/2026")).toBe("2026-07-14");
    expect(normalizeTicketDate("2026-07-14")).toBe("2026-07-14");
    expect(normalizeTicketDate("31/02/2026")).toBeNull();
  });

  it("calculates operator and client amounts from IVA", () => {
    expect(operatorCompensationFromIva(144.38)).toBe(14.44);
    expect(clientCommissionFromIva(144.38)).toBe(43.31);
  });
});
