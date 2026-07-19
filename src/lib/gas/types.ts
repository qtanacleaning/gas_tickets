export type PaymentType = "debit" | "credit";
export type UserRole = "admin" | "operator" | "client";

export type GasTicketStatus =
  | "submit_pending"
  | "submitted"
  | "already_invoiced"
  | "needs_review"
  | "failed";

export type GasReceiptStatus = "ocr_pending" | "processed" | "needs_review" | "failed";
export type CommissionStatus = "pending" | "paid";

export type ExtractedTicket = {
  folio: string;
  total: number;
  iva?: number;
  paymentType: PaymentType;
  ticketDate?: string;
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
  commissionStatus: CommissionStatus;
  commissionPaidAmount: number;
  clientCommission: number;
  clientCommissionStatus: CommissionStatus;
  clientCommissionPaidAmount: number;
  rfc: string;
  cfdi: string;
  paymentType: PaymentType;
  status: GasTicketStatus;
  errorMessage: string | null;
  petromayabConsumptionId: string | null;
  petromayabClientId: string | null;
  submittedAt: string | null;
  ticketDate: string;
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
  fiscalAddressLine1: string;
  fiscalAddressLine2: string;
  fiscalCity: string;
  fiscalState: string;
  fiscalPostalCode: string;
  fiscalCountry: string;
  phone: string;
  cfdiUse: string;
  active: boolean;
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

export type MonthlyTicketReport = {
  month: string;
  submittedCount: number;
  submittedTotal: number;
  ivaTotal: number;
  clientCommission: number;
  clientCommissionPaid: number;
};

export type CommissionSummary = {
  operatorId: string | null;
  operatorName: string;
  earnedAmount: number;
  paidAmount: number;
  pendingAmount: number;
  status: CommissionStatus;
};

export type RoleDashboard = {
  submittedThisMonth: number;
  ivaThisMonth: number;
  compensationWeek: number;
  compensationMonth: number;
  pendingPayments: number;
  clientCommissionMonth: number;
  clientCommissionPaidMonth: number;
};

export type SettlementKind = "operator_withdrawal" | "client_payment";

export type SettlementCandidate = {
  ticketId: string;
  entityId: string | null;
  entityName: string;
  folio: string;
  ticketDate: string;
  iva: number;
  amount: number;
};

export type GasNotificationRecord = {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
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
