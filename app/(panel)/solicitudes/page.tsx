import Link from "next/link";
import { SubmitButton } from "@/components/Transition";
import { Plus, Search } from "lucide-react";
import { requireActor } from "@/lib/auth";
import { listServices } from "@/lib/pilot";
import { ServiceTable } from "@/components/UI";

export default async function Requests({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string }> }) {
  const actor = await requireActor();
  const { q = "", estado = "" } = await searchParams;
  const validStatus = ["solicitada", "programada", "en_ruta", "completada", "cancelada"].includes(estado) ? estado : "";
  const services = await listServices(actor, q, validStatus);
  return <>
    <div className="page-title-row"><div><div className="eyebrow">OPERACIÓN</div><h1>Solicitudes de servicio</h1><p className="page-intro">Registros, planificación y seguimiento en un solo lugar.</p></div>
      {actor.role !== "conductor" && <Link href="/solicitudes/nueva" className="button button-primary"><Plus size={18}/> Nueva solicitud</Link>}</div>
    <section className="section-card"><form className="filters" action="/solicitudes" method="GET"><label className="search-field"><Search size={18}/><input name="q" type="search" placeholder="Buscar por folio, cliente o residuo" defaultValue={q.slice(0,100)} aria-label="Buscar solicitudes"/></label><select name="estado" defaultValue={validStatus} aria-label="Filtrar por estado"><option value="">Todos los estados</option><option value="solicitada">Solicitada</option><option value="programada">Programada</option><option value="en_ruta">En ruta</option><option value="completada">Completada</option></select><button className="button button-outline" type="submit">Filtrar</button></form><ServiceTable services={services}/></section>
  </>;
}
