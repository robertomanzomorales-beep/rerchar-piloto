import {getActor} from "@/lib/auth";
import {auditFilter,auditReport} from "@/lib/audit-report";

const cell=(value:string)=>{
  const safe=/^[=+\-@\t\r]/.test(value)?`'${value}`:value;
  return `"${safe.replaceAll('"','""')}"`;
};
export async function GET(request:Request){
  const actor=await getActor();
  if(!actor)return new Response("Sesión requerida",{status:401});
  if(actor.role!=="admin")return new Response("Sin permiso",{status:403});
  const search=new URL(request.url).searchParams;
  const rows=await auditReport(actor,auditFilter({from:search.get("from")??"",to:search.get("to")??"",kind:search.get("kind")??""}),1000);
  const lines=[["Fecha UTC","Persona","Acción","Entidad","ID del registro"].map(cell).join(";")];
  for(const row of rows)lines.push([new Date(row.created_at).toISOString(),row.actor_name,row.action,row.entity_type,row.entity_id].map(cell).join(";"));
  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`,{headers:{
    "Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="rerchar-auditoria-${new Date().toISOString().slice(0,10)}.csv"`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
  }});
}
