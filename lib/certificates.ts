import {randomBytes} from "node:crypto";
import {z} from "zod";
import {canManage,type Actor} from "./auth";
import {db,transaction,type Db} from "./db";
import type {CertificateSnapshot} from "./certificate-pdf";

const uuid=z.uuid();
export class CertificateError extends Error {}
function reject(message:string):never{throw new CertificateError(message);}
function admin(actor:Actor){if(actor.role!=="admin")reject("Sólo administración puede emitir o revocar certificados.");}
export type Certificate={id:string;service_id:string;client_id:string;client_name:string;site_name:string;
  folio:string;version:number;code:string;status:string;snapshot:CertificateSnapshot;issued_at:Date;
  revoked_at:Date|null;revocation_reason:string|null;downloads:string};
const certificateSelect=`SELECT x.id,x.service_id,x.version,x.code,x.status,x.snapshot,x.issued_at,x.revoked_at,x.revocation_reason,
  s.client_id,s.folio,c.name AS client_name,cs.name AS site_name,
  (SELECT count(*)::text FROM certificate_downloads d WHERE d.certificate_id=x.id) AS downloads
  FROM service_certificates x JOIN service_requests s ON s.id=x.service_id
  JOIN clients c ON c.id=s.client_id JOIN client_sites cs ON cs.id=s.site_id`;

export async function listCertificates(actor:Actor){
  if(actor.role==="conductor")reject("Este módulo no corresponde al perfil conductor.");
  return db.query<Certificate>(`${certificateSelect} WHERE s.deleted_at IS NULL
    AND ($1::text<>'cliente' OR (s.client_id=$2::uuid AND x.status='vigente'))
    ORDER BY x.issued_at DESC,x.version DESC LIMIT 300`,[actor.role,actor.client_id]);
}

export type CertificatePreparation={id:string;folio:string;client_name:string;site_name:string;
  ready:boolean;reason:string|null;nextHref:string;nextLabel:string};

export async function listCertificatePreparation(actor:Actor):Promise<CertificatePreparation[]>{
  admin(actor);
  const services=await db.query<{id:string;folio:string;client_name:string;site_name:string;
    record_id:string|null;record_status:string|null;quantity_kg:string|null;
    gross_kg:string|null;tare_kg:string|null;closed_at:Date|null;evidence_count:string}>(`
    SELECT s.id,s.folio,c.name AS client_name,cs.name AS site_name,
      w.id AS record_id,w.status AS record_status,w.quantity_kg,s.gross_kg,s.tare_kg,s.closed_at,
      (SELECT count(*)::text FROM service_evidence e
       WHERE e.service_id=s.id AND e.storage_key IS NOT NULL) AS evidence_count
    FROM service_requests s
    JOIN clients c ON c.id=s.client_id JOIN client_sites cs ON cs.id=s.site_id
    LEFT JOIN waste_records w ON w.service_id=s.id
    WHERE s.status='completada' AND s.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM service_certificates x WHERE x.service_id=s.id AND x.status='vigente')
    ORDER BY s.closed_at DESC LIMIT 100`);
  return services.map(s=>{
    const base={id:s.id,folio:s.folio,client_name:s.client_name,site_name:s.site_name};
    if(!s.record_id)return {...base,ready:false,reason:"Falta preparar la ficha ambiental.",
      nextHref:`/cumplimiento?service_id=${s.id}`,nextLabel:"Preparar ficha"};
    if(s.record_status==="borrador")return {...base,ready:false,reason:"La ficha ambiental está en borrador; falta revisarla.",
      nextHref:`/cumplimiento/${s.record_id}`,nextLabel:"Revisar ficha"};
    if(s.record_status==="observado")return {...base,ready:false,reason:"La ficha ambiental está observada; debe corregirla y revisarla.",
      nextHref:`/cumplimiento/${s.record_id}`,nextLabel:"Corregir ficha"};
    if(!["revisado","declarado"].includes(s.record_status??""))
      return {...base,ready:false,reason:"La ficha ambiental todavía no está revisada.",
        nextHref:`/cumplimiento/${s.record_id}`,nextLabel:"Revisar ficha"};
    if(Number(s.evidence_count)<1)return {...base,ready:false,reason:"Falta un archivo de evidencia válido en el servicio.",
      nextHref:`/solicitudes/${s.id}`,nextLabel:"Revisar servicio"};
    const net=s.gross_kg===null||s.tare_kg===null ? NaN : Number(s.gross_kg)-Number(s.tare_kg);
    if(!s.closed_at||!Number.isFinite(net)||net<0||s.quantity_kg===null
      ||Math.abs(net-Number(s.quantity_kg))>0.001)
      return {...base,ready:false,reason:"El cierre y el peso de la ficha deben coincidir; revise el registro.",
        nextHref:`/cumplimiento/${s.record_id}`,nextLabel:"Revisar registro"};
    return {...base,ready:true,reason:null,nextHref:`/solicitudes/${s.id}`,nextLabel:"Ver servicio"};
  });
}

