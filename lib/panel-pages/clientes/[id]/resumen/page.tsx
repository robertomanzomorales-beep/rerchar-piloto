import Link from "next/link";
import {notFound} from "next/navigation";
import {requireActor} from "@/lib/auth";
import PrintButton from "@/components/PrintButton";
import DocumentBrand from "@/components/DocumentBrand";
import {chileDate} from "@/components/UI";
import {companyName,serviceFolio,type Company} from "@/lib/companies";
import {ClientRecordsError,clientContext,clientHref,listClientRetirements,retirementNet,type ClientContext} from "@/lib/client-records";

const amount=(value:number)=>value.toLocaleString("es-CL",{maximumFractionDigits:2});
export default async function Retirements({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<ClientContext>}){
  const actor=await requireActor(),{id}=await params,context=clientContext(await searchParams),company:Company=context.empresa==="e_y_j"?"e_y_j":"rerchar";
  const {client,services,total,unweighed}=await listClientRetirements(actor,id,company).catch(error=>{if(error instanceof ClientRecordsError)notFound();throw error;});
  return <><div className="order-actions print-hide"><Link href={clientHref({...context,empresa:company},id)} className="back-link">Volver a la carpeta del cliente</Link><PrintButton label="Imprimir resumen / guardar PDF"/></div>
    <article className="order-sheet client-retirements" data-company={company}><header className="order-header"><div><DocumentBrand company={company}/><div className="order-system">{companyName(company)}</div><h1>Resumen de retiros</h1><p>{client.name} · {client.tax_id||"RUT no registrado"}</p></div><div className="order-number"><small>RETIROS CERRADOS</small><h1 data-retirement-count>{services.length}</h1></div></header>
      <div className="order-section"><div className="table-wrap" role="region" aria-label="Resumen completo de retiros" tabIndex={0}><table className="data-table"><thead><tr><th>Fecha</th><th>Servicio</th><th>Faena</th><th>Material</th><th>Guía</th><th>Peso neto</th></tr></thead><tbody>{services.map(s=>{const net=retirementNet(s);return <tr key={s.id} data-client-retirement={s.id}><td>{chileDate(s.closed_at,false)}</td><td>{serviceFolio(s)}</td><td>{s.site_name}</td><td>{s.waste_type}</td><td>{s.guide_number||"Pendiente"}</td><td>{net===null?"Peso por revisar":`${amount(net)} kg`}</td></tr>;})}</tbody></table></div><p><strong>Peso neto total registrado: {amount(total)} kg</strong></p>{unweighed>0&&<p>{unweighed} {unweighed===1?"retiro requiere":"retiros requieren"} revisión de peso y no {unweighed===1?"se incluye":"se incluyen"} en el total.</p>}{!services.length&&<p>No hay retiros cerrados para esta empresa.</p>}</div>
      <footer className="order-footer">Resumen generado desde todos los retiros cerrados de {companyName(company)}. Revise las guías y respaldos asociados.</footer>
    </article></>;
}
