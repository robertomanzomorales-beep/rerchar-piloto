import {z} from "zod";
import type {Actor} from "./auth";
import {canManage,canReadService} from "./auth";
import {db,transaction} from "./db";

const uuid=z.uuid();
const optional=(max:number)=>z.string().trim().max(max).optional().default("");
const optionalKg=z.union([z.literal(""),z.coerce.number().finite().min(0).max(100_000_000)]).optional().default("");
export class GuideError extends Error {}
function reject(message:string):never{throw new GuideError(message);}

export type GuideControl={id:string;service_id:string;guide_number:string;movement_date:Date|string;movement_type:string;
  origin_ticket:string|null;destination_ticket:string|null;return_ticket:string|null;origin_kg:string|null;complementary_kg:string|null;
  arrival_kg:string|null;returned_impurities_kg:string|null;return_weight_kg:string|null;destination_impurities_kg:string|null;
  invoice_kg:string|null;invoice_number:string|null;valued_guide_number:string|null;notes:string|null;recorded_at:Date;
  departure_ticket:string|null;driver_name:string|null;truck_plate:string|null;material_name:string|null;
  agreed_price_clp:string|null;invoice_price_clp:string|null;invoice_issued_on:Date|string|null;payment_on:Date|string|null;
  freight_company:string|null;freight_invoice_number:string|null;freight_guide_reference:string|null;freight_payment_required:string|null};

function kg(value:string|number|null|undefined){return value==null || value===""?null:Math.round(Number(value)*100);}
export function guideDifferences(row:Pick<GuideControl,"origin_kg"|"complementary_kg"|"arrival_kg"|"returned_impurities_kg"|"destination_impurities_kg"|"invoice_kg">){
  const origin=kg(row.origin_kg),complement=kg(row.complementary_kg)??0,arrival=kg(row.arrival_kg);
  const returned=kg(row.returned_impurities_kg)??0,impurities=kg(row.destination_impurities_kg)??0,invoice=kg(row.invoice_kg);
  return {
    departure_kg:origin==null?null:(origin+complement)/100,
    difference_kg:origin==null||arrival==null?null:(arrival-(origin+complement-returned))/100,
    invoice_difference_kg:arrival==null||invoice==null?null:(arrival-impurities-invoice)/100,
  };
}
export function guideValues(row:Pick<GuideControl,"arrival_kg"|"destination_impurities_kg"|"invoice_kg"|"agreed_price_clp"|"invoice_price_clp">){
  const arrival=kg(row.arrival_kg),impurities=kg(row.destination_impurities_kg)??0,invoice=kg(row.invoice_kg);
  const agreed=kg(row.agreed_price_clp),charged=kg(row.invoice_price_clp);
  const estimated=arrival==null||agreed==null?null:Math.round((arrival-impurities)*agreed/10_000);
  const billed=invoice==null||charged==null?null:Math.round(invoice*charged/10_000);
  return {estimated_clp:estimated,billed_clp:billed,variance_clp:estimated==null||billed==null?null:estimated-billed};
}

export async function listGuideControls(actor:Actor,serviceId:string){
  if(!uuid.safeParse(serviceId).success)reject("Servicio inválido.");
  const [service]=await db.query<{client_id:string;driver_id:string|null}>("SELECT client_id,driver_id FROM service_requests WHERE id=$1 AND deleted_at IS NULL",[serviceId]);
  if(!service||!canReadService(actor,service))reject("Servicio no disponible para su perfil.");
  return db.query<GuideControl>("SELECT * FROM service_guide_controls WHERE service_id=$1 ORDER BY movement_date DESC,recorded_at DESC",[serviceId]);
}

