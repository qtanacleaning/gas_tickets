import "server-only";

import {
  addAttempt,
  createReceipt,
  createTicket,
  createNotification,
  downloadReceiptFile,
  getClientById,
  getPendingTickets,
  getReceiptById,
  getTicketById,
  listReceiptsForOcr,
  updateReceipt,
  updateTicket,
  uploadReceiptFile,
} from "@/lib/gas/repository";
import { extractTicketsFromImage } from "@/lib/gas/ocr";
import { submitTicketToPetromayab } from "@/lib/gas/petromayab";
import { validateTicketInput } from "@/lib/gas/validation";
import type { GasClientRecord, GasTicketRecord } from "@/lib/gas/types";

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "receipt.jpg";
}

function receiptStoragePath(fileName: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  return `${date}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = Buffer.from(await blob.arrayBuffer());
  return buffer.toString("base64");
}

export async function createManualTicket(input: {
  folio: unknown;
  total: unknown;
  iva?: unknown;
  paymentType: unknown;
  ticketDate?: unknown;
  client?: GasClientRecord | null;
  operatorId?: string | null;
  operatorName?: string | null;
}): Promise<GasTicketRecord> {
  const validation = validateTicketInput(input);
  if (!validation.ok) {
    throw new Error(validation.errors.join(" "));
  }

  return createTicket({
    ticket: validation.ticket,
    client: input.client,
    clientId: input.client?.id,
    operatorId: input.operatorId,
    operatorName: input.operatorName,
    status: "submit_pending",
  });
}

export async function ingestReceiptUpload(input: {
  file: File;
  uploadedBy?: string;
  operatorId?: string | null;
  operatorName?: string | null;
  clientId?: string | null;
}): Promise<{ receiptId: string; ticketsCreated: number; skippedReason?: string }> {
  if (input.clientId) {
    const client = await getClientById(input.clientId);
    if (!client || !client.active) throw new Error("The selected client account is not active.");
  }

  const storagePath = receiptStoragePath(input.file.name);
  await uploadReceiptFile(input.file, storagePath);

  const receipt = await createReceipt({
    fileName: input.file.name,
    storagePath,
    mimeType: input.file.type || "image/jpeg",
    uploadedBy: input.uploadedBy,
    operatorId: input.operatorId,
    operatorName: input.operatorName ?? undefined,
    clientId: input.clientId,
  });

  const result = await processReceiptOcr(receipt.id);
  return { receiptId: receipt.id, ...result };
}

export async function processReceiptOcr(
  receiptId: string,
): Promise<{ ticketsCreated: number; skippedReason?: string }> {
  const receipt = await getReceiptById(receiptId);
  if (!receipt) throw new Error("Receipt not found.");
  if (!receipt.storagePath) throw new Error("Receipt is missing a storage path.");

  try {
    const blob = await downloadReceiptFile(receipt.storagePath);
    const ocr = await extractTicketsFromImage({
      base64: await blobToBase64(blob),
      mimeType: receipt.mimeType,
    });

    if (ocr.skippedReason) {
      await updateReceipt(receipt.id, {
        status: "needs_review",
        extractedCount: 0,
        errorMessage: ocr.skippedReason,
      });
      await addAttempt({
        receiptId: receipt.id,
        stage: "ocr",
        ok: false,
        errorMessage: ocr.skippedReason,
      });
      await createNotification({
        recipientRole: "operator",
        recipientId: receipt.operatorId,
        recipientName: receipt.operatorName,
        type: "ocr_resubmit",
        title: "Ticket no reconocido",
        message: "No pudimos leer el recibo. Toma una foto nueva y vuelve a enviarlo.",
        resourceType: "receipt",
        resourceId: receipt.id,
      }).catch(() => undefined);
      return { ticketsCreated: 0, skippedReason: ocr.skippedReason };
    }

    let created = 0;
    const client = receipt.clientId ? await getClientById(receipt.clientId) : null;
    for (const ticket of ocr.tickets) {
      await createTicket({
        receiptId: receipt.id,
        clientId: receipt.clientId,
        operatorId: receipt.operatorId,
        operatorName: receipt.operatorName,
        client,
        ticket,
        status: "submit_pending",
      });
      created += 1;
    }

    await updateReceipt(receipt.id, {
      status: created > 0 ? "processed" : "needs_review",
      extractedCount: created,
      errorMessage: created > 0 ? null : "No tickets were extracted.",
    });
    await addAttempt({
      receiptId: receipt.id,
      stage: "ocr",
      ok: created > 0,
      responsePayload: { provider: ocr.provider, tickets: ocr.tickets.length, rawText: ocr.rawText },
      errorMessage: created > 0 ? null : "No tickets were extracted.",
    });
    await createNotification({
      recipientRole: "operator",
      recipientId: receipt.operatorId,
      recipientName: receipt.operatorName,
      type: created > 0 ? "ocr_success" : "ocr_resubmit",
      title: created > 0 ? "Tickets reconocidos" : "Ticket no reconocido",
      message: created > 0
        ? `${created} ticket${created === 1 ? "" : "s"} agregado${created === 1 ? "" : "s"} al pool.`
        : "No pudimos leer el recibo. Toma una foto nueva.",
      resourceType: "receipt",
      resourceId: receipt.id,
    }).catch(() => undefined);

    return { ticketsCreated: created };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OCR error.";
    await updateReceipt(receipt.id, {
      status: "failed",
      extractedCount: 0,
      errorMessage: message,
    });
    await addAttempt({
      receiptId: receipt.id,
      stage: "ocr",
      ok: false,
      errorMessage: message,
    });
    await createNotification({
      recipientRole: "operator",
      recipientId: receipt.operatorId,
      recipientName: receipt.operatorName,
      type: "ocr_resubmit",
      title: "Error al reconocer el ticket",
      message: "El recibo necesita una foto nueva para poder procesarse.",
      resourceType: "receipt",
      resourceId: receipt.id,
    }).catch(() => undefined);
    throw error;
  }
}

export async function processPendingReceiptOcr(limit = 10) {
  const receipts = await listReceiptsForOcr(limit);
  const results = [];

  for (const receipt of receipts) {
    try {
      results.push({ receiptId: receipt.id, ...(await processReceiptOcr(receipt.id)) });
    } catch (error) {
      results.push({
        receiptId: receipt.id,
        ticketsCreated: 0,
        error: error instanceof Error ? error.message : "Unknown OCR error.",
      });
    }
  }

  return results;
}

export async function submitTicket(ticketId: string): Promise<{ status: string }> {
  const ticket = await getTicketById(ticketId);
  if (!ticket) throw new Error("Ticket not found.");
  if (!ticket.clientId || !ticket.rfc) throw new Error("Assign this ticket to a client before submission.");
  const client = await getClientById(ticket.clientId);
  if (
    !client ||
    !client.name ||
    !client.rfc ||
    !client.taxRegime ||
    !client.fiscalAddressLine1 ||
    !client.fiscalPostalCode
  ) {
    throw new Error("The client must complete their fiscal profile before factura submission.");
  }

  try {
    const result = await submitTicketToPetromayab(ticket);
    await updateTicket(ticket.id, {
      status: "submitted",
      errorMessage: null,
      petromayabConsumptionId: result.ticketData.consumptionId,
      petromayabClientId: result.ticketData.clientId,
      submittedAt: new Date().toISOString(),
    });
    await addAttempt({
      ticketId: ticket.id,
      stage: "submit",
      ok: true,
      responsePayload: result.invoice.response,
    });
    await Promise.all([
      createNotification({
        recipientRole: "operator",
        recipientId: ticket.operatorId,
        recipientName: ticket.operatorName,
        type: "ticket_submitted",
        title: "Ticket facturado",
        message: `El ticket ${ticket.folio} genero ${Math.round(ticket.operatorCommission * 100) / 100} MXN de compensacion.`,
        resourceType: "ticket",
        resourceId: ticket.id,
      }).catch(() => undefined),
      createNotification({
        recipientRole: "client",
        recipientId: ticket.clientId,
        type: "ticket_submitted",
        title: "Factura creada",
        message: `El ticket ${ticket.folio} fue facturado correctamente.`,
        resourceType: "ticket",
        resourceId: ticket.id,
      }).catch(() => undefined),
    ]);
    return { status: "submitted" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown submission error.";
    const alreadyInvoiced = /already invoiced|ya fue facturado/i.test(message);

    await updateTicket(ticket.id, {
      status: alreadyInvoiced ? "already_invoiced" : "failed",
      errorMessage: alreadyInvoiced ? null : message,
      submittedAt: alreadyInvoiced ? new Date().toISOString() : null,
    });
    await addAttempt({
      ticketId: ticket.id,
      stage: "submit",
      ok: alreadyInvoiced,
      errorMessage: alreadyInvoiced ? null : message,
    });

    if (alreadyInvoiced) return { status: "already_invoiced" };
    throw error;
  }
}

export async function submitPendingTickets(limit = 10) {
  const pending = await getPendingTickets(limit);
  const results = [];

  for (const ticket of pending) {
    try {
      results.push({ ticketId: ticket.id, ...(await submitTicket(ticket.id)) });
    } catch (error) {
      results.push({
        ticketId: ticket.id,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown submission error.",
      });
    }
  }

  return results;
}
