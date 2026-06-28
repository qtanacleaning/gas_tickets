import { describe, expect, it } from "vitest";
import { extractAllTicketsFromText } from "@/lib/gas/ocr";

describe("fallback OCR text parser", () => {
  it("extracts multiple receipt blocks from OCR text", () => {
    const text = `
Folio: 2770441
Tipo de Pago:
Tarjeta Debito
Total: $1,075.60
IVA 16%: $144.38

Folio: 2770555
Tipo de Pago: Tarjeta Credito
Total: $800.00
IVA 16%: $110.34
`;

    expect(extractAllTicketsFromText(text)).toEqual([
      { folio: "2770441", total: 1075.6, iva: 144.38, paymentType: "debit" },
      { folio: "2770555", total: 800, iva: 110.34, paymentType: "credit" },
    ]);
  });
});
