import { getActor } from "@/lib/auth";
import { chileCsvDateTime, chileCsvDay } from "@/lib/chile-csv";
import { normalizeReportFilters, reportFilterIssue, iterateReportServices, type ReportService } from "@/lib/pilot";
import {companyName,serviceFolio} from "@/lib/companies";

function csvCell(value: string | number | null | undefined) {
  const raw = String(value ?? "");
  const safe = /^\s*[=+\-@]/u.test(raw) || /^[\t\r\n]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"','""')}"`;
}

function csvRows(rows:ReportService[]){
  const lines:string[]=[];
  for (const s of rows) {
    const record = [
      serviceFolio(s),companyName(s.operating_company),s.client_name,s.site_name,s.service_type,s.waste_type,s.origin,s.destination,s.status,
      chileCsvDateTime(s.created_at),chileCsvDateTime(s.scheduled_for),
      s.asset_label,s.driver_name,s.estimated_kg,s.gross_kg,s.tare_kg,
      s.gross_kg !== null && s.tare_kg !== null ? (Number(s.gross_kg)-Number(s.tare_kg)).toFixed(2) : "",
    ];
    lines.push(record.map(csvCell).join(";"));
  }
  return lines.length?lines.join("\r\n")+"\r\n":"";
}

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return new Response("Sesión requerida", { status: 401 });
  const params = new URL(request.url).searchParams;
  const input=Object.fromEntries(["from","to","status","client_id","company"].map(key=>{
    const values=params.getAll(key);return [key,values.length>1?values:values[0]??""];
  }));
  const issue=reportFilterIssue(input);
  if(issue)return new Response(issue,{status:400,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  const filters = normalizeReportFilters(input);
  const batches=iterateReportServices(actor,filters),first=await batches.next();
  const header = ["Folio","Empresa operadora","Cliente","Centro","Tipo","Residuo","Origen","Destino","Estado","Creado (Chile)","Programado (Chile)","Camión","Conductor","Estimado kg","Bruto kg","Tara kg","Neto kg"];
  const encoder=new TextEncoder();let canceled=false;
  const stream=new ReadableStream<Uint8Array>({
    start(controller){
      controller.enqueue(encoder.encode("\uFEFF"+header.map(csvCell).join(";")+"\r\n"+(first.done?"":csvRows(first.value))));
      if(first.done)controller.close();
    },
    async pull(controller){
      try{
        const next=await batches.next();if(canceled)return;
        if(next.done)controller.close();else controller.enqueue(encoder.encode(csvRows(next.value)));
      }catch(error){if(!canceled)controller.error(error);}
    },
    async cancel(){canceled=true;await batches.return(undefined);},
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rerchar-servicios-${chileCsvDay()}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
