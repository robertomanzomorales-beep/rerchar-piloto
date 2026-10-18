import {getActor,canManage} from "@/lib/auth";
import {getPaymentStatement,PaymentStatementError} from "@/lib/payment-statements";
import {renderPaymentStatementPdf} from "@/lib/payment-statement-pdf";
import {moduleReady} from "@/lib/schema-readiness";

export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const actor=await getActor();
  if(!actor)return new Response("Sesión requerida",{status:401});
  if(!canManage(actor))return new Response("Sin acceso a estados de pago",{status:403});
  if(!await moduleReady("edp"))return new Response("Estados de pago aún no disponibles",{status:503});
  const {id}=await params;let detail;
  try{detail=await getPaymentStatement(actor,id);}
  catch(error){if(error instanceof PaymentStatementError)return new Response("No encontrado",{status:404});throw error;}
  const pdf=await renderPaymentStatementPdf(detail.statement,detail.operations,detail.totals);
  const number=detail.statement.number.toLowerCase().replace(/[^a-z0-9-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40)||"sin-numero";
  return new Response(new Uint8Array(pdf),{headers:{"Content-Type":"application/pdf",
    "Content-Disposition":`attachment; filename="edp-eyj-${number}.pdf"`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
