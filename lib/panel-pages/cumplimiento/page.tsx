import Link from "next/link";
import {redirect} from "next/navigation";
import {FileCheck2,Download} from "lucide-react";
import {canManage,requireActor} from "@/lib/auth";
import {wasteRecordPage} from "@/lib/compliance";
import {db} from "@/lib/db";
import {chileDate} from "@/components/UI";
import ComplianceForm from "@/components/ComplianceForm";
import {complianceContext,complianceHref,complianceId,wasteStatusNames,type ComplianceContext} from "@/lib/compliance-state";
import {companyName,serviceFolio,type Company} from "@/lib/companies";
import {recordPage,recordsPerPage} from "@/lib/record-pagination";
type Query=ComplianceContext&{service_id?:string;formulario?:string;ok?:string};
export default async function Compliance({searchParams}:{searchParams:Promise<Query>}){
  const actor=await requireActor();if(!canManage(actor))redirect("/");
  const query=await searchParams,context=complianceContext(query),clientId=context.client_id??"",company=context.empresa??"";
  const[board,clients,services]=await Promise.all([
    wasteRecordPage(actor,clientId,company,context.pagina),db.query<{id:string;name:string}>("SELECT id,name FROM clients WHERE deleted_at IS NULL ORDER BY name,id"),
    db.query<{id:string;folio:string;operating_company:Company|null;client_name:string;site_name:string;waste_type:string}>(`SELECT s.id,s.folio,s.operating_company,c.name AS client_name,cs.name AS site_name,s.waste_type FROM service_requests s
      JOIN clients c ON c.id=s.client_id JOIN client_sites cs ON cs.id=s.site_id LEFT JOIN waste_records w ON w.service_id=s.id
      WHERE s.status='completada' AND s.deleted_at IS NULL AND w.id IS NULL
        AND ($1::text='' OR s.client_id=NULLIF($1,'')::uuid) AND ($2::text='' OR ($2='pendiente' AND s.operating_company IS NULL) OR s.operating_company=$2)
      ORDER BY s.closed_at DESC NULLS LAST,s.id DESC`,[clientId,company]),
  ]);
  if(recordPage(context.pagina)!==board.page&&!query.formulario)redirect(complianceHref({...context,pagina:String(board.page)}));
  const current={...context,...(board.page>1?{pagina:String(board.page)}:{})};
  const selected=complianceId(query.service_id),exportQuery=new URLSearchParams({client_id:clientId,empresa:company});
  const pages=()=>board.pages>1?<nav className="records-pagination" aria-label="Páginas del registro ambiental"><span>{board.page>1&&<Link className="button button-outline" href={complianceHref({...current,pagina:String(board.page-1)})}>Anterior</Link>}</span><span>Página {board.page} de {board.pages}</span><span>{board.page<board.pages&&<Link className="button button-outline" href={complianceHref({...current,pagina:String(board.page+1)})}>Siguiente</Link>}</span></nav>:null;
  return <>
    <div className="page-title-row"><div><div className="eyebrow">TRAZABILIDAD AMBIENTAL INTERNA</div><h1>Registros ambientales</h1><p className="page-intro">Prepare y revise información del residuo asociada al servicio. Registre la constancia de declaración después de efectuarla en el portal correspondiente.</p></div><span className="title-icon"><FileCheck2 size={23}/></span></div>
    <section className="section-card"><details className="compliance-create" open={query.formulario==="save"||!!selected}><summary>Preparar ficha ambiental</summary><p className="helper-text">El servicio debe estar cerrado y tener bruto y tara registrados. Adjunte evidencia antes de marcar la ficha como revisada.</p><ComplianceForm kind="save" context={current} defaults={{service_id:selected,category:"no_peligroso"}} services={services.map(service=>({id:service.id,label:`${serviceFolio(service)} · ${companyName(service.operating_company)} · ${service.client_name} · ${service.site_name} · ${service.waste_type}`}))}/>{!services.length&&<p className="helper-text">No hay servicios cerrados pendientes de ficha con estos filtros.</p>}</details></section>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">REVISIÓN Y SEGUIMIENTO</div><h2>Registros vinculados</h2></div><Link className="button button-outline" href={`/api/reportes/ambiental?${exportQuery}`}><Download size={16}/> CSV interno</Link></div>
      <form key={`${company}:${clientId}`} method="get" action="/cumplimiento" className="filters"><label>Empresa<select name="empresa" defaultValue={company}><option value="">Ambas empresas y registros por clasificar</option><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option><option value="pendiente">Por clasificar</option></select></label><label>Cliente<select name="client_id" defaultValue={clientId}><option value="">Todos</option>{clients.map(client=><option value={client.id} key={client.id}>{client.name}</option>)}</select></label><button type="submit" className="button button-outline">Aplicar</button>{(company||clientId)&&<Link className="text-link" href="/cumplimiento">Ver todos</Link>}</form>
      <p className="helper-text" data-waste-count>{board.total?`Mostrando ${(board.page-1)*recordsPerPage+1}–${Math.min(board.page*recordsPerPage,board.total)} de ${board.total} fichas.`:"Sin registros con estos filtros."} El CSV incluye todos los registros del filtro.</p>{pages()}
      <div className="table-wrap" role="region" aria-label="Fichas ambientales" tabIndex={0}><table className="data-table"><thead><tr><th>Folio / empresa</th><th>Cliente / faena</th><th>Residuo</th><th>Categoría</th><th>Peso neto</th><th>Estado</th><th>Actualizado</th></tr></thead><tbody>{board.rows.map(record=><tr key={record.id} data-waste-row={record.id}><td><Link className="table-main" href={complianceHref(current,record.id)}>{serviceFolio(record)}</Link><small className="table-sub">{companyName(record.operating_company)}</small></td><td>{record.client_name}<small className="table-sub">{record.site_name}</small></td><td>{record.waste_type}</td><td>{record.category==="peligroso"?"Peligroso":"No peligroso"}</td><td>{Number(record.quantity_kg).toLocaleString("es-CL")} kg</td><td>{wasteStatusNames[record.status]??record.status}</td><td>{chileDate(record.updated_at)}</td></tr>)}</tbody></table></div>{pages()}
    </section>
  </>;
}
