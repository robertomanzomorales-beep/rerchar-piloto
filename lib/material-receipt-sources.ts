import type {Actor} from "./auth";
import {canManage} from "./auth";
import {db} from "./db";

export type ReceiptSourceService={id:string;folio:string;operating_company:"rerchar";client_id:string;client_name:string;
  site_name:string;origin:string;destination:string;driver_name:string|null;driver_tax_id:string|null;
  truck_plate:string|null;trailer_plate:string|null;service_guide:string|null;
  control_guides:string[];origin_tickets:string[];destination_tickets:string[];
  documents?:{id:string;name:string}[]};

// Las referencias se muestran para revisión. Una guía registrada en un
// servicio no se convierte automáticamente en guía de origen o de traslado.
export async function listReceiptSourceServices(actor:Actor){
  if(!canManage(actor))throw new Error("Sin acceso a las referencias operativas.");
  return db.query<ReceiptSourceService>(`SELECT s.id,s.folio,s.operating_company,s.client_id,c.name AS client_name,
    cs.name AS site_name,s.origin,s.destination,COALESCE(u.name,ed.name) AS driver_name,ed.tax_id AS driver_tax_id,
    a.plate AS truck_plate,r.plate AS trailer_plate,s.guide_number AS service_guide,
    ARRAY(SELECT DISTINCT g.guide_number FROM service_guide_controls g WHERE g.service_id=s.id AND trim(g.guide_number)<>'' ORDER BY g.guide_number) AS control_guides,
    ARRAY(SELECT DISTINCT g.origin_ticket FROM service_guide_controls g WHERE g.service_id=s.id AND nullif(trim(g.origin_ticket),'') IS NOT NULL ORDER BY g.origin_ticket) AS origin_tickets,
    ARRAY(SELECT DISTINCT g.destination_ticket FROM service_guide_controls g WHERE g.service_id=s.id AND nullif(trim(g.destination_ticket),'') IS NOT NULL ORDER BY g.destination_ticket) AS destination_tickets,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',COALESCE(e.original_filename,'Respaldo')) ORDER BY e.created_at DESC)
      FROM service_evidence e WHERE e.service_id=s.id AND e.storage_key IS NOT NULL
      AND e.document_kind IN ('guia_traslado','ticket_pesaje','hoja_servicio')), '[]'::jsonb) AS documents
    FROM service_requests s JOIN clients c ON c.id=s.client_id JOIN client_sites cs ON cs.id=s.site_id
    LEFT JOIN users u ON u.id=s.driver_id LEFT JOIN external_drivers ed ON ed.id=s.external_driver_id
    LEFT JOIN assets a ON a.id=s.assigned_asset_id LEFT JOIN assets r ON r.id=s.ramp_asset_id
    WHERE s.operating_company='rerchar' AND s.deleted_at IS NULL ORDER BY s.created_at DESC,s.id DESC`);
}