export async function saveGuideControl(actor:Actor,serviceId:string,input:unknown){
  if(!canManage(actor))reject("Sólo operaciones puede registrar el control de guías.");
  const id=uuid.parse(serviceId);
  const data=z.object({guide_number:z.string().trim().min(1).max(50),movement_date:z.iso.date(),
    movement_type:z.enum(["compra","venta","traslado","servicio","otro"]),origin_ticket:optional(80),destination_ticket:optional(80),
    return_ticket:optional(80),origin_kg:optionalKg,complementary_kg:optionalKg,arrival_kg:optionalKg,
    returned_impurities_kg:optionalKg,return_weight_kg:optionalKg,destination_impurities_kg:optionalKg,
    invoice_kg:optionalKg,invoice_number:optional(80),valued_guide_number:optional(80),notes:optional(500),
    departure_ticket:optional(80),driver_name:optional(120),truck_plate:optional(30),material_name:optional(160),
    agreed_price_clp:optionalKg,invoice_price_clp:optionalKg,
    invoice_issued_on:z.union([z.iso.date(),z.literal("")]).default(""),payment_on:z.union([z.iso.date(),z.literal("")]).default(""),
    freight_company:optional(160),freight_invoice_number:optional(80),freight_guide_reference:optional(80),
    freight_payment_required:z.enum(["","si","no","pendiente"]).default("")}).parse(input);
  return transaction(async tx=>{
    const [service]=await tx.query<{id:string;guide_number:string|null}>("SELECT id,guide_number FROM service_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[id]);
    if(!service)reject("Servicio no encontrado.");
    const [activeCertificate]=await tx.query("SELECT id FROM service_certificates WHERE service_id=$1 AND status='vigente' LIMIT 1",[id]);
    if(activeCertificate)reject("Revoque el certificado vigente antes de cambiar los pesos o guías vinculados al servicio.");
    const [previous]=await tx.query<GuideControl>("SELECT * FROM service_guide_controls WHERE service_id=$1 AND guide_number=$2 FOR UPDATE",[id,data.guide_number]);
    if(!previous&&[data.origin_kg,data.arrival_kg,data.return_weight_kg].every(value=>value===""))
      reject("Indique al menos un peso del traslado.");
    const arrival=data.arrival_kg!==""?Number(data.arrival_kg):previous?.arrival_kg==null?null:Number(previous.arrival_kg);
    const impurities=data.destination_impurities_kg!==""?Number(data.destination_impurities_kg):Number(previous?.destination_impurities_kg??0);
    const origin=data.origin_kg!==""?Number(data.origin_kg):previous?.origin_kg==null?null:Number(previous.origin_kg);
    const stock=data.complementary_kg!==""?Number(data.complementary_kg):Number(previous?.complementary_kg??0);
    const returned=data.returned_impurities_kg!==""?Number(data.returned_impurities_kg):Number(previous?.returned_impurities_kg??0);
    if(arrival!==null&&impurities>arrival)reject("Las impurezas descontadas no pueden superar el peso recibido en destino.");
    if(origin!==null&&returned>origin+stock)reject("El material devuelto supera el peso total de salida.");
    const values=[id,data.guide_number,data.movement_date,data.movement_type,data.origin_ticket,data.destination_ticket,data.return_ticket,
      data.origin_kg,data.complementary_kg,data.arrival_kg,data.returned_impurities_kg,data.return_weight_kg,
      data.destination_impurities_kg,data.invoice_kg,data.invoice_number,data.valued_guide_number,data.notes,actor.id,
      data.departure_ticket,data.driver_name,data.truck_plate,data.material_name,data.agreed_price_clp,data.invoice_price_clp,
      data.invoice_issued_on,data.payment_on,data.freight_company,data.freight_invoice_number,data.freight_guide_reference,
      data.freight_payment_required];
    const [row]=await tx.query<GuideControl>(`INSERT INTO service_guide_controls
      (service_id,guide_number,movement_date,movement_type,origin_ticket,destination_ticket,return_ticket,origin_kg,complementary_kg,
       arrival_kg,returned_impurities_kg,return_weight_kg,destination_impurities_kg,invoice_kg,invoice_number,valued_guide_number,notes,recorded_by,
       departure_ticket,driver_name,truck_plate,material_name,agreed_price_clp,invoice_price_clp,invoice_issued_on,payment_on,
       freight_company,freight_invoice_number,freight_guide_reference,freight_payment_required)
      VALUES ($1,$2,$3,$4,NULLIF($5,''),NULLIF($6,''),NULLIF($7,''),NULLIF($8::text,'')::numeric,NULLIF($9::text,'')::numeric,
              NULLIF($10::text,'')::numeric,NULLIF($11::text,'')::numeric,NULLIF($12::text,'')::numeric,NULLIF($13::text,'')::numeric,
              NULLIF($14::text,'')::numeric,NULLIF($15,''),NULLIF($16,''),NULLIF($17,''),$18,
              NULLIF($19,''),NULLIF($20,''),NULLIF($21,''),NULLIF($22,''),NULLIF($23::text,'')::numeric,
              NULLIF($24::text,'')::numeric,NULLIF($25,'')::date,NULLIF($26,'')::date,
              NULLIF($27,''),NULLIF($28,''),NULLIF($29,''),NULLIF($30,''))
      ON CONFLICT (service_id,guide_number) DO UPDATE SET movement_date=EXCLUDED.movement_date,movement_type=EXCLUDED.movement_type,
        origin_ticket=COALESCE(EXCLUDED.origin_ticket,service_guide_controls.origin_ticket),
        destination_ticket=COALESCE(EXCLUDED.destination_ticket,service_guide_controls.destination_ticket),
        return_ticket=COALESCE(EXCLUDED.return_ticket,service_guide_controls.return_ticket),
        origin_kg=COALESCE(EXCLUDED.origin_kg,service_guide_controls.origin_kg),
        complementary_kg=COALESCE(EXCLUDED.complementary_kg,service_guide_controls.complementary_kg),
        arrival_kg=COALESCE(EXCLUDED.arrival_kg,service_guide_controls.arrival_kg),
        returned_impurities_kg=COALESCE(EXCLUDED.returned_impurities_kg,service_guide_controls.returned_impurities_kg),
        return_weight_kg=COALESCE(EXCLUDED.return_weight_kg,service_guide_controls.return_weight_kg),
        destination_impurities_kg=COALESCE(EXCLUDED.destination_impurities_kg,service_guide_controls.destination_impurities_kg),
        invoice_kg=COALESCE(EXCLUDED.invoice_kg,service_guide_controls.invoice_kg),
        invoice_number=COALESCE(EXCLUDED.invoice_number,service_guide_controls.invoice_number),
        valued_guide_number=COALESCE(EXCLUDED.valued_guide_number,service_guide_controls.valued_guide_number),
        notes=COALESCE(EXCLUDED.notes,service_guide_controls.notes),
        departure_ticket=COALESCE(EXCLUDED.departure_ticket,service_guide_controls.departure_ticket),
        driver_name=COALESCE(EXCLUDED.driver_name,service_guide_controls.driver_name),
        truck_plate=COALESCE(EXCLUDED.truck_plate,service_guide_controls.truck_plate),
        material_name=COALESCE(EXCLUDED.material_name,service_guide_controls.material_name),
        agreed_price_clp=COALESCE(EXCLUDED.agreed_price_clp,service_guide_controls.agreed_price_clp),
        invoice_price_clp=COALESCE(EXCLUDED.invoice_price_clp,service_guide_controls.invoice_price_clp),
        invoice_issued_on=COALESCE(EXCLUDED.invoice_issued_on,service_guide_controls.invoice_issued_on),
        payment_on=COALESCE(EXCLUDED.payment_on,service_guide_controls.payment_on),
        freight_company=COALESCE(EXCLUDED.freight_company,service_guide_controls.freight_company),
        freight_invoice_number=COALESCE(EXCLUDED.freight_invoice_number,service_guide_controls.freight_invoice_number),
        freight_guide_reference=COALESCE(EXCLUDED.freight_guide_reference,service_guide_controls.freight_guide_reference),
        freight_payment_required=COALESCE(EXCLUDED.freight_payment_required,service_guide_controls.freight_payment_required),
        recorded_by=EXCLUDED.recorded_by,recorded_at=now() RETURNING *`,values);
    if(!service.guide_number)await tx.query("UPDATE service_requests SET guide_number=$2,updated_at=now() WHERE id=$1",[id,data.guide_number]);
    await tx.query("INSERT INTO service_events(service_id,kind,description,actor_id,previous_value,next_value) VALUES ($1,'guia_control',$2,$3,$4,$5)",
      [id,`Control de guía ${data.guide_number} ${previous?"actualizado":"registrado"}`,actor.id,previous?JSON.stringify(previous):null,JSON.stringify(row)]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES ($1,$2,'service_guide_control',$3,$4,$5)",
      [actor.id,previous?"update":"create",row.id,previous?JSON.stringify(previous):null,JSON.stringify(row)]);
    return row.id;
  });
}
