import {getActor} from "@/lib/auth";
import {getAssetDocument,AssetLogError} from "@/lib/asset-log";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const actor=await getActor();
  if(!actor)return new Response("Sesión requerida",{status:401});
  let file;
  try{file=await getAssetDocument(actor,(await params).id);}
  catch(error){if(error instanceof AssetLogError)return new Response("Sin acceso",{status:403});throw error;}
  if(!file)return new Response("Documento no encontrado",{status:404});
  return new Response(new Uint8Array(file.bytes),{headers:{
    "Content-Type":"application/pdf",
    "Content-Disposition":`attachment; filename="documento.pdf"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    "Cache-Control":"private, no-store",
  }});
}
