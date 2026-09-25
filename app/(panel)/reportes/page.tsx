import Link from "next/link";
import { Download, FileBarChart2 } from "lucide-react";
import { canManage, requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeReportFilters, reportServices, statusName } from "@/lib/pilot";
import { Badge, chileDate } from "@/components/UI";

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; status?: string; client_id?: string }> }) {
  const actor = await requireActor();
  const filters = normalizeReportFilters(await searchParams);
  const [all, clients] = await Promise.all([
    reportServices(actor, filters),
    canManage(actor) ? db.query<{ id: string; name: string }>("SELECT id,name FROM clients WHERE deleted_at IS NULL ORDER BY name") : Promise.resolve([]),
  ]);
  const rows = all.slice(0,1000);
  const weight = rows.filter((s) => s.status === "completada").reduce((sum,s) => sum + Number(s.gross_kg ?? 0) - Number(s.tare_kg ?? 0),0);
  const params = new URLSearchParams(filters);
  return <>
    <div className="page-title-row"><div><div className="eyebrow">CONTROL DE GESTIÓN</div><h1>Reportes de servicios</h1><p className="page-intro">Filtre el historial y exporte los registros que puede consultar su perfil.</p></div><span className="title-icon"><FileBarChart2 size={24}/></span></div>
    <section className="section-card"><form method="GET" action="/reportes" className="report-filters"><label>Desde<input name="from" type="date" defaultValue={filters.from}/></label><label>Hasta<input name="to" type="date" defaultValue={filters.to}/></label><label>Estado<select name="status" defaultValue={filters.status}><option value="">Todos</option>{Object.entries(statusName).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></label>{canManage(actor) && <label>Cliente<select name="client_id" defaultValue={filters.client_id}><option value="">Todos</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></label>}<button type="submit" className="button button-outline">Aplicar filtros</button></form>
      <div className="report-summary"><div><strong>{rows.length}</strong><span>Servicios</span></div><div><strong>{rows.filter((s) => s.status === "completada").length}</strong><span>Completados</span></div><div><strong>{weight.toLocaleString("es-CL",{maximumFractionDigits:2})} kg</strong><span>Peso neto registrado</span></div><Link className="button button-primary" href={`/api/reportes/servicios?${params}`}><Download size={16}/> Exportar CSV</Link></div>
      {all.length > 1000 && <p className="helper-text">Se muestran los primeros 1.000 registros. Acote las fechas para exportar el resto.</p>}
      <div className="table-wrap"><table className="data-table report-table"><thead><tr><th>Folio</th><th>Cliente / faena</th><th>Material</th><th>Creación</th><th>Estado</th><th>Camión / conductor</th><th>Peso neto</th></tr></thead><tbody>{rows.map((s) => <tr key={s.id}><td><Link href={`/solicitudes/${s.id}`} className="table-main">RER-{String(s.folio).padStart(5,"0")}</Link></td><td><strong>{s.client_name}</strong><small className="table-sub">{s.site_name}</small></td><td>{s.waste_type}<small className="table-sub capitalize">{s.service_type}</small></td><td>{chileDate(s.created_at)}</td><td><Badge status={s.status}/></td><td>{s.asset_label ?? "—"}<small className="table-sub">{s.driver_name ?? "—"}</small></td><td>{s.gross_kg !== null && s.tare_kg !== null ? `${(Number(s.gross_kg)-Number(s.tare_kg)).toLocaleString("es-CL")} kg` : "—"}</td></tr>)}</tbody></table>{!rows.length && <p className="report-empty">No hay servicios con estos filtros.</p>}</div>
    </section>
  </>;
}
