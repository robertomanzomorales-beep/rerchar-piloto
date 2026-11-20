"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {ZodError} from "zod";
import {requireActor} from "@/lib/auth";
import {GuideError,saveGuideControl} from "@/lib/guides";
import {guideControlDraft,guideControlFieldLimits,type GuideControlState} from "@/lib/service-guide-state";

const value=(form:FormData,key:string)=>String(form.get(key)??"");
export async function saveGuideControlAction(_previous:GuideControlState,form:FormData):Promise<GuideControlState>{
  const actor=await requireActor(),id=value(form,"service_id");
  const path="/solicitudes/"+encodeURIComponent(id)+"/guias";
  const data=Object.fromEntries(Object.keys(guideControlFieldLimits).map(key=>[key,value(form,key)]));
  let saved:string;
  try{saved=await saveGuideControl(actor,id,data);}
  catch(error){
    const message=error instanceof GuideError?error.message:error instanceof ZodError?"Revise fechas, identificadores y pesos en kg.":"No fue posible guardar este control de guía.";
    if(!(error instanceof GuideError||error instanceof ZodError))console.error("Error al guardar guía",error);
    return {error:message,values:guideControlDraft(form)};
  }
  revalidatePath("/","layout");
  redirect(path+"?ok=1#control-guia-"+encodeURIComponent(saved));
}
