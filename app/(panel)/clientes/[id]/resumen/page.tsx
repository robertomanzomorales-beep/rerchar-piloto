import Link from "next/link";
import {notFound} from "next/navigation";
import {z} from "zod";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";
import PrintButton from "@/components/PrintButton";

function day(date:Date|string){return new Intl.DateTimeFormat("es-CL",{timeZone:"America/Santiago",dateStyle:"short"}).format(new Date(date));}
export default async function Retirements({params}:{params:Promise<{id:string}>}){
  const actor=await requireActor();const {id}=await params;
  if(actor.role==="conductor"||!z.uuid().safeParse(id).success||(actor.role==="cliente"&&actor.client_id!==id))notFound();
  const [client]=await db.query<{name:string;tax_id:string|null}>("SELECT name,tax_id FROM clients WHERE id=$1 AND deleted_at IS NULL",[id]);if(!client)notFound();
  const services=await db.query<{id:string;folio:string;closed_at:Date;site_name:string;waste_type:string;guide_number:string|null;gross_kg:string;tare_kg:string}>(`SELECT s.id,s.folio,s.closed_at,cs.name AS site_name,s.waste_type,s.guide_number,s.gross_kg,s.tare_kg FROM service_requests s
    JOIN client_sites cs ON cs.id=s.site_id WHERE s.client_id=$1 AND s.service_type='retiro' AND s.status='completada'
    AND s.deleted_at IS NULL ORDER BY s.closed_at DESC LIMIT 500`,[id]);
  const total=services.reduce((sum,s)=>sum+Number(s.gross_kg)-Number(s.tare_kg),0);
  return <><div className="order-actions print-hide"><Link href={`/clientes/${id}`} className="back-link">← Carpeta del cliente</Link><PrintButton label="Imprimir resumen / guardar PDF"/></div><article className="order-sheet"><header className="order-header"><div><div className="order-system">RERCHAR CHILE SPA</div><h1>Resumen de retiros</h1><p>{client.name} · {client.tax_id||"RUT no registrado"}</p></div><div className="order-number"><small>RETIROS CERRADOS</small><h1>{services.length}</h1></div></header><div className="order-section"><table className="data-table"><thead><tr><th>Fecha</th><th>Servicio</th><th>Faena</th><th>Material</th><th>Guía</th><th>Peso neto</th></tr></thead><tbody>{services.map(s=><tr key={s.id}><td>{day(s.closed_at)}</td><td>RER-{String(s.folio).padStart(5,"0")}</td><td>{s.site_name}</td><td>{s.waste_type}</td><td>{s.guide_number||"Pendiente"}</td><td>{(Number(s.gross_kg)-Number(s.tare_kg)).toLocaleString("es-CL")} kg</td></tr>)}</tbody></table><p><strong>Total registrado: {total.toLocaleString("es-CL")} kg</strong></p>{!services.length&&<p>No hay retiros cerrados para esta empresa.</p>}</div><footer className="order-footer">Resumen generado desde los servicios cerrados de RERCHAR. Revise sus guías y respaldos asociados.</footer></article></>;
}
