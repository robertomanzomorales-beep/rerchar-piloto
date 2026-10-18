"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {respondToQuoteEmail,QuoteError} from "@/lib/quotes";

export async function respondToQuoteEmailAction(form:FormData){
  const token=String(form.get("token")??""),decision=String(form.get("decision")??"");
  const path=`/cotizaciones/responder/${encodeURIComponent(token)}`;
  let ackSent=false;
  try{
    if(decision!=="aceptada"&&decision!=="rechazada")throw new QuoteError("Seleccione una respuesta válida.");
    const result=await respondToQuoteEmail(token,decision);
    ackSent=result.ackSent;
  }catch(error){
    if(error instanceof QuoteError)redirect(`${path}?error=${encodeURIComponent(error.message)}`);
    console.error("Respuesta por correo de cotización",error);
    redirect(`${path}?error=${encodeURIComponent("No se pudo registrar la respuesta. Inténtelo nuevamente.")}`);
  }
  revalidatePath("/","layout");redirect(`${path}?confirmada=1${ackSent?"":"&acuse=pendiente"}`);
}
