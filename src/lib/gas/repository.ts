import "server-only";

import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppEnv } from "@/lib/env";
import { clientCommissionFromIva, operatorCompensationFromIva } from "@/lib/gas/validation";
import type { AppSession } from "@/lib/auth";
import type {
  CommissionSummary,
  ExtractedTicket,
  GasClientRecord,
  GasNotificationRecord,
  GasOperatorRecord,
  GasReceiptRecord,
  GasReceiptStatus,
  GasTicketRecord,
  GasTicketStatus,
  MonthlyTicketReport,
  RoleDashboard,
  SettlementCandidate,
  SettlementKind,
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
  client_commission?: string | number | null;
  client_commission_status?: "pending" | "paid";
  client_commission_paid_amount?: string | number | null;
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
  fiscal_address_line1?: string | null;
  fiscal_address_line2?: string | null;
  fiscal_city?: string | null;
  fiscal_state?: string | null;
  fiscal_postal_code?: string | null;
  fiscal_country?: string | null;
  phone?: string | null;
  cfdi_use?: string | null;
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
    fiscalAddressLine1: row.fiscal_address_line1 ?? "",
    fiscalAddressLine2: row.fiscal_address_line2 ?? "",
    fiscalCity: row.fiscal_city ?? "",
    fiscalState: row.fiscal_state ?? "",
    fiscalPostalCode: row.fiscal_postal_code ?? "",
    fiscalCountry: row.fiscal_country ?? "MX",
    phone: row.phone ?? "",
    cfdiUse: row.cfdi_use ?? "G03",
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
    clientCommission: Number(row.client_commission ?? 0),
    clientCommissionStatus: row.client_commission_status ?? "pending",
    clientCommissionPaidAmount: Number(row.client_commission_paid_amount ?? 0),
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
  return operatorCompensationFromIva(iva);
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
  const rfc = input.client?.rfc ?? "";
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
    client_commission: clientCommissionFromIva(input.ticket.iva),
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
    .not("client_id", "is", null)
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
  fiscalAddressLine1?: string;
  fiscalAddressLine2?: string;
  fiscalCity?: string;
  fiscalState?: string;
  fiscalPostalCode?: string;
  fiscalCountry?: string;
  phone?: string;
  cfdiUse?: string;
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
        ...(input.fiscalAddressLine1 !== undefined
          ? { fiscal_address_line1: input.fiscalAddressLine1.trim() || null }
          : {}),
        ...(input.fiscalAddressLine2 !== undefined
          ? { fiscal_address_line2: input.fiscalAddressLine2.trim() || null }
          : {}),
        ...(input.fiscalCity !== undefined ? { fiscal_city: input.fiscalCity.trim() || null } : {}),
        ...(input.fiscalState !== undefined ? { fiscal_state: input.fiscalState.trim() || null } : {}),
        ...(input.fiscalPostalCode !== undefined
          ? { fiscal_postal_code: input.fiscalPostalCode.trim() || null }
          : {}),
        ...(input.fiscalCountry !== undefined
          ? { fiscal_country: input.fiscalCountry.trim().toUpperCase() || "MX" }
          : {}),
        ...(input.phone !== undefined ? { phone: input.phone.trim() || null } : {}),
        ...(input.cfdiUse !== undefined ? { cfdi_use: input.cfdiUse.trim().toUpperCase() || "G03" } : {}),
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
  fiscalAddressLine1?: string;
  fiscalAddressLine2?: string;
  fiscalCity?: string;
  fiscalState?: string;
  fiscalPostalCode?: string;
  fiscalCountry?: string;
  phone?: string;
  cfdiUse?: string;
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
        fiscal_address_line1: input.fiscalAddressLine1?.trim() || null,
        fiscal_address_line2: input.fiscalAddressLine2?.trim() || null,
        fiscal_city: input.fiscalCity?.trim() || null,
        fiscal_state: input.fiscalState?.trim() || null,
        fiscal_postal_code: input.fiscalPostalCode?.trim() || null,
        fiscal_country: input.fiscalCountry?.trim().toUpperCase() || "MX",
        phone: input.phone?.trim() || null,
        cfdi_use: input.cfdiUse?.trim().toUpperCase() || "G03",
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
  iva: string | number | null;
  client_id: string | null;
  operator_id: string | null;
  operator_name: string | null;
  operator_commission: string | number | null;
  commission_paid_amount: string | number | null;
  client_commission: string | number | null;
  client_commission_paid_amount: string | number | null;
};

