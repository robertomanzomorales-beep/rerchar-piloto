import Link from "next/link";
import {redirect} from "next/navigation";
import {FileText,Download} from "lucide-react";
import {z} from "zod";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";
import {listQuotes,quoteFolio} from "@/lib/quotes";
import {chileCalendarDate} from "@/components/UI";
import {QuoteClassification} from "@/components/QuoteClassification";
import {quoteSegmentLabel,validQuoteSegment,quotePrincipals} from "@/lib/quote-catalog";
import {moduleReady} from "@/lib/schema-readiness";
import ModuleUnavailable from "@/components/ModuleUnavailable";

export default async function Quotes({searchParams}:{searchParams:Promise<{empresa?:string;principal?:string;segment?:string;cliente?:string;desde?:string;hasta?:string;persona?:string;pagina?:string;vista?:string}>}){
  const actor=await requireActor();if(actor.role==="conductor")redirect("/");
  const query=await searchParams;
  if(!await moduleReady("cotizaciones"))return <ModuleUnavailable title="Cotizaciones" company={query.empresa==="e_y_j"?"e_y_j":"rerchar"}/>;
  const company=["rerchar","e_y_j"].includes(query.empresa??"")?query.empresa??"":"";
  const view=["gestion","vencidas","sin_oc","sin_servicio"].includes(query.vista??"")?query.vista??"":"";
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
  const requestedPage=Number(query.pagina);
  const pageNumber=Number.isSafeInteger(requestedPage)&&requestedPage>=1&&requestedPage<=10_000?requestedPage:1;
  const pageSize=50;
  const quoteRows=await listQuotes(actor,clientId,company,principal,segment,{from,to,creatorId,view},pageSize+1,(pageNumber-1)*pageSize);
  const quotes=quoteRows.slice(0,pageSize),hasMore=quoteRows.length>pageSize;
  const exportParams=new URLSearchParams({empresa:company,principal,segment,cliente:clientId,desde:from,hasta:to,persona:creatorId,vista:view});
  const pageHref=(page:number)=>{const params=new URLSearchParams(exportParams);params.set("pagina",String(page));return `/cotizaciones?${params}`;};
  return <><div className="page-title-row"><div><div className="eyebrow">COMERCIAL</div><h1>Cotizaciones</h1><p className="page-intro">Propuestas vinculadas a clientes registrados, con importes calculados y PDF para enviar.</p></div><span className="title-icon"><FileText size={23}/></span></div>
    {actor.role!=="cliente"&&<div className="order-actions quote-actions"><Link href={`/cotizaciones/nueva${company?`?empresa=${company}`:""}`} className="button button-primary">Nueva cotización</Link>{company!=="e_y_j"&&<Link href="/cotizaciones/nueva?empresa=rerchar&tipo=compra" className="button button-outline">Cotizar compra de material</Link>}</div>}
    <section className="section-card"><form method="GET" action="/cotizaciones" className="filters quote-filters"><label>Empresa<select name="empresa" defaultValue={company}><option value="">Ambas empresas</option><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option></select></label>{actor.role!=="cliente"&&<><label>Cliente<select name="cliente" defaultValue={clientId}><option value="">Todos los clientes</option>{clients.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Preparada por<select name="persona" defaultValue={creatorId}><option value="">Todas las personas</option>{creators.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label></>}<label>Seguimiento<select name="vista" defaultValue={view}><option value="">Todas</option><option value="gestion">En gestión</option><option value="vencidas">Enviadas vencidas</option><option value="sin_oc">Servicios: OC o respaldo pendiente</option><option value="sin_servicio">Listas sin solicitud</option></select></label><label>Emisión desde<input name="desde" type="date" defaultValue={from}/></label><label>Emisión hasta<input name="hasta" type="date" defaultValue={to}/></label><QuoteClassification principal={principal} segment={segment} company={company} required={false} withUnit={false} filter/><button className="button button-outline" type="submit">Filtrar</button></form><div className="order-actions"><Link className="button button-outline" href={`/api/cotizaciones/exportar?${exportParams}`}><Download size={15}/> Exportar reporte CSV</Link></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Folio / empresa</th><th>Cliente</th><th>Asunto / segmentación</th><th>Estado</th><th>Emisión</th></tr></thead><tbody>{quotes.map(q=><tr key={q.id}><td><Link href={`/cotizaciones/${q.id}`}><strong>{quoteFolio(q)}</strong></Link><small className="table-sub">{q.issuer==="rerchar"?"RERCHAR":"E y J"}</small></td><td>{q.client_name}</td><td>{q.title}<small className="table-sub">{q.segments?.length?q.segments.map(quoteSegmentLabel).join(" · "):"Sin clasificar (anterior)"}</small></td><td>{q.status}</td><td>{chileCalendarDate(q.issued_on)}</td></tr>)}</tbody></table>{!quotes.length&&<p className="muted">No hay cotizaciones disponibles con estos filtros.</p>}</div>{(pageNumber>1||hasMore)&&<nav className="records-pagination" aria-label="Páginas de cotizaciones"><span>{pageNumber>1&&<Link className="button button-outline" href={pageHref(pageNumber-1)}>← Anterior</Link>}</span><span>Página {pageNumber} · hasta 50 cotizaciones</span><span>{hasMore&&<Link className="button button-outline" href={pageHref(pageNumber+1)}>Siguiente →</Link>}</span></nav>}</section></>;
}
