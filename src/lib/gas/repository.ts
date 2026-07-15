import "server-only";

import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppEnv } from "@/lib/env";
import type { AppSession } from "@/lib/auth";
import type {
  CommissionSummary,
  ExtractedTicket,
  GasClientRecord,
  GasOperatorRecord,
  GasReceiptRecord,
  GasReceiptStatus,
  GasTicketRecord,
  GasTicketStatus,
  MonthlyTicketReport,
} from "@/lib/gas/types";

type TicketRow = {
  id: string;
  client_id?: string | null;
  receipt_id: string | null;
  operator_id?: string | null;
  operator_name?: string | null;
  folio: string;
  referencia: string;
  importe_total: string | number;
  iva: string | number | null;
  operator_commission?: string | number | null;
  commission_status?: "pending" | "paid";
  commission_paid_amount?: string | number | null;
  rfc: string;
  cfdi: string;
  payment_type: "debit" | "credit";
  status: GasTicketStatus;
  error_message: string | null;
  petromayab_consumption_id: string | null;
  petromayab_client_id: string | null;
  submitted_at: string | null;
  ticket_date?: string | null;
  created_at: string;
  gas_receipts?: { file_name: string | null } | { file_name: string | null }[] | null;
};

type ReceiptRow = {
  id: string;
  client_id?: string | null;
  operator_id?: string | null;
  file_name: string;
  storage_path: string | null;
  mime_type: string;
  uploaded_by: string | null;
  operator_name?: string | null;
  status: GasReceiptStatus;
  extracted_count: number;
  error_message: string | null;
  created_at: string;
};

type ClientRow = {
  id: string;
  name: string;
  rfc: string;
  email: string;
  tax_regime: string;
  password_hash?: string | null;
  active?: boolean;
  created_at: string;
  updated_at: string;
};

