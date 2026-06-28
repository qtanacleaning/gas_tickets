import { OperatorPortal } from "@/components/OperatorPortal";
import { hasOperatorSession } from "@/lib/auth";
import { listTickets } from "@/lib/gas/repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const isAuthenticated = await hasOperatorSession();
  const initialTickets = isAuthenticated ? await listTickets(75).catch(() => []) : [];

  return <OperatorPortal initialAuthenticated={isAuthenticated} initialTickets={initialTickets} />;
}
