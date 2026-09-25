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
  invoice_kg:string|null;invoice_number:string|null;valued_guide_number:string|null;notes:string|null;recorded_at:Date};

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
    invoice_kg:optionalKg,invoice_number:optional(80),valued_guide_number:optional(80),notes:optional(500)}).parse(input);
  if([data.origin_kg,data.arrival_kg,data.return_weight_kg].every(value=>value===""))reject("Indique al menos un peso del traslado.");
  return transaction(async tx=>{
    const [service]=await tx.query<{id:string;guide_number:string|null}>("SELECT id,guide_number FROM service_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[id]);
    if(!service)reject("Servicio no encontrado.");
    const [activeCertificate]=await tx.query("SELECT id FROM service_certificates WHERE service_id=$1 AND status='vigente' LIMIT 1",[id]);
    if(activeCertificate)reject("Revoque el certificado vigente antes de cambiar los pesos o guías vinculados al servicio.");
    const [previous]=await tx.query<GuideControl>("SELECT * FROM service_guide_controls WHERE service_id=$1 AND guide_number=$2 FOR UPDATE",[id,data.guide_number]);
    const values=[id,data.guide_number,data.movement_date,data.movement_type,data.origin_ticket,data.destination_ticket,data.return_ticket,
      data.origin_kg,data.complementary_kg,data.arrival_kg,data.returned_impurities_kg,data.return_weight_kg,
      data.destination_impurities_kg,data.invoice_kg,data.invoice_number,data.valued_guide_number,data.notes,actor.id];
    const [row]=await tx.query<{id:string}>(`INSERT INTO service_guide_controls
      (service_id,guide_number,movement_date,movement_type,origin_ticket,destination_ticket,return_ticket,origin_kg,complementary_kg,
       arrival_kg,returned_impurities_kg,return_weight_kg,destination_impurities_kg,invoice_kg,invoice_number,valued_guide_number,notes,recorded_by)
      VALUES ($1,$2,$3,$4,NULLIF($5,''),NULLIF($6,''),NULLIF($7,''),NULLIF($8::text,'')::numeric,NULLIF($9::text,'')::numeric,
              NULLIF($10::text,'')::numeric,NULLIF($11::text,'')::numeric,NULLIF($12::text,'')::numeric,NULLIF($13::text,'')::numeric,
              NULLIF($14::text,'')::numeric,NULLIF($15,''),NULLIF($16,''),NULLIF($17,''),$18)
      ON CONFLICT (service_id,guide_number) DO UPDATE SET movement_date=EXCLUDED.movement_date,movement_type=EXCLUDED.movement_type,
        origin_ticket=EXCLUDED.origin_ticket,destination_ticket=EXCLUDED.destination_ticket,return_ticket=EXCLUDED.return_ticket,
        origin_kg=EXCLUDED.origin_kg,complementary_kg=EXCLUDED.complementary_kg,arrival_kg=EXCLUDED.arrival_kg,
        returned_impurities_kg=EXCLUDED.returned_impurities_kg,return_weight_kg=EXCLUDED.return_weight_kg,
        destination_impurities_kg=EXCLUDED.destination_impurities_kg,invoice_kg=EXCLUDED.invoice_kg,
        invoice_number=EXCLUDED.invoice_number,valued_guide_number=EXCLUDED.valued_guide_number,notes=EXCLUDED.notes,
        recorded_by=EXCLUDED.recorded_by,recorded_at=now() RETURNING id`,values);
    if(!service.guide_number)await tx.query("UPDATE service_requests SET guide_number=$2,updated_at=now() WHERE id=$1",[id,data.guide_number]);
    await tx.query("INSERT INTO service_events(service_id,kind,description,actor_id,previous_value,next_value) VALUES ($1,'guia_control',$2,$3,$4,$5)",
      [id,`Control de guía ${data.guide_number} ${previous?"actualizado":"registrado"}`,actor.id,previous?JSON.stringify(previous):null,JSON.stringify(data)]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES ($1,$2,'service_guide_control',$3,$4,$5)",
      [actor.id,previous?"update":"create",row.id,previous?JSON.stringify(previous):null,JSON.stringify(data)]);
    return row.id;
  });
}
