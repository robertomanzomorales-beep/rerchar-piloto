import Link from "next/link";
import { Download, FileBarChart2 } from "lucide-react";
import { canManage, requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeReportFilters, reportFilterIssue, reportServices, serviceReportOverview, statusName, type ReportFilterInput } from "@/lib/pilot";
import { Badge, chileDate, Empty } from "@/components/UI";
import {companies,companyName,serviceFolio} from "@/lib/companies";

export default async function Reports({ searchParams }: { searchParams: Promise<ReportFilterInput & {pagina?:string|string[]}> }) {
  const actor = await requireActor();
  const query=await searchParams,filters = normalizeReportFilters(query),issue=reportFilterIssue(query);
  const [overview, clients] = await Promise.all([
    issue ? Promise.resolve({total:0,completed:0,netKg:0,weighed:0}) : serviceReportOverview(actor, filters),
    canManage(actor) ? db.query<{ id: string; name: string }>("SELECT id,name FROM clients WHERE deleted_at IS NULL ORDER BY name") : Promise.resolve([]),
  ]);
  const pages=Math.max(1,Math.ceil(overview.total/100)),requested=Number(query.pagina);
  const page=Math.min(pages,Number.isSafeInteger(requested)&&requested>=1?requested:1);
  const rows=issue?[]:await reportServices(actor,filters,{limit:100,offset:(page-1)*100});
  const params = new URLSearchParams(filters);
  const pageHref=(number:number)=>`/reportes?${new URLSearchParams({...filters,pagina:String(number)})}#resultados-reporte`;
  const canReset=Boolean(issue||filters.from||filters.to||filters.status||filters.client_id);
  const number=(value:number)=>value.toLocaleString("es-CL");
  return <>
    <div className="page-title-row"><div><div className="eyebrow">CONTROL DE GESTIÓN</div><h1>Reportes de servicios</h1><p className="page-intro">Filtre el historial y exporte los registros que puede consultar su perfil.</p></div><span className="title-icon"><FileBarChart2 size={24}/></span></div>
    <section className="section-card"><form key={params.toString()} method="GET" action="/reportes" aria-describedby="report-filter-help" className={`report-filters service-report-filters${canManage(actor)?"":" service-report-filters--scoped"}`}><label>Desde<input name="from" type="date" max={filters.to||undefined} defaultValue={filters.from}/></label><label>Hasta<input name="to" type="date" min={filters.from||undefined} defaultValue={filters.to}/></label><label>Empresa<select name="company" defaultValue={filters.company}><option value="">Todas</option><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option><option value="pendiente">Por clasificar</option></select></label><label>Estado<select name="status" defaultValue={filters.status}><option value="">Todos</option>{Object.entries(statusName).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></label>{canManage(actor) && <label>Cliente<select name="client_id" defaultValue={filters.client_id}><option value="">Todos</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label>}<button type="submit" className="button button-outline">Aplicar filtros</button></form>
      <p id="report-filter-help" className="helper-text">Fecha de creación del servicio, en hora de Chile. El período incluye ambos días.{canReset&&<> <Link className="text-link" href={"/reportes?"+new URLSearchParams({company:filters.company})}>Restablecer filtros</Link></>}</p>
      {issue?<div className="notice notice-error" role="alert"><strong>Revise los filtros del reporte.</strong>{" "}<span>{issue}</span></div>:<>
      <div className="report-summary"><div><strong>{number(overview.total)}</strong><span>Servicios</span></div><div><strong>{number(overview.completed)}</strong><span>Completados</span></div><div><strong>{overview.netKg.toLocaleString("es-CL",{maximumFractionDigits:2})} kg</strong><span>Peso neto registrado</span></div><Link className="button button-primary" href={`/api/reportes/servicios?${params}`}><Download size={16}/> Exportar CSV</Link></div>
      <p className="helper-text">Indicadores de todos los servicios del filtro. Neto de {number(overview.weighed)} {overview.weighed===1?"servicio completado":"servicios completados"} con bruto y tara registrados. El CSV incluye todo el filtro.</p>
      <div id="resultados-reporte" className="finance-section">{rows.length>0&&<p className="helper-text">Mostrando {number((page-1)*100+1)}–{number((page-1)*100+rows.length)} de {number(overview.total)} {overview.total===1?"servicio":"servicios"}.</p>}
      {rows.length?<div className="table-wrap" role="region" aria-label="Servicios del reporte" tabIndex={0}><table className="data-table report-table"><colgroup><col style={{width:"11%"}}/><col style={{width:"20%"}}/><col style={{width:"15%"}}/><col style={{width:"13%"}}/><col style={{width:"10%"}}/><col style={{width:"23%"}}/><col style={{width:"8%"}}/></colgroup><thead><tr><th>Folio / empresa</th><th>Cliente / faena</th><th>Material</th><th>Creación</th><th>Estado</th><th>Camión / conductor</th><th>Peso neto</th></tr></thead><tbody>{rows.map((s) => <tr key={s.id}><td><Link href={`/solicitudes/${s.id}`} className="table-main">{serviceFolio(s)}</Link><small className="table-sub" title={companyName(s.operating_company)}>{s.operating_company?companies[s.operating_company].short:"Por clasificar"}</small></td><td><strong>{s.client_name}</strong><small className="table-sub">{s.site_name}</small></td><td>{s.waste_type}<small className="table-sub capitalize">{s.service_type}</small></td><td>{chileDate(s.created_at)}</td><td><Badge status={s.status}/></td><td><span className="report-asset-label" title={s.asset_label??undefined}>{s.asset_label ?? "—"}</span><small className="table-sub">{s.driver_name ?? "—"}</small></td><td className="report-net">{s.gross_kg !== null && s.tare_kg !== null ? `${(Number(s.gross_kg)-Number(s.tare_kg)).toLocaleString("es-CL")} kg` : "—"}</td></tr>)}</tbody></table></div>:<Empty title="Sin servicios para estos filtros" detail="Cambie el período, el estado o el cliente para consultar otros resultados."/>}
      {pages>1&&<nav className="records-pagination" aria-label="Páginas del reporte de servicios"><span>{page>1&&<Link className="button button-outline" href={pageHref(page-1)}>Anterior</Link>}</span><span>Página {page} de {pages}</span><span>{page<pages&&<Link className="button button-outline" href={pageHref(page+1)}>Siguiente</Link>}</span></nav>}</div></>}
    </section>
  </>;
}
