"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  FilePlus2,
  Fuel,
  KeyRound,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  UserRound,
  UserPlus,
} from "lucide-react";
import type { AppSession } from "@/lib/auth";
import type {
  GasClientRecord,
  GasOperatorRecord,
  GasTicketRecord,
  GasTicketStatus,
  PaymentType,
  UserRole,
} from "@/lib/gas/types";
import { formatCurrency } from "@/lib/gas/validation";

type OperatorPortalProps = {
  initialSession: AppSession | null;
  initialTickets: GasTicketRecord[];
};

type Message = {
  type: "success" | "error" | "neutral";
  text: string;
};

type UploadQueueStatus = "queued" | "uploading" | "done" | "error";

type UploadQueueItem = {
  id: string;
  file: File;
  previewUrl: string;
  status: UploadQueueStatus;
  ticketsCreated?: number;
  skippedReason?: string;
  error?: string;
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

const roleLabels: Record<UserRole, string> = {
  admin: "Admin",
  operator: "Operador",
  client: "Cliente",
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
    operatorCommission: Number(ticket.operatorCommission ?? 0),
  };
}

function getRowActionState(ticket: GasTicketRecord): RowActionState {
  if (ticket.status === "submit_pending") return { kind: "submit", label: "Enviar" };
  if (ticket.status === "failed") return { kind: "submit", label: "Reintentar" };
  if (ticket.status === "submitted") return { kind: "label", label: "Enviado", tone: "success" };
  if (ticket.status === "already_invoiced") return { kind: "label", label: "Facturado", tone: "success" };
  return { kind: "label", label: "Revisar", tone: "error" };
}

function uploadStatusText(item: UploadQueueItem): string {
  if (item.status === "queued") return "En cola";
  if (item.status === "uploading") return "Procesando";
  if (item.status === "error") return "Error";
  if (item.skippedReason) return "Revisar";
  return "Listo";
}

function uploadStatusIcon(item: UploadQueueItem) {
  if (item.status === "done") return <CheckCircle2 size={14} />;
  if (item.status === "error") return <AlertTriangle size={14} />;
  return <Clock3 size={14} />;
}

