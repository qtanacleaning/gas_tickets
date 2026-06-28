import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAppEnv } from "@/lib/env";
import type { AppSession } from "@/lib/auth";
import type {
  ExtractedTicket,
  GasClientRecord,
  GasReceiptRecord,
  GasReceiptStatus,
  GasTicketRecord,
  GasTicketStatus,
} from "@/lib/gas/types";

type TicketRow = {
  id: string;
  client_id: string | null;
  receipt_id: string | null;
  operator_name: string | null;
  folio: string;
  referencia: string;
  importe_total: string | number;
  iva: string | number | null;
  operator_commission: string | number | null;
  rfc: string;
  cfdi: string;
  payment_type: "debit" | "credit";
  status: GasTicketStatus;
  error_message: string | null;
  petromayab_consumption_id: string | null;
  petromayab_client_id: string | null;
  submitted_at: string | null;
  created_at: string;
  gas_receipts?: { file_name: string | null } | { file_name: string | null }[] | null;
  gas_clients?: { name: string | null } | { name: string | null }[] | null;
};

type ReceiptRow = {
  id: string;
  client_id: string | null;
  file_name: string;
  storage_path: string | null;
  mime_type: string;
  uploaded_by: string | null;
  operator_name: string | null;
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
  created_at: string;
  updated_at: string;
};

function mapReceipt(row: ReceiptRow): GasReceiptRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    fileName: row.file_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    uploadedBy: row.uploaded_by,
    operatorName: row.operator_name,
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

function firstClientName(row: TicketRow): string | null {
  const client = row.gas_clients;
  if (Array.isArray(client)) return client[0]?.name ?? null;
  return client?.name ?? null;
}

function mapClient(row: ClientRow): GasClientRecord {
  return {
    id: row.id,
    name: row.name,
    rfc: row.rfc,
    email: row.email,
    taxRegime: row.tax_regime,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTicket(row: TicketRow): GasTicketRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: firstClientName(row),
    receiptId: row.receipt_id,
    operatorName: row.operator_name,
    folio: row.folio,
    referencia: row.referencia,
    importeTotal: Number(row.importe_total),
    iva: row.iva === null ? null : Number(row.iva),
    operatorCommission: row.operator_commission === null ? 0 : Number(row.operator_commission),
    rfc: row.rfc,
    cfdi: row.cfdi,
    paymentType: row.payment_type,
    status: row.status,
    errorMessage: row.error_message,
    petromayabConsumptionId: row.petromayab_consumption_id,
    petromayabClientId: row.petromayab_client_id,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    receiptFileName: firstReceiptName(row),
  };
}

function commissionFromIva(iva: number | undefined): number {
  return Math.round((iva ?? 0) * 10) / 100;
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
  operatorName?: string;
  clientId?: string | null;
}): Promise<GasReceiptRecord> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gas_receipts")
    .insert({
      file_name: input.fileName,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      uploaded_by: input.uploadedBy || null,
      operator_name: input.operatorName || input.uploadedBy || null,
      client_id: input.clientId ?? null,
      status: "ocr_pending",
    })
    .select("*")
    .single();

  if (error) throw new Error(`Receipt insert failed: ${error.message}`);
  return mapReceipt(data as ReceiptRow);
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
  operatorName?: string | null;
  client?: GasClientRecord | null;
  ticket: ExtractedTicket;
  status?: GasTicketStatus;
}): Promise<GasTicketRecord> {
  const env = getAppEnv();
  const rfc = input.client?.rfc ?? env.petromayabRfc;
  const cfdi = "Gastos en General";
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gas_tickets")
    .insert({
      receipt_id: input.receiptId ?? null,
      client_id: input.clientId ?? input.client?.id ?? null,
      operator_name: input.operatorName ?? null,
      folio: input.ticket.folio,
      referencia: env.petromayabReferencia,
      importe_total: input.ticket.total,
      iva: input.ticket.iva ?? null,
      operator_commission: commissionFromIva(input.ticket.iva),
      rfc,
      cfdi,
      payment_type: input.ticket.paymentType,
      status: input.status ?? "submit_pending",
    })
    .select("*, gas_receipts(file_name), gas_clients(name)")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error(`Duplicate ticket: folio ${input.ticket.folio} for ${input.ticket.total}`);
    }
    throw new Error(`Ticket insert failed: ${error.message}`);
  }

  return mapTicket(data as TicketRow);
}

export async function listTickets(limit = 50, session?: AppSession): Promise<GasTicketRecord[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("gas_tickets")
    .select("*, gas_receipts(file_name), gas_clients(name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (session?.role === "operator") {
    query = query.eq("operator_name", session.name ?? "");
  }

  if (session?.role === "client") {
    query = query.eq("client_id", session.clientId ?? "00000000-0000-0000-0000-000000000000");
  }

  const { data, error } = await query;

  if (error) throw new Error(`Ticket lookup failed: ${error.message}`);
  return ((data ?? []) as TicketRow[]).map(mapTicket);
}

export async function getTicketById(id: string): Promise<GasTicketRecord | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gas_tickets")
    .select("*, gas_receipts(file_name), gas_clients(name)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Ticket lookup failed: ${error.message}`);
  return data ? mapTicket(data as TicketRow) : null;
}

export async function getPendingTickets(limit = 25): Promise<GasTicketRecord[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gas_tickets")
    .select("*, gas_receipts(file_name), gas_clients(name)")
    .eq("status", "submit_pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Pending ticket lookup failed: ${error.message}`);
  return ((data ?? []) as TicketRow[]).map(mapTicket);
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
