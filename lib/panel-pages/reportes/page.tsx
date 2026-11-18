import Link from "next/link";
import { Download, FileBarChart2 } from "lucide-react";
import { canManage, requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeReportFilters, reportServices, serviceReportOverview, statusName } from "@/lib/pilot";
import { Badge, chileDate, Empty } from "@/components/UI";
import {companyName,serviceFolio} from "@/lib/companies";

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; status?: string; client_id?: string; company?:string;pagina?:string }> }) {
  const actor = await requireActor();
  const query=await searchParams,filters = normalizeReportFilters(query);
  const [overview, clients] = await Promise.all([
    serviceReportOverview(actor, filters),
    canManage(actor) ? db.query<{ id: string; name: string }>("SELECT id,name FROM clients WHERE deleted_at IS NULL ORDER BY name") : Promise.resolve([]),
  ]);
  const pages=Math.max(1,Math.ceil(overview.total/100)),requested=Number(query.pagina);
  const page=Math.min(pages,Number.isSafeInteger(requested)&&requested>=1?requested:1);
  const rows=await reportServices(actor,filters,{limit:100,offset:(page-1)*100});
  const params = new URLSearchParams(filters);
  const pageHref=(number:number)=>`/reportes?${new URLSearchParams({...filters,pagina:String(number)})}`;
  return <>
    <div className="page-title-row"><div><div className="eyebrow">CONTROL DE GESTIÓN</div><h1>Reportes de servicios</h1><p className="page-intro">Filtre el historial y exporte los registros que puede consultar su perfil.</p></div><span className="title-icon"><FileBarChart2 size={24}/></span></div>
    <section className="section-card"><form method="GET" action="/reportes" className={`report-filters service-report-filters${canManage(actor)?"":" service-report-filters--scoped"}`}><label>Desde<input name="from" type="date" defaultValue={filters.from}/></label><label>Hasta<input name="to" type="date" defaultValue={filters.to}/></label><label>Empresa<select name="company" defaultValue={filters.company}><option value="">Todas</option><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option><option value="pendiente">Por clasificar</option></select></label><label>Estado<select name="status" defaultValue={filters.status}><option value="">Todos</option>{Object.entries(statusName).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></label>{canManage(actor) && <label>Cliente<select name="client_id" defaultValue={filters.client_id}><option value="">Todos</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label>}<button type="submit" className="button button-outline">Aplicar filtros</button></form>
      <div className="report-summary"><div><strong>{overview.total}</strong><span>Servicios</span></div><div><strong>{overview.completed}</strong><span>Completados</span></div><div><strong>{overview.netKg.toLocaleString("es-CL",{maximumFractionDigits:2})} kg</strong><span>Peso neto registrado</span></div><Link className="button button-primary" href={`/api/reportes/servicios?${params}`}><Download size={16}/> Exportar CSV</Link></div>
      <p className="helper-text">Indicadores de todos los servicios del filtro. Neto de {overview.weighed} {overview.weighed===1?"servicio completado":"servicios completados"} con bruto y tara registrados. El CSV incluye todo el filtro.</p>
      {rows.length?<div className="table-wrap" role="region" aria-label="Servicios del reporte" tabIndex={0}><table className="data-table report-table"><colgroup><col style={{width:"11%"}}/><col style={{width:"20%"}}/><col style={{width:"15%"}}/><col style={{width:"13%"}}/><col style={{width:"10%"}}/><col style={{width:"23%"}}/><col style={{width:"8%"}}/></colgroup><thead><tr><th>Folio / empresa</th><th>Cliente / faena</th><th>Material</th><th>Creación</th><th>Estado</th><th>Camión / conductor</th><th>Peso neto</th></tr></thead><tbody>{rows.map((s) => <tr key={s.id}><td><Link href={`/solicitudes/${s.id}`} className="table-main">{serviceFolio(s)}</Link><small className="table-sub">{companyName(s.operating_company)}</small></td><td><strong>{s.client_name}</strong><small className="table-sub">{s.site_name}</small></td><td>{s.waste_type}<small className="table-sub capitalize">{s.service_type}</small></td><td>{chileDate(s.created_at)}</td><td><Badge status={s.status}/></td><td><span className="report-asset-label" title={s.asset_label??undefined}>{s.asset_label ?? "—"}</span><small className="table-sub">{s.driver_name ?? "—"}</small></td><td className="report-net">{s.gross_kg !== null && s.tare_kg !== null ? `${(Number(s.gross_kg)-Number(s.tare_kg)).toLocaleString("es-CL")} kg` : "—"}</td></tr>)}</tbody></table></div>:<><Empty title="Sin servicios para estos filtros" detail="Cambie el período, el estado o el cliente para consultar otros resultados."/>{(filters.from||filters.to||filters.status||filters.client_id)&&<Link className="text-link report-reset" href={"/reportes?"+new URLSearchParams({company:filters.company})}>Restablecer filtros</Link>}</>}
      {pages>1&&<nav className="records-pagination" aria-label="Páginas del reporte de servicios"><span>{page>1&&<Link className="button button-outline" href={pageHref(page-1)}>Anterior</Link>}</span><span>Página {page} de {pages}</span><span>{page<pages&&<Link className="button button-outline" href={pageHref(page+1)}>Siguiente</Link>}</span></nav>}
    </section>
  </>;
}
