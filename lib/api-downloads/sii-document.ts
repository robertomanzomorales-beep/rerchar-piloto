import {getActor} from "@/lib/auth";
import {getSiiOriginalXml,SiiDocumentError} from "@/lib/sii-documents";
import {ZodError} from "zod";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const actor=await getActor();if(!actor)return new Response("Sesión requerida",{status:401});
  if(actor.role!=="admin")return new Response("Acceso denegado",{status:403});
  const {id}=await params;
  try{
    const file=await getSiiOriginalXml(actor,id);
    return new Response(new Uint8Array(file.original_xml),{headers:{"Content-Type":"application/xml",
      "Content-Disposition":`attachment; filename="documento-sii.xml"; filename*=UTF-8''${encodeURIComponent(file.original_filename)}`,
      "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }catch(error){if(error instanceof SiiDocumentError||error instanceof ZodError)return new Response("No encontrado",{status:404});throw error;}
}
