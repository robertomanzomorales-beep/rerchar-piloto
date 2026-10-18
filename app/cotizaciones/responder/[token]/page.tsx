import {notFound} from "next/navigation";
import {getEmailQuoteResponse,issuers,quoteFolio} from "@/lib/quotes";
import {respondToQuoteEmailAction} from "@/app/quote-response-actions";
import {SubmitButton} from "@/components/Transition";

export const dynamic="force-dynamic";
export default async function EmailQuoteResponse({params,searchParams}:{params:Promise<{token:string}>;
  searchParams:Promise<{error?:string;confirmada?:string;acuse?:string}>}){
  const {token}=await params;
  const [quote,query]=await Promise.all([getEmailQuoteResponse(token),searchParams]);
  if(!quote)notFound();
  const expires=new Date(quote.expires_at).getTime()<=Date.now();
  const pending=quote.status==="enviada"&&!quote.used_at&&!expires;
  return <main className="auth-page"><meta name="referrer" content="no-referrer"/><section className="section-card auth-card">
    <div className="eyebrow">{issuers[quote.issuer].name}</div><h1>Responder cotización {quoteFolio(quote)}</h1>
    <p className="page-intro">{quote.title} · {quote.client_name}</p>
    {query.error&&<p className="notice notice-error" role="alert">{query.error}</p>}
    {query.confirmada&&<p className="notice" role="status">Su respuesta quedó registrada.{query.acuse?" El acuse por correo está pendiente; conserve esta confirmación.":" Enviamos un acuse al correo destinatario."}</p>}
    {pending?<><p>Seleccione una opción. Este enlace registra una sola respuesta y queda asociado al correo al que se envió la cotización.</p>
      <div className="order-actions">{(["aceptada","rechazada"] as const).map(decision=><form key={decision} action={respondToQuoteEmailAction}><input type="hidden" name="token" value={token}/><input type="hidden" name="decision" value={decision}/><SubmitButton className={decision==="aceptada"?"button button-primary":"button button-outline"}>{decision==="aceptada"?"Aceptar cotización":"Rechazar cotización"}</SubmitButton></form>)}</div></>:
      <p className="helper-text">{quote.used_at?`Esta cotización ya recibió una respuesta: ${quote.status}.`:expires?"Este enlace venció. Solicite uno nuevo a la empresa emisora.":"La cotización ya no está disponible para responder desde este enlace."}</p>}
  </section></main>;
}
