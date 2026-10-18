import {getActor} from "@/lib/auth";
import {getQuoteDocument} from "@/lib/quote-followup";

export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const actor=await getActor();if(!actor)return new Response("Acceso no autorizado",{status:401});
  const {id}=await params,doc=await getQuoteDocument(actor,id);
  if(!doc)return new Response("No encontrado",{status:404});
  return new Response(new Uint8Array(doc.content),{headers:{"Content-Type":doc.mime,
    "Content-Disposition":`attachment; filename="archivo"; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
