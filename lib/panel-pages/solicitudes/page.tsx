import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requireActor } from "@/lib/auth";
import { listServices } from "@/lib/pilot";
import { ServiceTable } from "@/components/UI";
import { companies } from "@/lib/companies";

type RequestQuery = {
  q?: string; estado?: string; empresa?: string; tipo?: string;
  cierre_mes?: string; prioridad?: string; pagina?: string;
};

export default async function Requests({ searchParams }: { searchParams: Promise<RequestQuery> }) {
  const actor = await requireActor();
  const query = await searchParams;
  const term = typeof query.q === "string" ? query.q.slice(0, 100) : "";
  const status = ["abiertas", "solicitada", "programada", "en_ruta", "pendiente_revision", "completada", "cancelada"].includes(query.estado ?? "") ? query.estado ?? "" : "";
  const company = ["rerchar", "e_y_j", "pendiente"].includes(query.empresa ?? "") ? query.empresa ?? "" : "";
  const kind = ["traslado", "arriendo", "retiro", "compra", "venta", "otro"].includes(query.tipo ?? "") ? query.tipo ?? "" : "";
  const priority = ["normal", "alta", "critica"].includes(query.prioridad ?? "") ? query.prioridad ?? "" : "";
  const closedMonth = status === "completada" && /^\d{4}-(0[1-9]|1[0-2])$/.test(query.cierre_mes ?? "") ? query.cierre_mes ?? "" : "";
  const requestedPage = Number(query.pagina);
  const pageNumber = Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 10_000 ? requestedPage : 1;
  const pageSize = 50;
  const rows = await listServices(actor, term, status, company, kind, pageSize + 1, closedMonth, priority, (pageNumber - 1) * pageSize);
  const services = rows.slice(0, pageSize);
  const hasMore = rows.length > pageSize;
  const filters = new URLSearchParams({ q: term, estado: status, empresa: company, tipo: kind, prioridad: priority, cierre_mes: closedMonth });
  const pageHref = (page: number) => {
    const params = new URLSearchParams(filters);
    params.set("pagina", String(page));
    return `/solicitudes?${params}`;
  };
  const companyParam = company === "rerchar" || company === "e_y_j" ? `?empresa=${company}` : "";

  return <>
    <div className="page-title-row"><div><div className="eyebrow">OPERACIÓN</div><h1>Solicitudes de servicio</h1><p className="page-intro">Registros, planificación y seguimiento en un solo lugar.</p></div>
      {actor.role !== "conductor" && <div className="order-actions">
        {actor.role !== "cliente" && <Link href={`/cotizaciones/nueva${companyParam}`} className="button button-primary"><Plus size={18}/> Nueva cotización</Link>}
        <Link href={`/solicitudes/nueva${companyParam}`} className="button button-outline">Solicitud directa</Link>
      </div>}
    </div>
    <section className="section-card">
      <form className="filters" action="/solicitudes" method="GET">
        <label className="search-field"><Search size={18}/><input name="q" type="search" placeholder="Buscar por folio, cliente o material/equipo" defaultValue={term} aria-label="Buscar solicitudes"/></label>
        <select name="empresa" defaultValue={company} aria-label="Filtrar por empresa"><option value="">Todas las empresas</option>{Object.entries(companies).map(([key, item]) => <option key={key} value={key}>{item.short}</option>)}<option value="pendiente">Por clasificar</option></select>
        <select name="tipo" defaultValue={kind} aria-label="Filtrar por tipo de solicitud"><option value="">Todos los tipos</option><optgroup label="Servicios"><option value="traslado">Traslado</option><option value="arriendo">Arriendo</option></optgroup><optgroup label="Material"><option value="compra">Compra</option><option value="venta">Venta</option><option value="retiro">Retiro</option></optgroup><option value="otro">Otro</option></select>
        <select name="estado" defaultValue={status} aria-label="Filtrar por estado"><option value="">Todos los estados</option><option value="abiertas">Abiertas</option><option value="solicitada">Solicitada</option><option value="programada">Programada</option><option value="en_ruta">En ruta</option><option value="pendiente_revision">Revisión administrativa</option><option value="completada">Completada</option><option value="cancelada">Cancelada</option></select>
        <select name="prioridad" defaultValue={priority} aria-label="Filtrar por prioridad"><option value="">Todas las prioridades</option><option value="critica">Crítica</option><option value="alta">Alta</option><option value="normal">Normal</option></select>
        {status === "completada" && <label className="request-close-month">Mes de cierre<input name="cierre_mes" type="month" defaultValue={closedMonth} aria-label="Filtrar por mes de cierre"/></label>}
        <button className="button button-outline" type="submit">Filtrar</button>
      </form>
      <ServiceTable services={services}/>
      {(pageNumber > 1 || hasMore) && <nav className="records-pagination" aria-label="Páginas de solicitudes">
        <span>{pageNumber > 1 && <Link className="button button-outline" href={pageHref(pageNumber - 1)}>Anterior</Link>}</span>
        <span>Página {pageNumber} · hasta 50 solicitudes</span>
        <span>{hasMore && <Link className="button button-outline" href={pageHref(pageNumber + 1)}>Siguiente</Link>}</span>
      </nav>}
    </section>
  </>;
}
