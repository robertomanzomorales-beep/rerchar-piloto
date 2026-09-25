import Link from "next/link";
import {Download,ScrollText} from "lucide-react";
import {requireActor} from "@/lib/auth";
import {auditFilter,auditKinds,auditReport} from "@/lib/audit-report";
import {chileDate} from "@/components/UI";

export default async function AuditPage({searchParams}:{searchParams:Promise<{from?:string;to?:string;kind?:string}>}){
  const actor=await requireActor();
  if(actor.role!=="admin")return <p>La auditoría está reservada a administración.</p>;
  const filters=auditFilter(await searchParams);
  const [rows,kinds]=await Promise.all([auditReport(actor,filters),auditKinds(actor)]);
  const query=new URLSearchParams(filters);
  return <>
    <div className="page-title-row"><div><div className="eyebrow">CONTROL TRANSVERSAL</div><h1>Auditoría</h1><p className="page-intro">Cambios registrados por persona, módulo y fecha. Consulte el detalle de cada registro en su módulo.</p></div><span className="title-icon"><ScrollText size={23}/></span></div>
    <section className="section-card"><form method="GET" action="/auditoria" className="report-filters"><label>Desde<input name="from" type="date" defaultValue={filters.from}/></label><label>Hasta<input name="to" type="date" defaultValue={filters.to}/></label><label>Entidad<select name="kind" defaultValue={filters.kind}><option value="">Todas</option>{kinds.map(kind=><option value={kind.entity_type} key={kind.entity_type}>{kind.entity_type.replaceAll("_"," ")}</option>)}</select></label><button className="button button-outline" type="submit">Filtrar</button><Link href={`/api/reportes/auditoria?${query}`} className="button button-primary"><Download size={16}/> Exportar CSV</Link></form>
      <p className="helper-text">Se muestran los últimos {rows.length} eventos con estos filtros, hasta un máximo de 300 en pantalla.</p>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha y hora</th><th>Persona</th><th>Acción</th><th>Entidad</th><th>ID de registro</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{chileDate(row.created_at)}</td><td>{row.actor_name}</td><td>{row.action}</td><td>{row.entity_type.replaceAll("_"," ")}</td><td><code>{row.entity_id.slice(0,8)}</code></td></tr>)}</tbody></table>{!rows.length&&<p className="report-empty">No hay eventos con esos filtros.</p>}</div>
    </section>
  </>;
}