export async function getCertificate(actor:Actor,id:string){
  if(!uuid.safeParse(id).success)reject("Certificado inexistente.");
  const [row]=await db.query<Certificate>(`${certificateSelect} WHERE x.id=$1`,[id]);
  if(!row||(actor.role==="cliente"&&(actor.client_id!==row.client_id||row.status!=="vigente"))
    ||(!canManage(actor)&&actor.role!=="cliente"))reject("Certificado inexistente.");
  return row;
}

export function verificationBaseUrl(){
  const value=process.env.APP_BASE_URL || (process.env.NODE_ENV!=="production"?"http://localhost:3000":"");
  if(!value)throw new CertificateError("Configure APP_BASE_URL para emitir enlaces verificables.");
  let url:URL;
  try{url=new URL(value);}catch{throw new CertificateError("APP_BASE_URL debe ser una dirección completa.");}
  if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.search||url.hash
    ||(process.env.NODE_ENV==="production"&&url.protocol!=="https:"))
    throw new CertificateError("APP_BASE_URL debe ser HTTPS en producción y no incluir credenciales ni parámetros.");
  return url.origin;
}
export function verificationUrl(code:string){return `${verificationBaseUrl()}/verificar/${code}`;}

export async function issueCertificate(actor:Actor,serviceId:string){
  admin(actor);uuid.parse(serviceId);
  verificationBaseUrl();
  return transaction(async(tx)=>{
    const [service]=await tx.query<{id:string;folio:string;status:string;client_name:string;site_name:string;
      service_type:string;waste_type:string;gross_kg:string;tare_kg:string;closed_at:Date}>(`
      SELECT s.id,s.folio,s.status,c.name AS client_name,cs.name AS site_name,s.service_type,s.waste_type,
      s.gross_kg,s.tare_kg,s.closed_at FROM service_requests s JOIN clients c ON c.id=s.client_id
      JOIN client_sites cs ON cs.id=s.site_id WHERE s.id=$1 AND s.deleted_at IS NULL FOR UPDATE OF s`,[serviceId]);
    if(!service||service.status!=="completada"||!service.closed_at)reject("Sólo se certifican servicios cerrados.");
    const [active]=await tx.query<{id:string}>("SELECT id FROM service_certificates WHERE service_id=$1 AND status='vigente'",[serviceId]);
    if(active)return active.id;
    const [record]=await tx.query<{status:string;category:string;classification:string;quantity_kg:string;guide_number:string;
      generator_name:string;transporter_name:string;receiver_name:string;treatment:string}>(`
      SELECT status,category,classification,quantity_kg,guide_number,generator_name,transporter_name,
      receiver_name,treatment FROM waste_records WHERE service_id=$1`,[serviceId]);
    if(!record||!["revisado","declarado"].includes(record.status))
      reject("Revise primero la ficha ambiental del servicio.");
    const [evidence]=await tx.query<{total:string}>(`SELECT count(*)::text AS total FROM service_evidence
      WHERE service_id=$1 AND storage_key IS NOT NULL`,[serviceId]);
    if(Number(evidence.total)<1)reject("El servicio necesita un archivo de evidencia.");
    const currentNet=Number(service.gross_kg)-Number(service.tare_kg);
    if(!Number.isFinite(currentNet)||currentNet<0||Math.abs(currentNet-Number(record.quantity_kg))>0.001)
      reject("Revise el pesaje y la ficha antes de emitir el certificado.");
    const [guide]=await tx.query<{movement_date:Date|string;valued_guide_number:string|null;weight_ticket:string|null}>(`
      SELECT movement_date,valued_guide_number,COALESCE(destination_ticket,origin_ticket) AS weight_ticket
      FROM service_guide_controls WHERE service_id=$1
      ORDER BY (guide_number=$2) DESC,movement_date DESC LIMIT 1`,[serviceId,record.guide_number]);
    const [asset]=await tx.query<{plate:string|null}>(`SELECT a.plate FROM service_requests s
      LEFT JOIN assets a ON a.id=s.assigned_asset_id WHERE s.id=$1`,[serviceId]);
    const [invoice]=await tx.query<{invoice_number:string}>(`SELECT i.invoice_number FROM service_invoices i
      JOIN service_valuations v ON v.id=i.valuation_id WHERE v.service_id=$1 AND i.status='emitida'
      ORDER BY i.issued_on DESC LIMIT 1`,[serviceId]);
    const snapshot:CertificateSnapshot={folio:`RER-${String(service.folio).padStart(5,"0")}`,
      client_name:service.client_name,site_name:service.site_name,service_type:service.service_type,waste_type:service.waste_type,
      category:record.category,classification:record.classification,quantity_kg:record.quantity_kg,
      guide_number:record.guide_number,generator_name:record.generator_name,transporter_name:record.transporter_name,
      receiver_name:record.receiver_name,treatment:record.treatment,closed_at:service.closed_at.toISOString(),
      movement_date:guide?.movement_date instanceof Date?guide.movement_date.toISOString():guide?.movement_date??null,
      valued_guide_number:guide?.valued_guide_number??null,weight_ticket:guide?.weight_ticket??null,
      plate:asset?.plate??null,invoice_number:invoice?.invoice_number??null};
    const [last]=await tx.query<{version:number}>("SELECT version FROM service_certificates WHERE service_id=$1 ORDER BY version DESC LIMIT 1",[serviceId]);
    const version=(last?.version??0)+1;
    const code=randomBytes(24).toString("hex");
    const [certificate]=await tx.query<{id:string}>(`INSERT INTO service_certificates
      (service_id,version,code,snapshot,issued_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [serviceId,version,code,JSON.stringify(snapshot),actor.id]);
    await tx.query(`INSERT INTO audit_events (actor_id,action,entity_type,entity_id,next_value)
      VALUES ($1,'issue','service_certificate',$2,$3)`,[actor.id,certificate.id,JSON.stringify({service_id:serviceId,version})]);
    await tx.query(`INSERT INTO service_events (service_id,kind,description,actor_id)
      VALUES ($1,'certificado',$2,$3)`,[serviceId,`Certificado operacional versión ${version} emitido.`,actor.id]);
    return certificate.id;
  });
}

export async function revokeActiveCertificate(tx:Db,actor:Actor,serviceId:string,reason:string){
  const [row]=await tx.query<{id:string;version:number}>(`UPDATE service_certificates SET status='revocado',
    revoked_by=$2,revoked_at=now(),revocation_reason=$3 WHERE service_id=$1 AND status='vigente'
    RETURNING id,version`,[serviceId,actor.id,reason]);
  if(row){
    await tx.query(`INSERT INTO audit_events (actor_id,action,entity_type,entity_id,next_value)
      VALUES ($1,'revoke','service_certificate',$2,$3)`,[actor.id,row.id,JSON.stringify({service_id:serviceId,version:row.version,reason})]);
    await tx.query(`INSERT INTO service_events (service_id,kind,description,actor_id)
      VALUES ($1,'certificado',$2,$3)`,[serviceId,`Certificado operacional versión ${row.version} revocado: ${reason}`,actor.id]);
  }
  return row?.id??null;
}

export async function revokeCertificate(actor:Actor,id:string,reason:unknown){
  admin(actor);uuid.parse(id);
  const text=z.string().trim().min(5).max(500).parse(reason);
  await transaction(async(tx)=>{
    const [lookup]=await tx.query<{service_id:string}>("SELECT service_id FROM service_certificates WHERE id=$1",[id]);
    if(!lookup)reject("Certificado inexistente.");
    await tx.query("SELECT id FROM service_requests WHERE id=$1 FOR UPDATE",[lookup.service_id]);
    const [row]=await tx.query<{id:string;service_id:string;status:string}>(`
      SELECT id,service_id,status FROM service_certificates WHERE id=$1 FOR UPDATE`,[id]);
    if(!row||row.status!=="vigente")reject("El certificado ya no está vigente.");
    const revoked=await revokeActiveCertificate(tx,actor,row.service_id,text);
    if(revoked!==id)reject("El certificado cambió de estado durante la revisión.");
  });
}

export async function publicVerification(code:string){
  if(!/^[0-9a-f]{48}$/.test(code))return null;
  const [row]=await db.query<{status:string;version:number;issued_at:Date;revoked_at:Date|null}>(`
    SELECT status,version,issued_at,revoked_at FROM service_certificates WHERE code=$1`,[code]);
  return row??null;
}

export async function recordDownload(actor:Actor,certificateId:string){
  await transaction(async tx=>{
    const [row]=await tx.query<{status:string}>("SELECT status FROM service_certificates WHERE id=$1 FOR UPDATE",[certificateId]);
    if(row?.status!=="vigente")reject("El certificado dejó de estar vigente.");
    await tx.query("INSERT INTO certificate_downloads (certificate_id,actor_id) VALUES ($1,$2)",[certificateId,actor.id]);
  });
}
