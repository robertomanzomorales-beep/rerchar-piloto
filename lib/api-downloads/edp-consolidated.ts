import {getActor} from "@/lib/auth";
import {db} from "@/lib/db";
import {chileCsvDay} from "@/lib/chile-csv";
import {getBillingCycle,PaymentCalendarError} from "@/lib/payment-calendar";

const csv=(value:unknown)=>{
  const raw=String(value??"");
  const safe=/^[=+\-@\t\r]/.test(raw)?`'${raw}`:raw;
  return `"${safe.replaceAll('"','""')}"`;
};
type Consolidated={id:string;folio:string;guide_numbers:string|null;origin_tickets:string|null;destination_tickets:string|null;
  invoice_kg:string|null;truck_plate:string|null;driver_name:string|null;daily_outcome:string|null;gross_kg:string|null;
  tare_kg:string|null;scheduled_for:Date|string|null;service_sheet:string|null;eyj_guide:string|null;
  client_guide:string|null;sidrep:string|null;order_reference:string|null;quote_reference:string|null};
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const actor=await getActor();
  if(!actor)return new Response("Sesión requerida",{status:401});
  if(actor.role!=="admin"&&actor.role!=="operaciones")return new Response("Sin permiso",{status:403});
  let result;
  try{result=await getBillingCycle(actor,(await params).id);}
  catch(error){if(error instanceof PaymentCalendarError)return new Response("Período no encontrado",{status:404});throw error;}
  if(result.overflow)return new Response("El período supera 500 servicios. Acote el rango para exportar completo.",{status:409});
  const services=result.services,ids=services.map(service=>service.id);
  const details=ids.length?await db.query<Consolidated>(`SELECT s.id,s.folio::text,s.gross_kg::text,s.tare_kg::text,s.scheduled_for,
    g.guide_numbers,g.origin_tickets,g.destination_tickets,g.invoice_kg::text,
    commercial.service_sheet,commercial.eyj_guide,commercial.client_guide,commercial.sidrep,
    commercial.order_reference,commercial.quote_reference,
    COALESCE(a.plate,dr.plate) AS truck_plate,COALESCE(u.name,e.name,dr.driver_name) AS driver_name,dr.outcome AS daily_outcome
    FROM service_requests s
    LEFT JOIN service_commercial_details commercial ON commercial.service_id=s.id
    LEFT JOIN assets a ON a.id=s.assigned_asset_id LEFT JOIN users u ON u.id=s.driver_id
    LEFT JOIN external_drivers e ON e.id=s.external_driver_id
    LEFT JOIN LATERAL (SELECT string_agg(guide_number,', ' ORDER BY movement_date) AS guide_numbers,
      string_agg(origin_ticket,', ' ORDER BY movement_date) AS origin_tickets,
      string_agg(destination_ticket,', ' ORDER BY movement_date) AS destination_tickets,
      sum(invoice_kg) AS invoice_kg FROM service_guide_controls WHERE service_id=s.id) g ON true
    LEFT JOIN LATERAL (SELECT d.driver_name,d.outcome,da.plate FROM service_day_reports d
      JOIN assets da ON da.id=d.asset_id WHERE d.service_id=s.id ORDER BY d.day DESC LIMIT 1) dr ON true
    WHERE s.id=ANY($1::uuid[]) ORDER BY s.folio`,[ids]):[];
  const byId=new Map(details.map(item=>[item.id,item]));
  const header=["Cliente","Período desde","Período hasta","Formato EDP","N° EDP vinculado","Folio servicio","Estado","Fecha cierre / arriendo",
    "Tipo","Residuo o servicio","Fecha programada","Cotización","OC cliente","Hoja servicio","Guía E y J","Guía cliente","SIDREP",
    "Guía servicio","Guías control","Tickets origen","Tickets destino",
    "Bruto kg","Tara kg","Neto kg","Kg facturable de guías","Conductor","Patente","Resultado diario",
    "Cantidad valorizada","Unidad","Unitario CLP","Neto CLP referencial","Factura vinculada","Control"];
  const lines=[header.map(csv).join(";")];
  for(const service of services){
    const detail=byId.get(service.id);
    const flags=[result.cycle.statement_type==="residuos"&&!service.guide_number&&!detail?.guide_numbers&&!detail?.eyj_guide?"Guía pendiente":"",
      result.cycle.statement_type==="residuos"&&!detail?.service_sheet?"Hoja de servicio sin registrar":"",
      service.partial_period?"Revisar prorrateo":"",service.total_clp==null?"Sin valorización":"",
      result.cycle.statement_type==="residuos"&&!service.weight_kg?"Sin pesaje neto":""].filter(Boolean).join(" · ");
    lines.push([result.cycle.client_name,result.cycle.period_from,result.cycle.period_to,result.cycle.statement_type,
      result.cycle.statement_number,service.folio,service.status,service.closed_on,service.service_type,service.waste_type,
      detail?.scheduled_for,detail?.quote_reference,detail?.order_reference,detail?.service_sheet,
      detail?.eyj_guide,detail?.client_guide,detail?.sidrep,
      service.guide_number,detail?.guide_numbers,detail?.origin_tickets,detail?.destination_tickets,
      detail?.gross_kg,detail?.tare_kg,service.weight_kg,detail?.invoice_kg,detail?.driver_name,detail?.truck_plate,
      detail?.daily_outcome,service.quantity,service.tariff_unit,service.unit_price_clp,service.total_clp,
      service.invoice_number,flags].map(value=>csv(value instanceof Date?value.toISOString().slice(0,10):value)).join(";"));
  }
  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`,{headers:{"Content-Type":"text/csv; charset=utf-8",
    "Content-Disposition":`attachment; filename="consolidado-edp-${chileCsvDay()}.csv"`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
