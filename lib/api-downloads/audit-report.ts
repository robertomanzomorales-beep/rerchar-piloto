import {getActor} from "@/lib/auth";
import {AuditAccessError,auditFilter,auditFilterIssue,iterateAuditReport} from "@/lib/audit-report";
import {auditCsvHeader,auditCsvRows} from "@/lib/audit-csv";
import {chileCsvDay} from "@/lib/chile-csv";
export async function GET(request:Request){
  const actor=await getActor();if(!actor)return new Response("Sesión requerida",{status:401});if(actor.role!=="admin")return new Response("Sin permiso",{status:403});
  const search=new URL(request.url).searchParams,input={from:search.get("from")??"",to:search.get("to")??"",kind:search.get("kind")??""},issue=auditFilterIssue(input);if(issue)return new Response(issue,{status:400,headers:{"Cache-Control":"private, no-store"}});
  const batches=iterateAuditReport(actor,auditFilter(input));let first:Awaited<ReturnType<typeof batches.next>>;
  try{first=await batches.next();}catch(error){if(error instanceof AuditAccessError)return new Response(error.message,{status:403});throw error;}
  const encoder=new TextEncoder();let canceled=false;
  const stream=new ReadableStream<Uint8Array>({
    start(controller){controller.enqueue(encoder.encode(auditCsvHeader+(first.done?"":auditCsvRows(first.value))));if(first.done)controller.close();},
    async pull(controller){try{const next=await batches.next();if(canceled)return;if(next.done)controller.close();else controller.enqueue(encoder.encode(auditCsvRows(next.value)));}catch(error){if(!canceled)controller.error(error);}},
    async cancel(){canceled=true;await batches.return(undefined);},
  });
  return new Response(stream,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="rerchar-auditoria-${chileCsvDay()}.csv"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
