import Link from "next/link";
import {redirect} from "next/navigation";
import {FileText,Download} from "lucide-react";
import {z} from "zod";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";
import {listQuotes,quoteFolio} from "@/lib/quotes";
import {chileDate} from "@/components/UI";
import {QuoteClassification} from "@/components/QuoteClassification";
import {quoteSegmentLabel,validQuoteSegment,quotePrincipals} from "@/lib/quote-catalog";
import {moduleReady} from "@/lib/schema-readiness";
import ModuleUnavailable from "@/components/ModuleUnavailable";

export default async function Quotes({searchParams}:{searchParams:Promise<{empresa?:string;principal?:string;segment?:string;cliente?:string;desde?:string;hasta?:string;persona?:string}>}){
  const actor=await requireActor();if(actor.role==="conductor")redirect("/");
  const query=await searchParams;
  if(!await moduleReady("cotizaciones"))return <ModuleUnavailable title="Cotizaciones" company={query.empresa==="e_y_j"?"e_y_j":"rerchar"}/>;
  const company=["rerchar","e_y_j"].includes(query.empresa??"")?query.empresa??"":"";
  const principal=quotePrincipals.some(item=>item.value===query.principal)?query.principal??"":"";
  const segment=validQuoteSegment(principal,query.segment??"")?query.segment??"":"";
  const [clients,creators]=await Promise.all([
    actor.role==="cliente"?Promise.resolve([]):db.query<{id:string;name:string}>("SELECT id,name FROM clients WHERE deleted_at IS NULL ORDER BY name"),
    actor.role==="cliente"?Promise.resolve([]):db.query<{id:string;name:string}>("SELECT DISTINCT u.id,u.name FROM users u JOIN client_quotes q ON q.created_by=u.id ORDER BY u.name"),
  ]);
  const clientId=clients.some(row=>row.id===query.cliente)?query.cliente??"":"";
  const creatorId=creators.some(row=>row.id===query.persona)?query.persona??"":"";
  const validDate=(value:string|undefined)=>value&&z.iso.date().safeParse(value).success?value:"";
  const from=validDate(query.desde),toCandidate=validDate(query.hasta),to=from&&toCandidate&&toCandidate<from?"":toCandidate;
  const quotes=await listQuotes(actor,clientId,company,principal,segment,{from,to,creatorId});
  const exportParams=new URLSearchParams({empresa:company,principal,segment,cliente:clientId,desde:from,hasta:to,persona:creatorId});
  return <><div className="page-title-row"><div><div className="eyebrow">COMERCIAL</div><h1>Cotizaciones</h1><p className="page-intro">Propuestas vinculadas a clientes registrados, con importes calculados y PDF para enviar.</p></div><span className="title-icon"><FileText size={23}/></span></div>
    {actor.role!=="cliente"&&<div className="order-actions"><Link href={`/cotizaciones/nueva${company?`?empresa=${company}`:""}`} className="button button-primary">Nueva cotización</Link>{company!=="e_y_j"&&<Link href="/cotizaciones/nueva?empresa=rerchar&tipo=compra" className="button button-outline">Cotizar compra de material</Link>}</div>}
    <section className="section-card"><form method="GET" action="/cotizaciones" className="filters"><label>Empresa<select name="empresa" defaultValue={company}><option value="">Ambas empresas</option><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option></select></label>{actor.role!=="cliente"&&<><label>Cliente<select name="cliente" defaultValue={clientId}><option value="">Todos los clientes</option>{clients.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Preparada por<select name="persona" defaultValue={creatorId}><option value="">Todas las personas</option>{creators.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label></>}<label>Desde<input name="desde" type="date" defaultValue={from}/></label><label>Hasta<input name="hasta" type="date" defaultValue={to}/></label><QuoteClassification principal={principal} segment={segment} company={company} required={false} withUnit={false} filter/><button className="button button-outline" type="submit">Filtrar</button></form><div className="order-actions"><Link className="button button-outline" href={`/api/cotizaciones/exportar?${exportParams}`}><Download size={15}/> Exportar reporte CSV</Link></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Folio / empresa</th><th>Cliente</th><th>Asunto / segmentación</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>{quotes.map(q=><tr key={q.id}><td><Link href={`/cotizaciones/${q.id}`}><strong>{quoteFolio(q)}</strong></Link><small className="table-sub">{q.issuer==="rerchar"?"RERCHAR":"E y J"}</small></td><td>{q.client_name}</td><td>{q.title}<small className="table-sub">{q.segments?.length?q.segments.map(quoteSegmentLabel).join(" · "):"Sin clasificar (anterior)"}</small></td><td>{q.status}</td><td>{chileDate(q.created_at)}</td></tr>)}</tbody></table>{!quotes.length&&<p className="muted">No hay cotizaciones disponibles.</p>}</div></section></>;
}
