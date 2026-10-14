import Link from "next/link";
import { SubmitButton } from "@/components/Transition";
import { Plus, Search } from "lucide-react";
import { requireActor } from "@/lib/auth";
import { listServices } from "@/lib/pilot";
import { ServiceTable } from "@/components/UI";
import {companies} from "@/lib/companies";

export default async function Requests({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; empresa?:string;tipo?:string }> }) {
  const actor = await requireActor();
  const { q = "", estado = "", empresa = "",tipo="" } = await searchParams;
  const validStatus = ["solicitada", "programada", "en_ruta", "pendiente_revision", "completada", "cancelada"].includes(estado) ? estado : "";
  const company=["rerchar","e_y_j","pendiente"].includes(empresa)?empresa:"";
  const kind=["traslado","arriendo","retiro","compra","venta","otro"].includes(tipo)?tipo:"";
  const services = await listServices(actor, q, validStatus,company,kind);
  return <>
    <div className="page-title-row"><div><div className="eyebrow">OPERACIÓN</div><h1>Solicitudes de servicio</h1><p className="page-intro">Registros, planificación y seguimiento en un solo lugar.</p></div>
      {actor.role !== "conductor" && <div className="order-actions"><Link href="/cotizaciones/nueva" className="button button-primary"><Plus size={18}/> Nueva cotización</Link><Link href="/solicitudes/nueva" className="button button-outline">Solicitud directa</Link></div>}</div>
    <section className="section-card"><form className="filters" action="/solicitudes" method="GET"><label className="search-field"><Search size={18}/><input name="q" type="search" placeholder="Buscar por folio, cliente o material/equipo" defaultValue={q.slice(0,100)} aria-label="Buscar solicitudes"/></label><select name="empresa" defaultValue={company} aria-label="Filtrar por empresa"><option value="">Todas las empresas</option>{Object.entries(companies).map(([key,c])=><option key={key} value={key}>{c.short}</option>)}<option value="pendiente">Por clasificar</option></select><select name="tipo" defaultValue={kind} aria-label="Filtrar por tipo de solicitud"><option value="">Todos los tipos</option><optgroup label="Servicios"><option value="traslado">Traslado</option><option value="arriendo">Arriendo</option></optgroup><optgroup label="Material"><option value="compra">Compra</option><option value="venta">Venta</option><option value="retiro">Retiro</option></optgroup><option value="otro">Otro</option></select><select name="estado" defaultValue={validStatus} aria-label="Filtrar por estado"><option value="">Todos los estados</option><option value="solicitada">Solicitada</option><option value="programada">Programada</option><option value="en_ruta">En ruta</option><option value="pendiente_revision">Revisión administrativa</option><option value="completada">Completada</option></select><button className="button button-outline" type="submit">Filtrar</button></form><ServiceTable services={services}/></section>
  </>;
}
