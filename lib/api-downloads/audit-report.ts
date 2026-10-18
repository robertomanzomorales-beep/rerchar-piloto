import {getActor} from "@/lib/auth";
import {auditFilter,auditReport} from "@/lib/audit-report";
import {chileCsvDateTime,chileCsvDay} from "@/lib/chile-csv";

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
  const lines=[["Fecha y hora (Chile)","Persona","Acción","Entidad","ID del registro"].map(cell).join(";")];
  for(const row of rows)lines.push([chileCsvDateTime(row.created_at),row.actor_name,row.action,row.entity_type,row.entity_id].map(cell).join(";"));
  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`,{headers:{
    "Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="rerchar-auditoria-${chileCsvDay()}.csv"`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
  }});
}
