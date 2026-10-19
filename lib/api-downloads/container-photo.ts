import {getActor} from "@/lib/auth";
import {ContainerError,getContainerMovementPhoto} from "@/lib/containers";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const actor=await getActor();
  if(!actor)return new Response("Sesión requerida",{status:401});
  let photo;
  try{photo=await getContainerMovementPhoto(actor,(await params).id);}
  catch(error){if(error instanceof ContainerError)return new Response("Sin acceso",{status:403});throw error;}
  if(!photo)return new Response("Foto no encontrada",{status:404});
  const filename=photo.filename.replace(/[\r\n"\\]/g,"_");
  return new Response(new Uint8Array(photo.content),{headers:{
    "Content-Type":photo.mime,
    "Content-Disposition":`attachment; filename="foto-instalacion"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control":"private, no-store",
    "X-Content-Type-Options":"nosniff",
  }});
}
