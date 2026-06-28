export type PaymentType = "debit" | "credit";

export type GasTicketStatus =
  | "submit_pending"
  | "submitted"
  | "already_invoiced"
  | "needs_review"
  | "failed";

export type GasReceiptStatus = "ocr_pending" | "processed" | "needs_review" | "failed";

export type ExtractedTicket = {
  folio: string;
  total: number;
  iva?: number;
  paymentType: PaymentType;
};

export type GasTicketRecord = {
  id: string;
  receiptId: string | null;
  folio: string;
  referencia: string;
  importeTotal: number;
  iva: number | null;
  rfc: string;
  cfdi: string;
  paymentType: PaymentType;
  status: GasTicketStatus;
  errorMessage: string | null;
  petromayabConsumptionId: string | null;
  petromayabClientId: string | null;
  submittedAt: string | null;
  createdAt: string;
  receiptFileName?: string | null;
};

export type GasReceiptRecord = {
  id: string;
  fileName: string;
  storagePath: string | null;
  mimeType: string;
  uploadedBy: string | null;
  status: GasReceiptStatus;
  extractedCount: number;
  errorMessage: string | null;
  createdAt: string;
};
