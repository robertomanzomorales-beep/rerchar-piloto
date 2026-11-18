import {createHash} from "node:crypto";
import {z} from "zod";
import type {Actor} from "./auth";
import type {Company} from "./companies";
import {db,transaction} from "./db";
import {moduleReady} from "./schema-readiness";
import {parseSiiXml,siiReject,siiRut} from "./sii-xml";
export {SiiDocumentError} from "./sii-xml";

const companySchema=z.enum(["rerchar","e_y_j"]);
const uuid=z.uuid();
function admin(actor:Actor){if(actor.role!=="admin")siiReject("Documentos SII es de acceso exclusivo de administración.");}
async function ready(){if(!await moduleReady("sii_documents"))siiReject("Documentos SII todavía no está disponible en esta versión.");}
export type SiiCompanySetting={company:Company;tax_id:string|null};
export type SiiDocumentRow={id:string;company:Company;direction:"emitido"|"recibido";document_type:number;folio:string;
  issued_on:Date|string;due_on:Date|string|null;issuer_tax_id:string;issuer_name:string;receiver_tax_id:string;receiver_name:string;
  net_clp:string;exempt_clp:string;vat_clp:string;total_clp:string;totals_match:boolean;
  document_references:{document_type:string;folio:string}[];review_status:"pendiente"|"revisado";
  review_note:string|null;reviewed_at:Date|string|null;reviewed_name:string|null;original_filename:string;created_at:Date|string};

// A future connector must deliver source XML to this same ingestion boundary.
// No endpoint, credentials or successful SII connection are fabricated here.
export interface SiiXmlConnector {
  readonly name:string;
  readDocuments(request:{taxId:string;from:string;to:string;cursor?:string}):Promise<{files:Uint8Array[];nextCursor?:string}>;
}

export async function listSiiCompanySettings(actor:Actor){
  admin(actor);await ready();
  return db.query<SiiCompanySetting>("SELECT company,tax_id FROM sii_company_settings ORDER BY company");
}
export async function saveSiiCompanyTaxId(actor:Actor,company:unknown,taxId:unknown){
  admin(actor);await ready();const selected=companySchema.parse(company),rut=siiRut(z.string().trim().max(20).parse(taxId));
  await transaction(async tx=>{
    const [old]=await tx.query<SiiCompanySetting&{id:string}>("SELECT id,company,tax_id FROM sii_company_settings WHERE company=$1 FOR UPDATE",[selected]);
    if(!old)siiReject("Empresa no encontrada.");
    if(old.tax_id===rut)return;
    const [used]=await tx.query("SELECT id FROM sii_documents WHERE company=$1 LIMIT 1",[selected]);
    if(used)siiReject("La empresa tiene documentos incorporados. Su RUT no puede cambiarse desde esta pantalla.");
    const [other]=await tx.query("SELECT company FROM sii_company_settings WHERE tax_id=$1 AND company<>$2",[rut,selected]);
    if(other)siiReject("El RUT ya corresponde a la otra empresa.");
    await tx.query("UPDATE sii_company_settings SET tax_id=$2,updated_by=$3,updated_at=now() WHERE company=$1",[selected,rut,actor.id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES($1,'configure','sii_company',$2,$3,$4)",
      [actor.id,old.id,JSON.stringify(old),JSON.stringify({company:selected,tax_id:rut})]);
  });
}

export async function importSiiXml(actor:Actor,company:unknown,bytes:Uint8Array,filename:string){
  admin(actor);await ready();const selected=companySchema.parse(company);
  const documents=parseSiiXml(bytes),sourceHash=createHash("sha256").update(bytes).digest("hex");
  const name=filename.replace(/[\x00-\x1f\\/]/g,"_").slice(0,160)||"documento.xml";
  return transaction(async tx=>{
    const [setting]=await tx.query<SiiCompanySetting>("SELECT company,tax_id FROM sii_company_settings WHERE company=$1 FOR UPDATE",[selected]);
    if(!setting?.tax_id)siiReject("Registre primero el RUT de la empresa para comprobar a quién pertenecen los documentos.");
    let inserted=0,duplicates=0,sourceId:string|undefined;
    for(const document of documents){
      const issued=document.issuer_tax_id===setting.tax_id,received=document.receiver_tax_id===setting.tax_id;
      if(issued===received)siiReject(`El documento ${document.folio} no identifica de forma inequívoca a esta empresa como emisor o receptor.`);
      const direction=issued?"emitido":"recibido";
      const [existing]=await tx.query<{id:string;payload_sha256:string}>(`SELECT id,payload_sha256 FROM sii_documents
        WHERE company=$1 AND direction=$2 AND issuer_tax_id=$3 AND document_type=$4 AND folio=$5`,
        [selected,direction,document.issuer_tax_id,document.document_type,document.folio]);
      if(existing){
        if(existing.payload_sha256!==document.payload_sha256)siiReject(`El folio ${document.folio} ya existe con otro contenido. Revise ambos XML antes de continuar.`);
        duplicates++;continue;
      }
      if(!sourceId){
        const [source]=await tx.query<{id:string}>(`INSERT INTO sii_xml_sources(company,sha256,original_filename,original_xml,created_by)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT(company,sha256) DO UPDATE SET sha256=EXCLUDED.sha256 RETURNING id`,
          [selected,sourceHash,name,Buffer.from(bytes),actor.id]);
        sourceId=source.id;
      }
      const [created]=await tx.query<{id:string}>(`INSERT INTO sii_documents
        (company,direction,document_type,folio,issued_on,due_on,issuer_tax_id,issuer_name,receiver_tax_id,receiver_name,
         net_clp,exempt_clp,vat_clp,total_clp,totals_match,document_references,source,source_sha256,payload_sha256,
         source_id,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'xml',$17,$18,$19,$20) RETURNING id`,
        [selected,direction,document.document_type,document.folio,document.issued_on,document.due_on,
          document.issuer_tax_id,document.issuer_name,document.receiver_tax_id,document.receiver_name,
          document.net_clp,document.exempt_clp,document.vat_clp,document.total_clp,document.totals_match,
          JSON.stringify(document.references),sourceHash,document.payload_sha256,sourceId,actor.id]);
      await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value) VALUES($1,'import','sii_document',$2,$3)",
        [actor.id,created.id,JSON.stringify({company:selected,direction,document_type:document.document_type,folio:document.folio,source:"xml",source_sha256:sourceHash})]);
      inserted++;
    }
    return {inserted,duplicates};
  });
}

