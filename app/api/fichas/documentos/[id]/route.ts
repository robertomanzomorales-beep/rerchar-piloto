import {getActor} from "@/lib/auth";
import {getCounterpartyDocument} from "@/lib/counterparties";

export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const actor=await getActor();if(!actor)return new Response("Acceso no autorizado",{status:401});
  if(actor.role!=="admin")return new Response("Acceso denegado",{status:403});
  const {id}=await params;
  try{const file=await getCounterpartyDocument(actor,id);
    if(!file)return new Response("No encontrado",{status:404});
    const filename=file.filename.replace(/[\r\n"\\]/g,"_");
    return new Response(new Uint8Array(file.content),{headers:{"Content-Type":file.mime,
      "Content-Disposition":`attachment; filename="documento"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }catch{return new Response("No encontrado",{status:404});}
}
