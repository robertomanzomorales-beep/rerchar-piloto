import {getActor} from "@/lib/auth";
import {listWasteRecords} from "@/lib/compliance";

const cell=(value:string|number|null|undefined)=>{
  const raw=String(value??"");
  const safe=/^[=+\-@\t\r]/.test(raw)?`'${raw}`:raw;
  return `"${safe.replaceAll('"','""')}"`;
};
export async function GET(request:Request){
  const actor=await getActor();
  if(!actor)return new Response("Sesión requerida",{status:401});
  if(actor.role!=="admin"&&actor.role!=="operaciones")return new Response("Sin permiso",{status:403});
  const clientId=new URL(request.url).searchParams.get("client_id")??"";
  if(clientId&&!/^[0-9a-f-]{36}$/i.test(clientId))return new Response("Filtro inválido",{status:400});
  const rows=await listWasteRecords(actor,clientId);
  const headers=["Folio","Cliente","Faena","Residuo","Categoría","Clasificación","Cantidad kg","Generador","Transportista","Receptor","Tratamiento","Guía","Estado","Sistema externo","Referencia externa","Fecha declaración","Último cambio"];
  const lines=[headers.map(cell).join(";")];
  for(const r of rows)lines.push([`RER-${String(r.folio).padStart(5,"0")}`,r.client_name,r.site_name,r.waste_type,r.category,r.classification,r.quantity_kg,
    r.generator_name,r.transporter_name,r.receiver_name,r.treatment,r.guide_number,r.status,r.external_system,r.external_reference,
    r.reported_on?String(r.reported_on).slice(0,10):"",new Date(r.updated_at).toISOString()].map(cell).join(";"));
  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`,{headers:{
    "Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="rerchar-registros-ambientales-${new Date().toISOString().slice(0,10)}.csv"`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
  }});
}
