"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  FilePlus2,
  Fuel,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Send,
  Upload,
} from "lucide-react";
import type { GasTicketRecord, GasTicketStatus, PaymentType } from "@/lib/gas/types";
import { formatCurrency } from "@/lib/gas/validation";

type OperatorPortalProps = {
  initialAuthenticated: boolean;
  initialTickets: GasTicketRecord[];
};

type Message = {
  type: "success" | "error" | "neutral";
  text: string;
};

type RowActionState =
  | { kind: "submit"; label: string }
  | { kind: "label"; label: string; tone: "success" | "neutral" | "error" };

const statusLabels: Record<GasTicketStatus, string> = {
  submit_pending: "Pendiente",
  submitted: "Facturado",
  already_invoiced: "Ya facturado",
  needs_review: "Revision",
  failed: "Error",
};

function statusIcon(status: GasTicketStatus) {
  if (status === "submitted" || status === "already_invoiced") return <CheckCircle2 size={14} />;
  if (status === "failed" || status === "needs_review") return <AlertTriangle size={14} />;
  return <Clock3 size={14} />;
}

function normalizeTicket(ticket: GasTicketRecord): GasTicketRecord {
  return {
    ...ticket,
    importeTotal: Number(ticket.importeTotal),
    iva: ticket.iva === null ? null : Number(ticket.iva),
  };
}

function getRowActionState(ticket: GasTicketRecord): RowActionState {
  if (ticket.status === "submit_pending") {
    return { kind: "submit", label: "Enviar" };
  }

  if (ticket.status === "failed") {
    return { kind: "submit", label: "Reintentar" };
  }

  if (ticket.status === "submitted") {
    return { kind: "label", label: "Enviado", tone: "success" };
  }

  if (ticket.status === "already_invoiced") {
    return { kind: "label", label: "Facturado", tone: "success" };
  }

  return { kind: "label", label: "Revisar", tone: "error" };
}

