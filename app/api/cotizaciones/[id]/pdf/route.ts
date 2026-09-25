import {getActor} from "@/lib/auth";
import {getQuote,QuoteError} from "@/lib/quotes";
import {renderQuotePdf} from "@/lib/quote-pdf";

export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const actor=await getActor();if(!actor)return new Response("Sesión requerida",{status:401});
  const {id}=await params;let detail;
  try{detail=await getQuote(actor,id);}catch(error){if(error instanceof QuoteError)return new Response("No encontrado",{status:404});throw error;}
  const pdf=await renderQuotePdf(detail.quote,detail.lines);
  return new Response(new Uint8Array(pdf),{headers:{"Content-Type":"application/pdf",
    "Content-Disposition":`attachment; filename="cotizacion-rerchar-${detail.quote.folio}.pdf"`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
