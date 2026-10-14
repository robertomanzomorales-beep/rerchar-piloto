import Link from "next/link";
import {redirect} from "next/navigation";
import {FileText,Download} from "lucide-react";
import {requireActor} from "@/lib/auth";
import {listQuotes,quoteFolio} from "@/lib/quotes";
import {chileDate} from "@/components/UI";
import {QuoteClassification} from "@/components/QuoteClassification";
import {quoteSegmentLabel,validQuoteSegment,quotePrincipals} from "@/lib/quote-catalog";

export default async function Quotes({searchParams}:{searchParams:Promise<{empresa?:string;principal?:string;segment?:string}>}){
  const actor=await requireActor();if(actor.role==="conductor")redirect("/");
  const query=await searchParams;
  const company=["rerchar","e_y_j"].includes(query.empresa??"")?query.empresa??"":"";
  const principal=quotePrincipals.some(item=>item.value===query.principal)?query.principal??"":"";
  const segment=validQuoteSegment(principal,query.segment??"")?query.segment??"":"";
  const quotes=await listQuotes(actor,"",company,principal,segment);
  const exportParams=new URLSearchParams({empresa:company,principal,segment});
  return <><div className="page-title-row"><div><div className="eyebrow">COMERCIAL</div><h1>Cotizaciones</h1><p className="page-intro">Propuestas vinculadas a clientes registrados, con importes calculados y PDF para enviar.</p></div><span className="title-icon"><FileText size={23}/></span></div>
    {actor.role!=="cliente"&&<div className="order-actions"><Link href="/cotizaciones/nueva" className="button button-primary">Nueva cotización</Link></div>}
    <section className="section-card"><form method="GET" action="/cotizaciones" className="filters"><label>Empresa<select name="empresa" defaultValue={company}><option value="">Ambas empresas</option><option value="rerchar">RERCHAR</option><option value="e_y_j">E y J</option></select></label><QuoteClassification principal={principal} segment={segment} required={false} withUnit={false} filter/><button className="button button-outline" type="submit">Filtrar</button></form><div className="order-actions"><Link className="button button-outline" href={`/api/cotizaciones/exportar?${exportParams}`}><Download size={15}/> Exportar reporte CSV</Link></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Folio / empresa</th><th>Cliente</th><th>Asunto / segmentación</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>{quotes.map(q=><tr key={q.id}><td><Link href={`/cotizaciones/${q.id}`}><strong>{quoteFolio(q)}</strong></Link><small className="table-sub">{q.issuer==="rerchar"?"RERCHAR":"E y J"}</small></td><td>{q.client_name}</td><td>{q.title}<small className="table-sub">{q.segments?.length?q.segments.map(quoteSegmentLabel).join(" · "):"Sin clasificar (anterior)"}</small></td><td>{q.status}</td><td>{chileDate(q.created_at)}</td></tr>)}</tbody></table>{!quotes.length&&<p className="muted">No hay cotizaciones disponibles.</p>}</div></section></>;
}
