export type PaymentType = "debit" | "credit";
export type UserRole = "admin" | "operator" | "client";

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
  clientId: string | null;
  clientName?: string | null;
  operatorId: string | null;
  operatorName: string | null;
  folio: string;
  referencia: string;
  importeTotal: number;
  iva: number | null;
  operatorCommission: number;
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
  clientId: string | null;
  operatorId: string | null;
  fileName: string;
  storagePath: string | null;
  mimeType: string;
  uploadedBy: string | null;
  operatorName: string | null;
  status: GasReceiptStatus;
  extractedCount: number;
  errorMessage: string | null;
  createdAt: string;
};

export type GasClientRecord = {
  id: string;
  name: string;
  rfc: string;
  email: string;
  taxRegime: string;
  createdAt: string;
  updatedAt: string;
};

export type GasOperatorRecord = {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EnvOperatorAccount = {
  name: string;
  pin: string;
};

export type EnvClientAccount = {
  name: string;
  email: string;
  password: string;
  rfc: string;
  taxRegime: string;
};
