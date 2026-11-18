"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {importSiiXml,saveSiiCompanyTaxId,reviewSiiDocument,SiiDocumentError} from "@/lib/sii-documents";
const value=(form:FormData,key:string)=>String(form.get(key)??"");
function returnPath(form:FormData){
  const params=new URLSearchParams();
  const company=value(form,"company_view"),direction=value(form,"direction_view"),review=value(form,"review_view"),page=value(form,"page");
  if(company==="rerchar"||company==="e_y_j")params.set("empresa",company);
  if(direction==="emitido"||direction==="recibido")params.set("sentido",direction);
  if(review==="pendiente"||review==="revisado")params.set("revision",review);
  if(/^[1-9]\d{0,4}$/.test(page))params.set("pagina",page);
  return "/documentos-sii?"+params.toString();
}
function message(error:unknown){
  if(error instanceof SiiDocumentError)return error.message;
  if(error instanceof ZodError)return "Revise la empresa, el RUT y los campos obligatorios.";
  if(typeof error==="object"&&error&&"code" in error&&error.code==="23505")return "El registro ya existe. Actualice la página antes de volver a intentar.";
  console.error("Documentos SII",error instanceof Error?error.name:"error");return "No fue posible guardar el documento. Revise los datos.";
}
async function run(form:FormData,work:()=>Promise<unknown>):Promise<never>{
  const path=returnPath(form);
  try{await work();}catch(error){redirect(path+"&error="+encodeURIComponent(message(error)));}
  revalidatePath("/documentos-sii");redirect(path+"&ok=1");
}
export async function configureSiiCompanyAction(form:FormData){
  const actor=await requireActor();
  return run(form,()=>saveSiiCompanyTaxId(actor,value(form,"company"),value(form,"tax_id")));
}
export async function importSiiXmlAction(form:FormData){
  const actor=await requireActor();
  return run(form,async()=>{
    if(actor.role!=="admin")throw new SiiDocumentError("Acceso exclusivo de administración.");
    const file=form.get("xml");
    if(!(file instanceof File)||!file.size||file.size>3*1024*1024)throw new SiiDocumentError("Seleccione un XML de hasta 3 MB.");
    return importSiiXml(actor,value(form,"company"),new Uint8Array(await file.arrayBuffer()),file.name);
  });
}
export async function reviewSiiDocumentAction(form:FormData){
  const actor=await requireActor();
  return run(form,()=>reviewSiiDocument(actor,value(form,"id"),{status:value(form,"status"),note:value(form,"note")}));
}