export type SiiDocumentFilters={company?:Company|"";direction?:""|"emitido"|"recibido";review?:""|"pendiente"|"revisado";page?:number};
export async function listSiiDocuments(actor:Actor,input:SiiDocumentFilters={}){
  admin(actor);await ready();
  const filter=z.object({company:companySchema.or(z.literal("")).default(""),
    direction:z.enum(["","emitido","recibido"]).default(""),review:z.enum(["","pendiente","revisado"]).default(""),
    page:z.number().int().min(1).max(100000).default(1)}).parse(input);
  const predicate="($1::text='' OR d.company=$1) AND ($2::text='' OR d.direction=$2) AND ($3::text='' OR d.review_status=$3)";
  const params=[filter.company,filter.direction,filter.review];
  const [count]=await db.query<{total:string;pending:string}>(`SELECT count(*)::text AS total,
    count(*) FILTER (WHERE d.review_status='pendiente')::text AS pending FROM sii_documents d WHERE ${predicate}`,params);
  const pages=Math.max(1,Math.ceil(Number(count.total)/100)),page=Math.min(filter.page,pages);
  const rows=await db.query<SiiDocumentRow>(`SELECT d.id,d.company,d.direction,d.document_type,d.folio,d.issued_on,d.due_on,
    d.issuer_tax_id,d.issuer_name,d.receiver_tax_id,d.receiver_name,d.net_clp,d.exempt_clp,d.vat_clp,d.total_clp,d.totals_match,
    d.document_references,d.review_status,d.review_note,d.reviewed_at,u.name AS reviewed_name,x.original_filename,d.created_at
    FROM sii_documents d JOIN sii_xml_sources x ON x.id=d.source_id LEFT JOIN users u ON u.id=d.reviewed_by WHERE ${predicate}
    ORDER BY d.issued_on DESC,d.created_at DESC,d.id DESC LIMIT 100 OFFSET $4`,[...params,(page-1)*100]);
  return {rows,total:Number(count.total),pending:Number(count.pending),page,pages};
}
export async function reviewSiiDocument(actor:Actor,id:string,input:unknown){
  admin(actor);await ready();uuid.parse(id);
  const data=z.object({status:z.enum(["pendiente","revisado"]),note:z.string().trim().max(500).default("")}).parse(input);
  await transaction(async tx=>{
    const [old]=await tx.query<{review_status:string;totals_match:boolean}>("SELECT review_status,totals_match FROM sii_documents WHERE id=$1 FOR UPDATE",[id]);
    if(!old)siiReject("Documento no encontrado.");
    if(data.status==="pendiente"&&data.note.length<5)siiReject("Indique por qué devuelve el documento a revisión.");
    if(data.status==="revisado"&&!old.totals_match&&data.note.length<10)siiReject("Explique la diferencia de totales u otros impuestos antes de registrar la revisión interna.");
    await tx.query(`UPDATE sii_documents SET review_status=$2,review_note=NULLIF($3,''),
      reviewed_by=CASE WHEN $2='revisado' THEN $4::uuid ELSE NULL END,
      reviewed_at=CASE WHEN $2='revisado' THEN now() ELSE NULL END WHERE id=$1`,[id,data.status,data.note,actor.id]);
    await tx.query("INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value) VALUES($1,'review','sii_document',$2,$3,$4)",
      [actor.id,id,JSON.stringify(old),JSON.stringify(data)]);
  });
}
export async function getSiiOriginalXml(actor:Actor,id:string){
  admin(actor);await ready();uuid.parse(id);
  const [row]=await db.query<{original_xml:Uint8Array;original_filename:string}>(`SELECT x.original_xml,x.original_filename
    FROM sii_documents d JOIN sii_xml_sources x ON x.id=d.source_id WHERE d.id=$1`,[id]);
  if(!row)siiReject("Documento no encontrado.");return row;
}