async function listSubmittedSummaryRows(session?: AppSession): Promise<SubmittedSummaryRow[]> {
  const supabase = createAdminClient();
  const rows: SubmittedSummaryRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from("gas_tickets")
      .select(
        "submitted_at,ticket_date,importe_total,iva,client_id,operator_id,operator_name,operator_commission,commission_paid_amount,client_commission,client_commission_paid_amount",
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
    const current = months.get(month) ?? {
      month,
      submittedCount: 0,
      submittedTotal: 0,
      ivaTotal: 0,
      clientCommission: 0,
      clientCommissionPaid: 0,
    };
    current.submittedCount += 1;
    current.submittedTotal = Math.round((current.submittedTotal + Number(row.importe_total)) * 100) / 100;
    current.ivaTotal = Math.round((current.ivaTotal + Number(row.iva ?? 0)) * 100) / 100;
    current.clientCommission =
      Math.round((current.clientCommission + Number(row.client_commission ?? 0)) * 100) / 100;
    current.clientCommissionPaid =
      Math.round((current.clientCommissionPaid + Number(row.client_commission_paid_amount ?? 0)) * 100) / 100;
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

export async function assignTicketToClient(input: {
  ticketId: string;
  clientId: string;
  assignedBy?: string | null;
}): Promise<GasTicketRecord> {
  const client = await getClientById(input.clientId);
  if (!client || !client.active) throw new Error("The selected client account is not active.");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gas_tickets")
    .update({
      client_id: client.id,
      rfc: client.rfc,
      assigned_by: input.assignedBy ?? null,
      assigned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.ticketId)
    .not("status", "in", "(submitted,already_invoiced)")
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Ticket assignment failed: ${error.message}`);
  if (!data) throw new Error("Only active tickets can be assigned.");
  const ticket = await getTicketById(input.ticketId);
  if (!ticket) throw new Error("Ticket not found.");
  return ticket;
}

function cancunDateKey(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cancun",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

function currentPeriodKeys() {
  const today = cancunDateKey(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const localDate = new Date(Date.UTC(year, month - 1, day));
  const daysFromMonday = (localDate.getUTCDay() + 6) % 7;
  localDate.setUTCDate(localDate.getUTCDate() - daysFromMonday);
  return { today, month: today.slice(0, 7), weekStart: localDate.toISOString().slice(0, 10) };
}

export async function getRoleDashboard(session: AppSession): Promise<RoleDashboard> {
  const rows = await listSubmittedSummaryRows(session);
  const period = currentPeriodKeys();
  const result: RoleDashboard = {
    submittedThisMonth: 0,
    ivaThisMonth: 0,
    compensationWeek: 0,
    compensationMonth: 0,
    pendingPayments: 0,
    clientCommissionMonth: 0,
    clientCommissionPaidMonth: 0,
  };

  for (const row of rows) {
    const submittedDate = row.submitted_at ? cancunDateKey(row.submitted_at) : row.ticket_date ?? "";
    const isThisMonth = submittedDate.startsWith(period.month);
    const operatorCompensation = Number(row.operator_commission ?? 0);
    const clientCommission = Number(row.client_commission ?? 0);

    if (isThisMonth) {
      result.submittedThisMonth += 1;
      result.ivaThisMonth += Number(row.iva ?? 0);
      result.compensationMonth += operatorCompensation;
      result.clientCommissionMonth += clientCommission;
      result.clientCommissionPaidMonth += Number(row.client_commission_paid_amount ?? 0);
    }
    if (submittedDate >= period.weekStart && submittedDate <= period.today) {
      result.compensationWeek += operatorCompensation;
    }
    result.pendingPayments += session.role === "client"
      ? Math.max(0, clientCommission - Number(row.client_commission_paid_amount ?? 0))
      : Math.max(0, operatorCompensation - Number(row.commission_paid_amount ?? 0));
  }

  for (const key of [
    "ivaThisMonth",
    "compensationWeek",
    "compensationMonth",
    "pendingPayments",
    "clientCommissionMonth",
    "clientCommissionPaidMonth",
  ] as const) {
    result[key] = Math.round(result[key] * 100) / 100;
  }
  return result;
}

export async function listSettlementCandidates(kind: SettlementKind): Promise<SettlementCandidate[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("gas_tickets")
    .select(
      "id,client_id,operator_id,operator_name,folio,ticket_date,iva,operator_commission,commission_paid_amount,client_commission,client_commission_paid_amount",
    )
    .in("status", ["submitted", "already_invoiced"])
    .order("submitted_at", { ascending: true });

  query = kind === "operator_withdrawal"
    ? query.eq("commission_status", "pending")
    : query.eq("client_commission_status", "pending").not("client_id", "is", null);

  const { data, error } = await query;
  if (error) throw new Error(`Settlement ticket lookup failed: ${error.message}`);
  const rows = (data ?? []) as Array<{
    id: string;
    client_id: string | null;
    operator_id: string | null;
    operator_name: string | null;
    folio: string;
    ticket_date: string;
    iva: string | number | null;
    operator_commission: string | number;
    commission_paid_amount: string | number;
    client_commission: string | number;
    client_commission_paid_amount: string | number;
  }>;
  const clientNames = await loadClientNames(
    [...new Set(rows.map((row) => row.client_id).filter((id): id is string => Boolean(id)))],
  );

  return rows.flatMap((row) => {
    const amount = kind === "operator_withdrawal"
      ? Number(row.operator_commission) - Number(row.commission_paid_amount)
      : Number(row.client_commission) - Number(row.client_commission_paid_amount);
    const entityName = kind === "operator_withdrawal"
      ? row.operator_name?.trim() || "Sin operador"
      : clientNames.get(row.client_id ?? "") || "Sin cliente";
    const entityId = kind === "operator_withdrawal" ? row.operator_id : row.client_id;
    return amount > 0
      ? [{
          ticketId: row.id,
          entityId,
          entityName,
          folio: row.folio,
          ticketDate: row.ticket_date,
          iva: Number(row.iva ?? 0),
          amount: Math.round(amount * 100) / 100,
        }]
      : [];
  });
}

export async function recordTicketSettlement(input: {
  kind: SettlementKind;
  ticketIds: string[];
  createdBy?: string | null;
}): Promise<string> {
  const ticketIds = [...new Set(input.ticketIds.filter(Boolean))];
  if (ticketIds.length === 0) throw new Error("Select at least one ticket.");
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("record_gas_ticket_settlement", {
    p_kind: input.kind,
    p_ticket_ids: ticketIds,
    p_created_by: input.createdBy ?? null,
  });
  if (error) throw new Error(`Settlement failed: ${error.message}`);
  return String(data);
}

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

function mapNotification(row: NotificationRow): GasNotificationRecord {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function createNotification(input: {
  recipientRole: "admin" | "operator" | "client";
  recipientId?: string | null;
  recipientName?: string | null;
  type: string;
  title: string;
  message: string;
  resourceType?: string | null;
  resourceId?: string | null;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("gas_notifications").insert({
    recipient_role: input.recipientRole,
    recipient_id: input.recipientId ?? null,
    recipient_name: input.recipientName ?? null,
    type: input.type,
    title: input.title,
    message: input.message,
    resource_type: input.resourceType ?? null,
    resource_id: input.resourceId ?? null,
  });
  if (error) throw new Error(`Notification insert failed: ${error.message}`);
}

export async function listNotifications(session: AppSession, limit = 20): Promise<GasNotificationRecord[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("gas_notifications")
    .select("id,type,title,message,read_at,created_at")
    .eq("recipient_role", session.role)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (session.role === "client") query = query.eq("recipient_id", session.clientId ?? crypto.randomUUID());
  if (session.role === "operator") {
    query = session.operatorId
      ? query.eq("recipient_id", session.operatorId)
      : query.eq("recipient_name", session.name ?? "");
  }
  const { data, error } = await query;
  if (error) throw new Error(`Notification lookup failed: ${error.message}`);
  return ((data ?? []) as NotificationRow[]).map(mapNotification);
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
