import {getActor} from "@/lib/auth";
import {supplierTransferProof,SupplierTransferError} from "@/lib/supplier-transfers";
import {moduleReady} from "@/lib/schema-readiness";

export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const actor=await getActor();if(!actor)return new Response("Acceso no autorizado",{status:401});
  if(actor.role!=="admin")return new Response("Sin autorización",{status:403});
  if(!await moduleReady("supplier_transfers"))return new Response("Módulo pendiente",{status:503});
  let file;
  try{file=await supplierTransferProof(actor,(await params).id);}catch(error){if(error instanceof SupplierTransferError)return new Response("No encontrado",{status:404});throw error;}
  if(!file)return new Response("No encontrado",{status:404});
  const filename=file.filename.replace(/[\r\n"\\]/g,"_");
  return new Response(new Uint8Array(file.data),{headers:{"Content-Type":file.mime,
    "Content-Disposition":`attachment; filename="comprobante"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
