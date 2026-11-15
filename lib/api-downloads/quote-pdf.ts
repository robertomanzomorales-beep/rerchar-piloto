import {getActor} from "@/lib/auth";
import {getQuote,QuoteError,quoteFolio,quoteDeliveryIssues} from "@/lib/quotes";
import {renderQuotePdf} from "@/lib/quote-pdf";
import {db} from "@/lib/db";

export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const actor=await getActor();if(!actor)return new Response("Sesión requerida",{status:401});
  const {id}=await params;let detail;
  try{detail=await getQuote(actor,id);}catch(error){if(error instanceof QuoteError)return new Response("No encontrado",{status:404});throw error;}
  const requested=new URL(request.url).searchParams.get("version");
  if(requested!==null&&!/^[1-9]\d{0,5}$/.test(requested))return new Response("Versión inválida",{status:400});
  const version=requested===null?null:Number(requested);
  if(version!==null){
    const [historical]=await db.query<{pdf:Buffer}>(
      "SELECT pdf FROM client_quote_issued_versions WHERE quote_id=$1 AND version=$2",[id,version]);
    if(historical)return new Response(new Uint8Array(historical.pdf),{headers:{"Content-Type":"application/pdf",
      "Content-Disposition":`attachment; filename="cotizacion-${quoteFolio(detail.quote).toLowerCase()}-v${version}.pdf"`,
      "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
    if(version!==detail.quote.issued_version||detail.quote.status==="borrador")
      return new Response("Versión no encontrada",{status:404});
  }
  const [issued]=detail.quote.status==="borrador"?[]:await db.query<{pdf:Buffer}>(
    "SELECT pdf FROM client_quote_pdf_snapshots WHERE quote_id=$1",[id]);
  if(version!==null&&!issued)return new Response("Versión no encontrada",{status:404});
  const issues=!issued&&detail.quote.status==="borrador"?await quoteDeliveryIssues(detail.quote,detail.lines):[];
  const pdf=issued?.pdf??await renderQuotePdf(detail.quote,detail.lines,
    issues.length?"BORRADOR · DATOS PENDIENTES DE VALIDACIÓN · NO ENVIAR":"",detail.route);
  return new Response(new Uint8Array(pdf),{headers:{"Content-Type":"application/pdf",
    "Content-Disposition":`attachment; filename="cotizacion-${quoteFolio(detail.quote).toLowerCase()}${version===null?"":`-v${version}`}.pdf"`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
