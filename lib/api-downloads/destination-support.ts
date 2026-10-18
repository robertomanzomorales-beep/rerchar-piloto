import {getActor} from "@/lib/auth";
import {getQuoteDestinationSupport} from "@/lib/destinations";

export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const actor=await getActor();if(!actor)return new Response("Sesión requerida",{status:401});
  const file=await getQuoteDestinationSupport(actor,(await params).id);
  if(!file)return new Response("No encontrado",{status:404});
  const name=file.name.replace(/[\r\n"\\]/g,"_");
  return new Response(new Uint8Array(file.bytes),{headers:{"Content-Type":file.mime,
    "Content-Disposition":`attachment; filename="respaldo"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