export function OperatorPortal({ initialSession, initialTickets }: OperatorPortalProps) {
  const [session, setSession] = useState<AppSession | null>(initialSession);
  const [loginRole, setLoginRole] = useState<UserRole>("operator");
  const [password, setPassword] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [uploadedBy, setUploadedBy] = useState("");
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [tickets, setTickets] = useState<GasTicketRecord[]>(initialTickets.map(normalizeTicket));
  const [paymentType, setPaymentType] = useState<PaymentType>("debit");
  const [manualForm, setManualForm] = useState({ folio: "", total: "", iva: "" });
  const [operatorForm, setOperatorForm] = useState({ name: "", pin: "" });
  const [operators, setOperators] = useState<GasOperatorRecord[]>([]);
  const [clientForm, setClientForm] = useState({
    name: initialSession?.name ?? "",
    rfc: "",
    email: initialSession?.clientEmail ?? "",
    taxRegime: "",
  });
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const uploadQueueRef = useRef<UploadQueueItem[]>([]);

  const isAdmin = session?.role === "admin";
  const isOperator = session?.role === "operator";
  const isClient = session?.role === "client";

  const pendingCount = useMemo(
    () => tickets.filter((ticket) => ticket.status === "submit_pending").length,
    [tickets],
  );
  const commissionTotal = useMemo(
    () => tickets.reduce((sum, ticket) => sum + ticket.operatorCommission, 0),
    [tickets],
  );
  const queuedUploadCount = useMemo(
    () => uploadQueue.filter((item) => item.status === "queued" || item.status === "error").length,
    [uploadQueue],
  );

  async function loadTickets() {
    setBusy("load");
    const response = await fetch("/api/tickets", { cache: "no-store" });
    if (response.status === 401) {
      setSession(null);
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
    uploadQueueRef.current = uploadQueue;
  }, [uploadQueue]);

  useEffect(() => {
    return () => {
      for (const item of uploadQueueRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (!isClient) return;

    let cancelled = false;
    fetch("/api/client-profile", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { client?: GasClientRecord } | null) => {
        if (cancelled || !data?.client) return;
        setClientForm({
          name: data.client.name,
          rfc: data.client.rfc,
          email: data.client.email,
          taxRegime: data.client.taxRegime,
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isClient]);

  useEffect(() => {
    if (isAdmin) {
      void loadOperators();
    }
  }, [isAdmin]);

  function addReceiptFiles(files: FileList | null) {
    const nextFiles = Array.from(files ?? []);
    if (nextFiles.length === 0) return;

    setUploadQueue((queue) => [
      ...queue,
      ...nextFiles.map((file) => ({
        id: `${Date.now()}-${crypto.randomUUID()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: "queued" as const,
      })),
    ]);
    setMessage({ type: "neutral", text: `${nextFiles.length} recibo${nextFiles.length === 1 ? "" : "s"} en cola.` });
  }

  function removeQueuedUpload(id: string) {
    setUploadQueue((queue) => {
      const item = queue.find((candidate) => candidate.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return queue.filter((candidate) => candidate.id !== id);
    });
  }

  function clearFinishedUploads() {
    setUploadQueue((queue) => {
      for (const item of queue) {
        if (item.status === "done") URL.revokeObjectURL(item.previewUrl);
      }
      return queue.filter((item) => item.status !== "done");
    });
  }

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("login");
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: loginRole,
        password,
        name: loginName,
        clientEmail: loginEmail,
      }),
    });
    const data = (await response.json()) as { session?: AppSession; error?: string };
    setBusy(null);

    if (!response.ok || !data.session) {
      setMessage({ type: "error", text: data.error ?? "Acceso rechazado." });
      return;
    }

    setPassword("");
    setMessage(null);
    setSession(data.session);
    setUploadedBy(data.session.name ?? "");
    if (data.session.role === "client") {
      setClientForm((form) => ({
        ...form,
        name: data.session?.name ?? form.name,
        email: data.session?.clientEmail ?? form.email,
      }));
    }
    await loadTickets();
  }

  async function logout() {
    await fetch("/api/session", { method: "DELETE" });
    setSession(null);
    setTickets([]);
    setMessage(null);
  }

  async function loadOperators() {
    const response = await fetch("/api/operators", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { operators?: GasOperatorRecord[] };
    setOperators(data.operators ?? []);
  }

  async function saveOperator(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("operator");
    const response = await fetch("/api/operators", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(operatorForm),
    });
    const data = (await response.json()) as { operator?: GasOperatorRecord; error?: string };
    setBusy(null);

    if (!response.ok || !data.operator) {
      setMessage({ type: "error", text: data.error ?? "No se pudo guardar el operador." });
      return;
    }

    setOperatorForm({ name: "", pin: "" });
    setMessage({ type: "success", text: `Operador ${data.operator.name} guardado.` });
    await loadOperators();
  }

  async function saveClientProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("client-profile");
    const response = await fetch("/api/client-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(clientForm),
    });
    const data = (await response.json()) as {
      client?: GasClientRecord;
      session?: AppSession;
      error?: string;
    };
    setBusy(null);

    if (!response.ok || !data.client || !data.session) {
      setMessage({ type: "error", text: data.error ?? "No se pudo guardar el perfil." });
      return;
    }

    setSession(data.session);
    setClientForm({
      name: data.client.name,
      rfc: data.client.rfc,
      email: data.client.email,
      taxRegime: data.client.taxRegime,
    });
    setMessage({ type: "success", text: "Perfil fiscal guardado." });
    await loadTickets();
  }

  async function uploadReceipt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const uploads = uploadQueue.filter((item) => item.status === "queued" || item.status === "error");
    if (uploads.length === 0) {
      setMessage({ type: "error", text: "Selecciona una o mas imagenes del recibo." });
      return;
    }

    setBusy("upload");
    let successCount = 0;
    let errorCount = 0;
    let ticketsCreated = 0;

    for (const item of uploads) {
      setUploadQueue((queue) =>
        queue.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, status: "uploading", error: undefined, skippedReason: undefined }
            : candidate,
        ),
      );

      const formData = new FormData();
      formData.set("receipt", item.file);
      formData.set("uploadedBy", uploadedBy || session?.name || "");
      if (session?.clientId) formData.set("clientId", session.clientId);

      try {
        const response = await fetch("/api/tickets/upload", {
          method: "POST",
          body: formData,
        });
        const data = (await response.json()) as {
          ticketsCreated?: number;
          skippedReason?: string;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "No se pudo subir el recibo.");
        }

        successCount += 1;
        ticketsCreated += data.ticketsCreated ?? 0;
        setUploadQueue((queue) =>
          queue.map((candidate) =>
            candidate.id === item.id
              ? {
                  ...candidate,
                  status: "done",
                  ticketsCreated: data.ticketsCreated ?? 0,
                  skippedReason: data.skippedReason,
                }
              : candidate,
          ),
        );
      } catch (error) {
        errorCount += 1;
        setUploadQueue((queue) =>
          queue.map((candidate) =>
            candidate.id === item.id
              ? {
                  ...candidate,
                  status: "error",
                  error: error instanceof Error ? error.message : "No se pudo subir el recibo.",
                }
              : candidate,
          ),
        );
      }
    }

    setBusy(null);

    setMessage({
      type: errorCount > 0 ? "error" : "success",
      text:
        errorCount > 0
          ? `${successCount} recibo${successCount === 1 ? "" : "s"} guardado${successCount === 1 ? "" : "s"}, ${errorCount} con error.`
          : `${successCount} recibo${successCount === 1 ? "" : "s"} guardado${successCount === 1 ? "" : "s"}. Tickets detectados: ${ticketsCreated}.`,
    });
    if (successCount > 0) await loadTickets();
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

  if (!session) {
    return (
      <main className="login-screen">
        <form className="login-panel stack" onSubmit={login}>
          <span className="brand-mark">
            <LockKeyhole size={22} />
          </span>
          <div>
            <p className="eyebrow">Gasolina</p>
            <h1>Gasolina Tickets</h1>
            <p>Portal privado para recibos, operadores y clientes.</p>
          </div>
          <div className="segmented role-tabs" aria-label="Rol de acceso">
            {(["operator", "admin", "client"] as UserRole[]).map((role) => (
              <button
                key={role}
                type="button"
                className={loginRole === role ? "active" : ""}
                onClick={() => setLoginRole(role)}
              >
                {roleLabels[role]}
              </button>
            ))}
          </div>
          {loginRole !== "admin" && (
            <div className="field">
              <label htmlFor="loginName">{loginRole === "client" ? "Nombre" : "Operador"}</label>
              <input
                id="loginName"
                value={loginName}
                onChange={(event) => setLoginName(event.target.value)}
                autoComplete="name"
              />
            </div>
          )}
          {loginRole === "client" && (
            <div className="field">
              <label htmlFor="loginEmail">Email</label>
              <input
                id="loginEmail"
                type="email"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="password">{loginRole === "operator" ? "PIN" : "Password"}</label>
            <input
              id="password"
              type="password"
              inputMode={loginRole === "operator" ? "numeric" : undefined}
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
        <p>{roleLabels[session.role]}{session.name ? `: ${session.name}` : ""}</p>

        <div className="sidebar-list">
          <div className="sidebar-row">
            <Camera size={16} />
            Recibos
          </div>
          <div className="sidebar-row">
            <Clock3 size={16} />
            {pendingCount} pendientes
          </div>
          {(isAdmin || isOperator) && (
            <div className="sidebar-row">
              <CheckCircle2 size={16} />
              {formatCurrency(commissionTotal)} comision
            </div>
          )}
          {isClient && (
            <div className="sidebar-row">
              <UserRound size={16} />
              {session.clientId ? "Perfil listo" : "Perfil pendiente"}
            </div>
          )}
        </div>
      </aside>

      <section className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Operaciones</p>
            <h2>{isClient ? "Cuenta fiscal" : "Recibos y facturas"}</h2>
          </div>
          <div className="toolbar">
            <button className="button secondary" type="button" onClick={loadTickets} disabled={busy === "load"}>
              <RefreshCw size={16} />
              Actualizar
            </button>
            {isAdmin && (
              <button
                className="button warn"
                type="button"
                onClick={() => submit()}
                disabled={busy === "submit-all" || pendingCount === 0}
              >
                <Send size={16} />
                Enviar cola
              </button>
            )}
            <button className="button secondary" type="button" onClick={logout}>
              <LogOut size={16} />
              Salir
            </button>
          </div>
        </div>

        {message && <StatusMessage message={message} />}

        <div className="grid" style={{ marginTop: message ? 14 : 0 }}>
          <div className="stack">
            {isAdmin && (
              <section className="panel">
                <div className="panel-header">
                  <h3>Operadores</h3>
                  <UserPlus size={18} />
                </div>
                <form className="panel-body stack" onSubmit={saveOperator}>
                  <div className="field">
                    <label htmlFor="operatorName">Nombre</label>
                    <input
                      id="operatorName"
                      value={operatorForm.name}
                      onChange={(event) => setOperatorForm((form) => ({ ...form, name: event.target.value }))}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="operatorPin">PIN</label>
                    <input
                      id="operatorPin"
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]{4,8}"
                      value={operatorForm.pin}
                      onChange={(event) => setOperatorForm((form) => ({ ...form, pin: event.target.value }))}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  <button className="button full" type="submit" disabled={busy === "operator"}>
                    <KeyRound size={16} />
                    Guardar operador
                  </button>
                  {operators.length > 0 && (
                    <div className="mini-list">
                      {operators.map((operator) => (
                        <div className="mini-row" key={operator.id}>
                          <span>{operator.name}</span>
                          <span>{operator.active ? "Activo" : "Inactivo"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </form>
              </section>
            )}

            {isClient && (
              <section className="panel">
                <div className="panel-header">
                  <h3>Perfil fiscal</h3>
                  <UserRound size={18} />
                </div>
                <form className="panel-body stack" onSubmit={saveClientProfile}>
                  <div className="field">
                    <label htmlFor="clientName">Nombre</label>
                    <input
                      id="clientName"
                      value={clientForm.name}
                      onChange={(event) => setClientForm((form) => ({ ...form, name: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="clientRfc">RFC</label>
                    <input
                      id="clientRfc"
                      value={clientForm.rfc}
                      onChange={(event) => setClientForm((form) => ({ ...form, rfc: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="clientEmail">Email</label>
                    <input
                      id="clientEmail"
                      type="email"
                      value={clientForm.email}
                      onChange={(event) => setClientForm((form) => ({ ...form, email: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="clientTaxRegime">Regimen fiscal</label>
                    <input
                      id="clientTaxRegime"
                      value={clientForm.taxRegime}
                      onChange={(event) => setClientForm((form) => ({ ...form, taxRegime: event.target.value }))}
                      required
                    />
                  </div>
                  <button className="button full" type="submit" disabled={busy === "client-profile"}>
                    <UserRound size={16} />
                    Guardar perfil
                  </button>
                </form>
              </section>
            )}

            <section className="panel">
              <div className="panel-header">
                <h3>Subir recibo</h3>
                <Upload size={18} />
              </div>
              <form className="panel-body stack" onSubmit={uploadReceipt}>
                <label className="file-drop">
                  <span className="drop-inner">
                    <Camera size={28} />
                    <span>
                      <strong>Fotos de recibos</strong>
                      JPG, PNG o WebP
                    </span>
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    multiple
                    onChange={(event) => {
                      addReceiptFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
                {uploadQueue.length > 0 && (
                  <div className="upload-queue">
                    <div className="upload-queue-header">
                      <span>{uploadQueue.length} en cola</span>
                      {uploadQueue.some((item) => item.status === "done") && (
                        <button className="link-button" type="button" onClick={clearFinishedUploads}>
                          Limpiar listos
                        </button>
                      )}
                    </div>
                    <div className="upload-queue-list">
                      {uploadQueue.map((item) => (
                        <div className={`upload-queue-item ${item.status}`} key={item.id}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.previewUrl} alt="" />
                          <div className="upload-queue-meta">
                            <span className="upload-file-name" title={item.file.name}>
                              {item.file.name}
                            </span>
                            <span className={`status-pill ${item.status === "done" ? "submitted" : item.status}`}>
                              {uploadStatusIcon(item)}
                              {uploadStatusText(item)}
                            </span>
                            {(item.error || item.skippedReason || item.status === "done") && (
                              <span className="upload-queue-note">
                                {item.error ??
                                  item.skippedReason ??
                                  `Tickets detectados: ${item.ticketsCreated ?? 0}`}
                              </span>
                            )}
                          </div>
                          <button
                            className="icon-button"
                            type="button"
                            onClick={() => removeQueuedUpload(item.id)}
                            disabled={item.status === "uploading"}
                            aria-label={`Quitar ${item.file.name}`}
                            title="Quitar"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!isClient && (
                  <div className="field">
                    <label htmlFor="uploadedBy">Operador</label>
                    <input
                      id="uploadedBy"
                      value={uploadedBy}
                      onChange={(event) => setUploadedBy(event.target.value)}
                      placeholder="Nombre"
                    />
                  </div>
                )}
                <button
                  className="button full"
                  type="submit"
                  disabled={busy === "upload" || queuedUploadCount === 0 || (isClient && !session.clientId)}
                >
                  <Upload size={16} />
                  {queuedUploadCount > 1 ? `Subir ${queuedUploadCount} recibos` : "Subir recibo"}
                </button>
              </form>
            </section>

            {isAdmin && (
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
            )}
          </div>

          <section className="panel">
            <div className="panel-header">
              <h3>{isOperator ? "Mis tickets" : "Cola de factura"}</h3>
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
                      {isAdmin && <th>Cliente</th>}
                      {isAdmin && <th>Operador</th>}
                      <th>Total</th>
                      <th>IVA</th>
                      {(isAdmin || isOperator) && <th>Comision</th>}
                      <th>Estado</th>
                      <th>Recibo</th>
                      {isAdmin && <th>Accion</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((ticket) => (
                      <tr key={ticket.id}>
                        <td className="num">{ticket.folio}</td>
                        {isAdmin && <td>{ticket.clientName ?? "Gasolina"}</td>}
                        {isAdmin && <td>{ticket.operatorName ?? "Manual"}</td>}
                        <td className="num">{formatCurrency(ticket.importeTotal)}</td>
                        <td className="num">{ticket.iva === null ? "-" : formatCurrency(ticket.iva)}</td>
                        {(isAdmin || isOperator) && (
                          <td className="num">{formatCurrency(ticket.operatorCommission)}</td>
                        )}
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
                        {isAdmin && (
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
                        )}
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
