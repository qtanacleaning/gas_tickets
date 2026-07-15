"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
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
  WalletCards,
} from "lucide-react";
import type { AppSession } from "@/lib/auth";
import type {
  CommissionSummary,
  GasClientRecord,
  GasOperatorRecord,
  GasTicketRecord,
  GasTicketStatus,
  MonthlyTicketReport,
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

type SubmitResult = {
  ticketId?: string;
  status?: string;
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
    commissionStatus: ticket.commissionStatus ?? "pending",
    commissionPaidAmount: Number(ticket.commissionPaidAmount ?? 0),
    ticketDate: ticket.ticketDate ?? ticket.createdAt.slice(0, 10),
  };
}

function formatTicketDate(value: string): string {
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function formatMonth(value: string): string {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  );
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

function summarizeSubmitResults(results: SubmitResult[]): Message {
  if (results.length === 0) {
    return { type: "neutral", text: "No habia tickets pendientes para enviar." };
  }

  const submitted = results.filter((result) => result.status === "submitted").length;
  const alreadyInvoiced = results.filter((result) => result.status === "already_invoiced").length;
  const failed = results.filter((result) => result.status === "failed" || result.error).length;
  const ok = submitted + alreadyInvoiced;
  const parts = [
    `${ok} enviado${ok === 1 ? "" : "s"}`,
    alreadyInvoiced > 0 ? `${alreadyInvoiced} ya facturado${alreadyInvoiced === 1 ? "" : "s"}` : null,
    failed > 0 ? `${failed} con error` : null,
  ].filter(Boolean);

  return {
    type: failed > 0 ? "error" : "success",
    text: `Cola procesada: ${parts.join(", ")}.`,
  };
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
  const [manualForm, setManualForm] = useState({
    folio: "",
    total: "",
    iva: "",
    ticketDate: new Date().toISOString().slice(0, 10),
  });
  const [operatorForm, setOperatorForm] = useState({ name: "", pin: "" });
  const [operators, setOperators] = useState<GasOperatorRecord[]>([]);
  const [clients, setClients] = useState<GasClientRecord[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(initialSession?.clientId ?? "");
  const [monthlyReport, setMonthlyReport] = useState<MonthlyTicketReport[]>([]);
  const [commissions, setCommissions] = useState<CommissionSummary[]>([]);
  const [clientAccountForm, setClientAccountForm] = useState({
    name: "",
    rfc: "",
    email: "",
    taxRegime: "",
    password: "",
  });
  const [commissionPayment, setCommissionPayment] = useState({ operatorKey: "", amount: "" });
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

  const pendingCount = tickets.length;
  const submittableCount = useMemo(
    () => tickets.filter((ticket) => ticket.status === "submit_pending").length,
    [tickets],
  );
  const commissionTotal = useMemo(() => commissions.reduce((sum, item) => sum + item.pendingAmount, 0), [commissions]);
  const queuedUploadCount = useMemo(
    () => uploadQueue.filter((item) => item.status === "queued" || item.status === "error").length,
    [uploadQueue],
  );
  const selectedCommission = useMemo(
    () =>
      commissions.find(
        (item) => (item.operatorId ?? `name:${item.operatorName}`) === commissionPayment.operatorKey,
      ) ?? null,
    [commissionPayment.operatorKey, commissions],
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

  async function loadClients() {
    const response = await fetch("/api/clients", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { clients?: GasClientRecord[] };
    const nextClients = data.clients ?? [];
    setClients(nextClients);
    setSelectedClientId((current) => current || nextClients[0]?.id || "");
  }

  async function loadReports() {
    const response = await fetch("/api/reports/monthly", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { months?: MonthlyTicketReport[] };
    setMonthlyReport(data.months ?? []);
  }

  async function loadCommissions() {
    const response = await fetch("/api/commissions", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { commissions?: CommissionSummary[] };
    const nextCommissions = data.commissions ?? [];
    setCommissions(nextCommissions);
    setCommissionPayment((current) => ({
      ...current,
      operatorKey:
        current.operatorKey ||
        (nextCommissions[0]
          ? nextCommissions[0].operatorId ?? `name:${nextCommissions[0].operatorName}`
          : ""),
    }));
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
    if (!session) return;
    void loadReports();
    if (isAdmin) void loadOperators();
    if (isAdmin || isOperator) {
      void loadClients();
      void loadCommissions();
    }
  }, [isAdmin, isOperator, session]);

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
    setSelectedClientId(data.session.clientId ?? "");
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
    setClients([]);
    setMonthlyReport([]);
    setCommissions([]);
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

  async function saveClientAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("client-account");
    const response = await fetch("/api/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(clientAccountForm),
    });
    const data = (await response.json()) as { client?: GasClientRecord; error?: string };
    setBusy(null);

    if (!response.ok || !data.client) {
      setMessage({ type: "error", text: data.error ?? "No se pudo guardar la cuenta del cliente." });
      return;
    }

    setClientAccountForm({ name: "", rfc: "", email: "", taxRegime: "", password: "" });
    setSelectedClientId(data.client.id);
    setMessage({ type: "success", text: `Cuenta de ${data.client.name} guardada.` });
    await loadClients();
  }

  async function payCommission(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const summary = commissions.find(
      (item) => (item.operatorId ?? `name:${item.operatorName}`) === commissionPayment.operatorKey,
    );
    if (!summary) return;

    setBusy("commission-payment");
    const response = await fetch("/api/commissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operatorId: summary.operatorId,
        operatorName: summary.operatorName,
        amount: commissionPayment.amount,
      }),
    });
    const data = (await response.json()) as { paymentId?: string; error?: string };
    setBusy(null);

    if (!response.ok || !data.paymentId) {
      setMessage({ type: "error", text: data.error ?? "No se pudo registrar el pago." });
      return;
    }

    setCommissionPayment((current) => ({ ...current, amount: "" }));
    setMessage({ type: "success", text: `Pago de comision registrado para ${summary.operatorName}.` });
    await loadCommissions();
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
      const clientId = session?.role === "client" ? session.clientId : selectedClientId;
      if (clientId) formData.set("clientId", clientId);

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
      body: JSON.stringify({ ...manualForm, paymentType, clientId: selectedClientId }),
    });
    const data = (await response.json()) as { ticket?: GasTicketRecord; error?: string };
    setBusy(null);

    if (!response.ok || !data.ticket) {
      setMessage({ type: "error", text: data.error ?? "No se pudo crear el ticket." });
      return;
    }

    setManualForm({ folio: "", total: "", iva: "", ticketDate: new Date().toISOString().slice(0, 10) });
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
    const data = (await response.json()) as { result?: SubmitResult | SubmitResult[]; error?: string };
    setBusy(null);

    if (!response.ok) {
      setMessage({ type: "error", text: data.error ?? "No se pudo enviar a factura." });
      await loadTickets();
      return;
    }

    if (ticketId) {
      setMessage({ type: "success", text: "Ticket enviado." });
    } else {
      setMessage(summarizeSubmitResults(Array.isArray(data.result) ? data.result : []));
    }
    await loadTickets();
    await Promise.all([loadReports(), loadCommissions()]);
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
          {loginRole === "operator" && (
            <div className="field">
              <label htmlFor="loginName">Operador</label>
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
              {formatCurrency(commissionTotal)} comision pendiente
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
                disabled={busy === "submit-all" || submittableCount === 0}
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

            {isAdmin && (
              <section className="panel">
                <div className="panel-header">
                  <h3>Cuentas de clientes</h3>
                  <Building2 size={18} />
                </div>
                <form className="panel-body stack" onSubmit={saveClientAccount}>
                  <div className="field">
                    <label htmlFor="accountName">Nombre o razon social</label>
                    <input
                      id="accountName"
                      value={clientAccountForm.name}
                      onChange={(event) => setClientAccountForm((form) => ({ ...form, name: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="field-row">
                    <div className="field">
                      <label htmlFor="accountRfc">RFC</label>
                      <input
                        id="accountRfc"
                        value={clientAccountForm.rfc}
                        onChange={(event) => setClientAccountForm((form) => ({ ...form, rfc: event.target.value }))}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="accountTaxRegime">Regimen fiscal</label>
                      <input
                        id="accountTaxRegime"
                        value={clientAccountForm.taxRegime}
                        onChange={(event) =>
                          setClientAccountForm((form) => ({ ...form, taxRegime: event.target.value }))
                        }
                        required
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="accountEmail">Email de acceso</label>
                    <input
                      id="accountEmail"
                      type="email"
                      value={clientAccountForm.email}
                      onChange={(event) => setClientAccountForm((form) => ({ ...form, email: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="accountPassword">Password temporal</label>
                    <input
                      id="accountPassword"
                      type="password"
                      minLength={8}
                      value={clientAccountForm.password}
                      onChange={(event) =>
                        setClientAccountForm((form) => ({ ...form, password: event.target.value }))
                      }
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  <button className="button full" type="submit" disabled={busy === "client-account"}>
                    <Building2 size={16} />
                    Guardar cuenta
                  </button>
                  {clients.length > 0 && (
                    <div className="mini-list">
                      {clients.map((client) => (
                        <div className="mini-row" key={client.id}>
                          <span>{client.name}</span>
                          <span>{client.rfc}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </form>
              </section>
            )}

            {(isAdmin || isOperator) && (
              <section className="panel">
                <div className="panel-header">
                  <h3>Comisiones</h3>
                  <WalletCards size={18} />
                </div>
                <div className="panel-body stack">
                  <div className="mini-list">
                    {commissions.map((commission) => (
                      <div className="commission-row" key={commission.operatorId ?? commission.operatorName}>
                        <div>
                          <strong>{commission.operatorName}</strong>
                          <span>{formatCurrency(commission.pendingAmount)} pendiente</span>
                        </div>
                        <span className={`status-pill commission-${commission.status}`}>
                          {commission.status === "paid" ? "Pagada" : "Pendiente"}
                        </span>
                      </div>
                    ))}
                    {commissions.length === 0 && <div className="empty-compact">Sin comisiones registradas.</div>}
                  </div>
                  {isAdmin && commissions.length > 0 && (
                    <form className="stack commission-form" onSubmit={payCommission}>
                      <div className="field">
                        <label htmlFor="commissionOperator">Operador</label>
                        <select
                          id="commissionOperator"
                          value={commissionPayment.operatorKey}
                          onChange={(event) => {
                            const summary = commissions.find(
                              (item) =>
                                (item.operatorId ?? `name:${item.operatorName}`) === event.target.value,
                            );
                            setCommissionPayment({
                              operatorKey: event.target.value,
                              amount: summary?.pendingAmount ? String(summary.pendingAmount) : "",
                            });
                          }}
                        >
                          {commissions.map((commission) => {
                            const key = commission.operatorId ?? `name:${commission.operatorName}`;
                            return <option key={key} value={key}>{commission.operatorName}</option>;
                          })}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="commissionAmount">Monto pagado</label>
                        <input
                          id="commissionAmount"
                          type="number"
                          min="0.01"
                          max={selectedCommission?.pendingAmount || undefined}
                          step="0.01"
                          value={commissionPayment.amount}
                          onChange={(event) =>
                            setCommissionPayment((current) => ({ ...current, amount: event.target.value }))
                          }
                          required
                        />
                      </div>
                      <button
                        className="button full"
                        type="submit"
                        disabled={busy === "commission-payment" || !selectedCommission?.pendingAmount}
                      >
                        <CheckCircle2 size={16} />
                        Registrar pago
                      </button>
                    </form>
                  )}
                </div>
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
                {!isClient && (
                  <div className="field">
                    <label htmlFor="uploadClient">Cuenta del cliente</label>
                    <select
                      id="uploadClient"
                      value={selectedClientId}
                      onChange={(event) => setSelectedClientId(event.target.value)}
                      required
                    >
                      <option value="">Seleccionar cliente</option>
                      {clients.map((client) => (
                        <option value={client.id} key={client.id}>{client.name} - {client.rfc}</option>
                      ))}
                    </select>
                  </div>
                )}
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
                  disabled={
                    busy === "upload" ||
                    queuedUploadCount === 0 ||
                    (isClient ? !session.clientId : !selectedClientId)
                  }
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
                    <label htmlFor="manualClient">Cuenta del cliente</label>
                    <select
                      id="manualClient"
                      value={selectedClientId}
                      onChange={(event) => setSelectedClientId(event.target.value)}
                      required
                    >
                      <option value="">Seleccionar cliente</option>
                      {clients.map((client) => (
                        <option value={client.id} key={client.id}>{client.name} - {client.rfc}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="ticketDate">Fecha del ticket</label>
                    <input
                      id="ticketDate"
                      type="date"
                      value={manualForm.ticketDate}
                      onChange={(event) =>
                        setManualForm((form) => ({ ...form, ticketDate: event.target.value }))
                      }
                      required
                    />
                  </div>
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
                  <button
                    className="button full"
                    type="submit"
                    disabled={busy === "manual" || !selectedClientId}
                  >
                    <FilePlus2 size={16} />
                    Agregar ticket
                  </button>
                </form>
              </section>
            )}
          </div>

          <div className="stack">
          <section className="panel">
            <div className="panel-header">
              <h3>{isOperator ? "Mis tickets" : "Cola de factura"}</h3>
              <span className="status-pill submit_pending">{pendingCount} pendientes</span>
            </div>
            <div className="table-wrap">
              {tickets.length === 0 ? (
                <div className="empty-state">No hay tickets pendientes.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
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
                        <td className="num">{formatTicketDate(ticket.ticketDate)}</td>
                        <td className="num">{ticket.folio}</td>
                        {isAdmin && <td>{ticket.clientName ?? "Sin cliente"}</td>}
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
          <section className="panel">
            <div className="panel-header">
              <div>
                <h3>Tickets enviados por mes</h3>
                <span className="panel-subtitle">Historial de facturacion exitosa</span>
              </div>
              <BarChart3 size={18} />
            </div>
            <div className="table-wrap">
              {monthlyReport.length === 0 ? (
                <div className="empty-state">Todavia no hay tickets enviados.</div>
              ) : (
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Mes</th>
                      <th>Tickets enviados</th>
                      <th>Total facturado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyReport.map((month) => (
                      <tr key={month.month}>
                        <td className="month-cell"><CalendarDays size={15} />{formatMonth(month.month)}</td>
                        <td className="num"><strong>{month.submittedCount}</strong></td>
                        <td className="num">{formatCurrency(month.submittedTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
          </div>
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