type OperatorRow = {
  id: string;
  name: string;
  name_key: string;
  pin_hash: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

function mapReceipt(row: ReceiptRow): GasReceiptRecord {
  return {
    id: row.id,
    clientId: row.client_id ?? null,
    operatorId: row.operator_id ?? null,
    fileName: row.file_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    uploadedBy: row.uploaded_by,
    operatorName: row.operator_name ?? row.uploaded_by ?? null,
    status: row.status,
    extractedCount: row.extracted_count,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

function firstReceiptName(row: TicketRow): string | null {
  const receipt = row.gas_receipts;
  if (Array.isArray(receipt)) return receipt[0]?.file_name ?? null;
  return receipt?.file_name ?? null;
}

function mapClient(row: ClientRow): GasClientRecord {
  return {
    id: row.id,
    name: row.name,
    rfc: row.rfc,
    email: row.email,
    taxRegime: row.tax_regime,
    active: row.active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOperator(row: OperatorRow): GasOperatorRecord {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTicket(row: TicketRow, clientName?: string | null): GasTicketRecord {
  const iva = row.iva === null ? null : Number(row.iva);
  const storedCommission = row.operator_commission == null ? null : Number(row.operator_commission);

  return {
    id: row.id,
    clientId: row.client_id ?? null,
    clientName: clientName ?? null,
    receiptId: row.receipt_id,
    operatorId: row.operator_id ?? null,
    operatorName: row.operator_name ?? null,
    folio: row.folio,
    referencia: row.referencia,
    importeTotal: Number(row.importe_total),
    iva,
    operatorCommission: storedCommission && storedCommission > 0 ? storedCommission : commissionFromIva(iva ?? undefined),
    commissionStatus: row.commission_status ?? "pending",
    commissionPaidAmount: Number(row.commission_paid_amount ?? 0),
    rfc: row.rfc,
    cfdi: row.cfdi,
    paymentType: row.payment_type,
    status: row.status,
    errorMessage: row.error_message,
    petromayabConsumptionId: row.petromayab_consumption_id,
    petromayabClientId: row.petromayab_client_id,
    submittedAt: row.submitted_at,
    ticketDate: row.ticket_date ?? row.created_at.slice(0, 10),
    createdAt: row.created_at,
    receiptFileName: firstReceiptName(row),
  };
}

function commissionFromIva(iva: number | undefined): number {
  return Math.round((iva ?? 0) * 10) / 100;
}

function operatorNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function hashOperatorPin(pin: string): string {
  const { sessionSecret } = getAppEnv();
  return crypto.createHmac("sha256", sessionSecret).update(pin.trim()).digest("base64url");
}

function hashClientPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(password, salt, 32).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

function verifyClientPasswordHash(password: string, storedHash: string): boolean {
  const [algorithm, salt, encodedHash] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !encodedHash) return false;
  const expected = Buffer.from(encodedHash, "base64url");
  const received = crypto.scryptSync(password, salt, expected.length);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function missingSchemaColumn(error: { message?: string } | null, tableName: string): string | null {
  if (!error?.message) return null;
  const match = error.message.match(/Could not find the '([^']+)' column of '([^']+)' in the schema cache/i);
  return match?.[2] === tableName ? match[1] : null;
}

export async function uploadReceiptFile(file: File, storagePath: string): Promise<void> {
  const env = getAppEnv();
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(env.receiptBucket).upload(storagePath, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });

  if (error) throw new Error(`Receipt upload failed: ${error.message}`);
}

export async function downloadReceiptFile(storagePath: string): Promise<Blob> {
  const env = getAppEnv();
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(env.receiptBucket).download(storagePath);

  if (error || !data) throw new Error(`Receipt download failed: ${error?.message ?? "No file returned"}`);
  return data;
}

export async function createReceipt(input: {
  fileName: string;
  storagePath: string;
  mimeType: string;
  uploadedBy?: string;
  operatorId?: string | null;
  operatorName?: string;
  clientId?: string | null;
}): Promise<GasReceiptRecord> {
  const supabase = createAdminClient();
  const payload: Record<string, unknown> = {
    file_name: input.fileName,
    storage_path: input.storagePath,
    mime_type: input.mimeType,
    uploaded_by: input.uploadedBy || input.operatorName || null,
    operator_id: input.operatorId ?? null,
    operator_name: input.operatorName || input.uploadedBy || null,
    client_id: input.clientId ?? null,
    status: "ocr_pending",
  };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase.from("gas_receipts").insert(payload).select("*").single();

    if (!error) return mapReceipt(data as ReceiptRow);

    const missingColumn = missingSchemaColumn(error, "gas_receipts");
    if (missingColumn && Object.hasOwn(payload, missingColumn)) {
      delete payload[missingColumn];
      continue;
    }

    throw new Error(`Receipt insert failed: ${error.message}`);
  }

  throw new Error("Receipt insert failed: Supabase schema is missing required receipt columns.");
}

export async function updateReceipt(
  id: string,
  patch: {
    status?: GasReceiptStatus;
    extractedCount?: number;
    errorMessage?: string | null;
  },
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("gas_receipts")
    .update({
      status: patch.status,
      extracted_count: patch.extractedCount,
      error_message: patch.errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(`Receipt update failed: ${error.message}`);
}

export async function getReceiptById(id: string): Promise<GasReceiptRecord | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("gas_receipts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Receipt lookup failed: ${error.message}`);
  return data ? mapReceipt(data as ReceiptRow) : null;
}

export async function listReceiptsForOcr(limit = 10): Promise<GasReceiptRecord[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gas_receipts")
    .select("*")
    .eq("status", "ocr_pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Receipt queue lookup failed: ${error.message}`);
  return ((data ?? []) as ReceiptRow[]).map(mapReceipt);
}

export async function createTicket(input: {
  receiptId?: string | null;
  clientId?: string | null;
  operatorId?: string | null;
  operatorName?: string | null;
  client?: GasClientRecord | null;
  ticket: ExtractedTicket;
  status?: GasTicketStatus;
}): Promise<GasTicketRecord> {
  const env = getAppEnv();
  if (!input.client?.id || !input.client.rfc) {
    throw new Error("A client account is required before a ticket can be created.");
  }
  const rfc = input.client.rfc;
  const cfdi = "Gastos en General";
  const supabase = createAdminClient();
  const payload: Record<string, unknown> = {
    receipt_id: input.receiptId ?? null,
    client_id: input.clientId ?? input.client?.id ?? null,
    operator_id: input.operatorId ?? null,
    operator_name: input.operatorName ?? null,
    folio: input.ticket.folio,
    referencia: env.petromayabReferencia,
    importe_total: input.ticket.total,
    iva: input.ticket.iva ?? null,
    operator_commission: commissionFromIva(input.ticket.iva),
    ticket_date: input.ticket.ticketDate ?? new Date().toISOString().slice(0, 10),
    rfc,
    cfdi,
    payment_type: input.ticket.paymentType,
    status: input.status ?? "submit_pending",
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from("gas_tickets")
      .insert(payload)
      .select("*, gas_receipts(file_name)")
      .single();

    if (!error) return mapTicket(data as TicketRow, input.client?.name ?? null);

    if (error.code === "23505") {
      throw new Error(`Duplicate ticket: folio ${input.ticket.folio} for ${input.ticket.total}`);
    }

    const missingColumn = missingSchemaColumn(error, "gas_tickets");
    if (missingColumn && Object.hasOwn(payload, missingColumn)) {
      delete payload[missingColumn];
      continue;
    }

    throw new Error(`Ticket insert failed: ${error.message}`);
  }

  throw new Error("Ticket insert failed: Supabase schema is missing required ticket columns.");
}

async function loadClientNames(clientIds: string[]): Promise<Map<string, string>> {
  if (clientIds.length === 0) return new Map();

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("gas_clients").select("id, name").in("id", clientIds);
  if (error) throw new Error(`Client lookup failed: ${error.message}`);

  return new Map(((data ?? []) as Array<{ id: string; name: string | null }>).map((row) => [row.id, row.name ?? ""]));
}

async function mapTicketsWithClients(rows: TicketRow[]): Promise<GasTicketRecord[]> {
  const clientIds = [...new Set(rows.map((row) => row.client_id).filter((value): value is string => Boolean(value)))];
  const clientNames = await loadClientNames(clientIds);
  return rows.map((row) => mapTicket(row, row.client_id ? clientNames.get(row.client_id) ?? null : null));
}

export async function listTickets(limit = 50, session?: AppSession): Promise<GasTicketRecord[]> {
  const supabase = createAdminClient();
  const buildBaseQuery = () =>
    supabase
      .from("gas_tickets")
      .select("*, gas_receipts(file_name)")
      .not("status", "in", "(submitted,already_invoiced)")
      .order("created_at", { ascending: false })
      .limit(limit);

  let query = buildBaseQuery();

  if (session?.role === "operator") {
    if (session.operatorId) {
      query = query.eq("operator_id", session.operatorId);
    } else if (session.name) {
      query = query.eq("operator_name", session.name);
    }
  }

  if (session?.role === "client") {
    query = query.eq("client_id", session.clientId ?? "00000000-0000-0000-0000-000000000000");
  }

  let { data, error } = await query;

  // Older live databases may not have operator/client columns yet.
  if (error && session?.role === "operator" && /operator_(id|name)/i.test(error.message)) {
    ({ data, error } = await buildBaseQuery());
  }

  if (error) throw new Error(`Ticket lookup failed: ${error.message}`);
  return mapTicketsWithClients((data ?? []) as TicketRow[]);
}

export async function getTicketById(id: string): Promise<GasTicketRecord | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gas_tickets")
    .select("*, gas_receipts(file_name)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Ticket lookup failed: ${error.message}`);
  if (!data) return null;
  const row = data as TicketRow;
  const clientName = row.client_id ? (await loadClientNames([row.client_id])).get(row.client_id) ?? null : null;
  return mapTicket(row, clientName);
}

export async function getPendingTickets(limit = 25): Promise<GasTicketRecord[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gas_tickets")
    .select("*, gas_receipts(file_name)")
    .eq("status", "submit_pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Pending ticket lookup failed: ${error.message}`);
  return mapTicketsWithClients((data ?? []) as TicketRow[]);
}

export async function getClientByEmail(email: string): Promise<GasClientRecord | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gas_clients")
    .select("*")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`Client lookup failed: ${error.message}`);
  return data ? mapClient(data as ClientRow) : null;
}

export async function getClientById(id: string): Promise<GasClientRecord | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("gas_clients").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Client lookup failed: ${error.message}`);
  return data ? mapClient(data as ClientRow) : null;
}

export async function upsertClient(input: {
  name: string;
  rfc: string;
  email: string;
  taxRegime: string;
}): Promise<GasClientRecord> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gas_clients")
    .upsert(
      {
        name: input.name.trim(),
        rfc: input.rfc.trim().toUpperCase(),
        email: input.email.trim().toLowerCase(),
        tax_regime: input.taxRegime.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`Client save failed: ${error.message}`);
  return mapClient(data as ClientRow);
}

export async function listClients(): Promise<GasClientRecord[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("gas_clients").select("*").order("name", { ascending: true });
  if (error) throw new Error(`Client lookup failed: ${error.message}`);
  return ((data ?? []) as ClientRow[]).map(mapClient);
}

export async function createClientAccount(input: {
  name: string;
  rfc: string;
  email: string;
  taxRegime: string;
  password: string;
}): Promise<GasClientRecord> {
  const name = input.name.trim();
  const rfc = input.rfc.trim().toUpperCase();
  const email = input.email.trim().toLowerCase();
  const taxRegime = input.taxRegime.trim();
  const password = input.password;

  if (!name || !rfc || !email || !taxRegime) throw new Error("Name, RFC, email, and tax regime are required.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("A valid client email is required.");
  if (password.length < 8) throw new Error("Client password must be at least 8 characters.");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gas_clients")
    .upsert(
      {
        name,
        rfc,
        email,
        tax_regime: taxRegime,
        password_hash: hashClientPassword(password),
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    )
    .select("*")
    .single();

  if (error) throw new Error(`Client account save failed: ${error.message}`);
  return mapClient(data as ClientRow);
}

export async function verifyClientPassword(input: {
  email: string;
  password: string;
}): Promise<GasClientRecord | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gas_clients")
    .select("*")
    .eq("email", input.email.trim().toLowerCase())
    .eq("active", true)
    .maybeSingle();

  if (error) throw new Error(`Client lookup failed: ${error.message}`);
  if (!data) return null;

  const row = data as ClientRow;
  if (!row.password_hash) return null;
  if (!verifyClientPasswordHash(input.password, row.password_hash)) return null;
  return mapClient(row);
}

export async function listOperators(): Promise<GasOperatorRecord[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gas_operators")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Operator lookup failed: ${error.message}`);
  return ((data ?? []) as OperatorRow[]).map(mapOperator);
}

export async function createOperator(input: { name: string; pin: string }): Promise<GasOperatorRecord> {
  const name = input.name.trim();
  const pin = input.pin.trim();

  if (name.length < 2) throw new Error("Operator name is required.");
  if (!/^\d{4,8}$/.test(pin)) throw new Error("Operator PIN must be 4 to 8 digits.");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gas_operators")
    .upsert(
      {
        name,
        name_key: operatorNameKey(name),
        pin_hash: hashOperatorPin(pin),
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name_key" },
    )
    .select("*")
    .single();

  if (error) throw new Error(`Operator save failed: ${error.message}`);
  return mapOperator(data as OperatorRow);
}

export async function verifyOperatorPin(input: {
  name: string;
  pin: string;
}): Promise<GasOperatorRecord | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gas_operators")
    .select("*")
    .eq("name_key", operatorNameKey(input.name))
    .eq("active", true)
    .maybeSingle();

  if (error) throw new Error(`Operator lookup failed: ${error.message}`);
  if (!data) return null;

  const row = data as OperatorRow;
  const expected = Buffer.from(row.pin_hash);
  const received = Buffer.from(hashOperatorPin(input.pin));
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return null;
  }

  return mapOperator(row);
}

type SubmittedSummaryRow = {
  submitted_at: string | null;
  ticket_date: string | null;
  importe_total: string | number;
  operator_id: string | null;
  operator_name: string | null;
  operator_commission: string | number | null;
  commission_paid_amount: string | number | null;
};

async function listSubmittedSummaryRows(session?: AppSession): Promise<SubmittedSummaryRow[]> {
  const supabase = createAdminClient();
  const rows: SubmittedSummaryRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from("gas_tickets")
      .select(
        "submitted_at,ticket_date,importe_total,operator_id,operator_name,operator_commission,commission_paid_amount",
      )
      .in("status", ["submitted", "already_invoiced"])
      .order("submitted_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (session?.role === "operator") {
      query = session.operatorId
        ? query.eq("operator_id", session.operatorId)
        : query.eq("operator_name", session.name ?? "");
    }

    if (session?.role === "client") {
      query = query.eq("client_id", session.clientId ?? "00000000-0000-0000-0000-000000000000");
    }

    const { data, error } = await query;
    if (error) throw new Error(`Submitted ticket report failed: ${error.message}`);
    const page = (data ?? []) as SubmittedSummaryRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

export async function getMonthlyTicketReport(session?: AppSession): Promise<MonthlyTicketReport[]> {
  const rows = await listSubmittedSummaryRows(session);
  const months = new Map<string, MonthlyTicketReport>();

  for (const row of rows) {
    const month = (row.submitted_at ?? row.ticket_date ?? "").slice(0, 7);
    if (!month) continue;
    const current = months.get(month) ?? { month, submittedCount: 0, submittedTotal: 0 };
    current.submittedCount += 1;
    current.submittedTotal = Math.round((current.submittedTotal + Number(row.importe_total)) * 100) / 100;
    months.set(month, current);
  }

  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}

export async function getCommissionSummaries(session?: AppSession): Promise<CommissionSummary[]> {
  const rows = await listSubmittedSummaryRows(session);
  const summaries = new Map<string, CommissionSummary>();

  for (const row of rows) {
    const operatorName = row.operator_name?.trim() || "Sin operador";
    const key = row.operator_id ?? operatorName.toLowerCase();
    const current = summaries.get(key) ?? {
      operatorId: row.operator_id,
      operatorName,
      earnedAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      status: "paid" as const,
    };
    current.earnedAmount += Number(row.operator_commission ?? 0);
    current.paidAmount += Number(row.commission_paid_amount ?? 0);
    summaries.set(key, current);
  }

  for (const summary of summaries.values()) {
    summary.earnedAmount = Math.round(summary.earnedAmount * 100) / 100;
    summary.paidAmount = Math.round(summary.paidAmount * 100) / 100;
    summary.pendingAmount = Math.max(0, Math.round((summary.earnedAmount - summary.paidAmount) * 100) / 100);
    summary.status = summary.pendingAmount > 0 ? "pending" : "paid";
  }

  if (session?.role === "operator" && summaries.size === 0 && session.name) {
    return [{
      operatorId: session.operatorId ?? null,
      operatorName: session.name,
      earnedAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      status: "paid",
    }];
  }

  return [...summaries.values()].sort((a, b) => a.operatorName.localeCompare(b.operatorName));
}

export async function recordCommissionPayment(input: {
  operatorId?: string | null;
  operatorName: string;
  amount: number;
  createdBy?: string | null;
}): Promise<string> {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Payment amount must be greater than zero.");
  if (!input.operatorName.trim()) throw new Error("Operator is required.");

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("record_gas_commission_payment", {
    p_operator_id: input.operatorId ?? null,
    p_operator_name: input.operatorName.trim(),
    p_amount: amount,
    p_created_by: input.createdBy ?? null,
  });

  if (error) throw new Error(`Commission payment failed: ${error.message}`);
  return String(data);
}

export async function updateTicket(
  id: string,
  patch: {
    status?: GasTicketStatus;
    errorMessage?: string | null;
    petromayabConsumptionId?: string | null;
    petromayabClientId?: string | null;
    submittedAt?: string | null;
  },
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("gas_tickets")
    .update({
      status: patch.status,
      error_message: patch.errorMessage,
      petromayab_consumption_id: patch.petromayabConsumptionId,
      petromayab_client_id: patch.petromayabClientId,
      submitted_at: patch.submittedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(`Ticket update failed: ${error.message}`);
}

export async function addAttempt(input: {
  ticketId?: string | null;
  receiptId?: string | null;
  stage: string;
  ok: boolean;
  requestPayload?: unknown;
  responsePayload?: unknown;
  errorMessage?: string | null;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("gas_ticket_attempts").insert({
    ticket_id: input.ticketId ?? null,
    receipt_id: input.receiptId ?? null,
    stage: input.stage,
    ok: input.ok,
    request_payload: input.requestPayload ?? null,
    response_payload: input.responsePayload ?? null,
    error_message: input.errorMessage ?? null,
  });

  if (error) throw new Error(`Attempt insert failed: ${error.message}`);
}