export function OperatorPortal({ initialAuthenticated, initialTickets }: OperatorPortalProps) {
  const [authenticated, setAuthenticated] = useState(initialAuthenticated);
  const [password, setPassword] = useState("");
  const [uploadedBy, setUploadedBy] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [tickets, setTickets] = useState<GasTicketRecord[]>(initialTickets.map(normalizeTicket));
  const [paymentType, setPaymentType] = useState<PaymentType>("debit");
  const [manualForm, setManualForm] = useState({ folio: "", total: "", iva: "" });
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const pendingCount = useMemo(
    () => tickets.filter((ticket) => ticket.status === "submit_pending").length,
    [tickets],
  );

  async function loadTickets() {
    setBusy("load");
    const response = await fetch("/api/tickets", { cache: "no-store" });
    if (response.status === 401) {
      setAuthenticated(false);
      setBusy(null);
      return;
    }
    const data = (await response.json()) as { tickets?: GasTicketRecord[]; error?: string };
    if (!response.ok) {
      setMessage({ type: "error", text: data.error ?? "No se pudo cargar la cola." });
    } else {
      setTickets((data.tickets ?? []).map(normalizeTicket));
    }
    setBusy(null);
  }

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function setReceiptFile(file: File | null) {
    setSelectedFile(file);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("login");
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = (await response.json()) as { error?: string };
    setBusy(null);

    if (!response.ok) {
      setMessage({ type: "error", text: data.error ?? "Acceso rechazado." });
      return;
    }

    setPassword("");
    setMessage(null);
    setAuthenticated(true);
    await loadTickets();
  }

  async function logout() {
    await fetch("/api/session", { method: "DELETE" });
    setAuthenticated(false);
    setTickets([]);
  }

  async function uploadReceipt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      setMessage({ type: "error", text: "Selecciona una imagen del recibo." });
      return;
    }

    const formData = new FormData();
    formData.set("receipt", selectedFile);
    formData.set("uploadedBy", uploadedBy);

    setBusy("upload");
    const response = await fetch("/api/tickets/upload", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json()) as {
      ticketsCreated?: number;
      skippedReason?: string;
      error?: string;
    };
    setBusy(null);

    if (!response.ok) {
      setMessage({ type: "error", text: data.error ?? "No se pudo subir el recibo." });
      return;
    }

    setReceiptFile(null);
    setMessage({
      type: data.skippedReason ? "neutral" : "success",
      text: data.skippedReason
        ? `Recibo guardado. ${data.skippedReason}`
        : `Recibo guardado. Tickets detectados: ${data.ticketsCreated ?? 0}.`,
    });
    await loadTickets();
  }

  async function createManual(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("manual");
    const response = await fetch("/api/tickets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...manualForm, paymentType }),
    });
    const data = (await response.json()) as { ticket?: GasTicketRecord; error?: string };
    setBusy(null);

    if (!response.ok || !data.ticket) {
      setMessage({ type: "error", text: data.error ?? "No se pudo crear el ticket." });
      return;
    }

    setManualForm({ folio: "", total: "", iva: "" });
    setMessage({ type: "success", text: `Ticket ${data.ticket.folio} agregado a la cola.` });
    await loadTickets();
  }

  async function submit(ticketId?: string) {
    setBusy(ticketId ?? "submit-all");
    const response = await fetch("/api/tickets/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ticketId ? { ticketId } : {}),
    });
    const data = (await response.json()) as { error?: string };
    setBusy(null);

    if (!response.ok) {
      setMessage({ type: "error", text: data.error ?? "No se pudo enviar a factura." });
      await loadTickets();
      return;
    }

    setMessage({ type: "success", text: ticketId ? "Ticket enviado." : "Cola enviada." });
    await loadTickets();
  }

  if (!authenticated) {
    return (
      <main className="login-screen">
        <form className="login-panel stack" onSubmit={login}>
          <span className="brand-mark">
            <LockKeyhole size={22} />
          </span>
          <div>
            <p className="eyebrow">Gasolina</p>
            <h1>Gasolina Tickets</h1>
            <p>Portal de operadores para recibos Petromayab.</p>
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {message && <StatusMessage message={message} />}
          <button className="button full" type="submit" disabled={busy === "login"}>
            <LockKeyhole size={16} />
            Entrar
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <span className="brand-mark">
          <Fuel size={24} />
        </span>
        <h1>Gasolina</h1>
        <p>Portal de facturacion de gasolina</p>

        <div className="sidebar-list">
          <div className="sidebar-row">
            <Camera size={16} />
            Recibos
          </div>
          <div className="sidebar-row">
            <Clock3 size={16} />
            {pendingCount} pendientes
          </div>
          <div className="sidebar-row">
            <CheckCircle2 size={16} />
            Petromayab
          </div>
        </div>
      </aside>

      <section className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Operaciones</p>
            <h2>Recibos y facturas</h2>
          </div>
          <div className="toolbar">
            <button className="button secondary" type="button" onClick={loadTickets} disabled={busy === "load"}>
              <RefreshCw size={16} />
              Actualizar
            </button>
            <button
              className="button warn"
              type="button"
              onClick={() => submit()}
              disabled={busy === "submit-all" || pendingCount === 0}
            >
              <Send size={16} />
              Enviar cola
            </button>
            <button className="button secondary" type="button" onClick={logout}>
              <LogOut size={16} />
              Salir
            </button>
          </div>
        </div>

        {message && <StatusMessage message={message} />}

        <div className="grid" style={{ marginTop: message ? 14 : 0 }}>
          <div className="stack">
            <section className="panel">
              <div className="panel-header">
                <h3>Subir recibo</h3>
                <Upload size={18} />
              </div>
              <form className="panel-body stack" onSubmit={uploadReceipt}>
                <label className="file-drop">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="preview" src={previewUrl} alt="Receipt preview" />
                  ) : (
                    <span className="drop-inner">
                      <Camera size={28} />
                      <span>
                        <strong>Foto del recibo</strong>
                        JPG, PNG o WebP
                      </span>
                    </span>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <div className="field">
                  <label htmlFor="uploadedBy">Operador</label>
                  <input
                    id="uploadedBy"
                    value={uploadedBy}
                    onChange={(event) => setUploadedBy(event.target.value)}
                    placeholder="Nombre"
                  />
                </div>
                <button className="button full" type="submit" disabled={busy === "upload"}>
                  <Upload size={16} />
                  Subir recibo
                </button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h3>Ticket manual</h3>
                <FilePlus2 size={18} />
              </div>
              <form className="panel-body stack" onSubmit={createManual}>
                <div className="field">
                  <label htmlFor="folio">Folio</label>
                  <input
                    id="folio"
                    inputMode="numeric"
                    value={manualForm.folio}
                    onChange={(event) => setManualForm((form) => ({ ...form, folio: event.target.value }))}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="total">Total</label>
                  <input
                    id="total"
                    inputMode="decimal"
                    value={manualForm.total}
                    onChange={(event) => setManualForm((form) => ({ ...form, total: event.target.value }))}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="iva">IVA</label>
                  <input
                    id="iva"
                    inputMode="decimal"
                    value={manualForm.iva}
                    onChange={(event) => setManualForm((form) => ({ ...form, iva: event.target.value }))}
                  />
                </div>
                <div className="segmented" aria-label="Metodo de pago">
                  <button
                    type="button"
                    className={paymentType === "debit" ? "active" : ""}
                    onClick={() => setPaymentType("debit")}
                  >
                    Debito
                  </button>
                  <button
                    type="button"
                    className={paymentType === "credit" ? "active" : ""}
                    onClick={() => setPaymentType("credit")}
                  >
                    Credito
                  </button>
                </div>
                <button className="button full" type="submit" disabled={busy === "manual"}>
                  <FilePlus2 size={16} />
                  Agregar ticket
                </button>
              </form>
            </section>
          </div>

          <section className="panel">
            <div className="panel-header">
              <h3>Cola de factura</h3>
              <span className="status-pill submit_pending">{pendingCount} pendientes</span>
            </div>
            <div className="table-wrap">
              {tickets.length === 0 ? (
                <div className="empty-state">Sin tickets todavia.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Folio</th>
                      <th>Total</th>
                      <th>Pago</th>
                      <th>Estado</th>
                      <th>Recibo</th>
                      <th>Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((ticket) => (
                      <tr key={ticket.id}>
                        <td className="num">{ticket.folio}</td>
                        <td className="num">{formatCurrency(ticket.importeTotal)}</td>
                        <td>{ticket.paymentType === "credit" ? "Credito" : "Debito"}</td>
                        <td>
                          <span className={`status-pill ${ticket.status}`}>
                            {statusIcon(ticket.status)}
                            {statusLabels[ticket.status]}
                          </span>
                        </td>
                        <td className="receipt-cell">
                          <span className="receipt-name" title={ticket.receiptFileName ?? "Manual"}>
                            {ticket.receiptFileName ?? "Manual"}
                          </span>
                        </td>
                        <td>
                          {(() => {
                            const action = getRowActionState(ticket);
                            if (action.kind === "submit") {
                              return (
                                <button
                                  className="button secondary action-button"
                                  type="button"
                                  onClick={() => submit(ticket.id)}
                                  disabled={busy === ticket.id}
                                >
                                  <Send size={14} />
                                  {action.label}
                                </button>
                              );
                            }

                            return <span className={`action-badge ${action.tone}`}>{action.label}</span>;
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function StatusMessage({ message }: { message: Message }) {
  return (
    <div className={`status-banner ${message.type === "neutral" ? "" : message.type}`}>
      {message.type === "error" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
      <span>{message.text}</span>
    </div>
  );
}
