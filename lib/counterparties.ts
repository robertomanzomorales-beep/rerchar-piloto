import {z} from "zod";
import type {Actor} from "./auth";
import {db,transaction} from "./db";

const uuid=z.uuid();
const optional=(max:number)=>z.string().trim().max(max).default("");
const email=z.union([z.email(),z.literal("")]);
const contact=z.object({area:z.enum(["compras","servicios","contabilidad","operaciones","prevencion"]),
  name:optional(120),role:optional(100),phone:optional(40),email:email.default("")});
const schema=z.object({id:z.union([uuid,z.literal("")]).default(""),client_id:z.union([uuid,z.literal("")]).default(""),
  kind:z.enum(["cliente","proveedor","ambos"]),legal_name:z.string().trim().min(2).max(180),trade_name:optional(180),
  tax_id:z.string().trim().min(8).max(25),business_activity:z.string().trim().min(2).max(180),industry:optional(120),
  legal_address:z.string().trim().min(5).max(250),locality:z.string().trim().min(2).max(160),
  phone:z.string().trim().min(6).max(40),general_email:z.email(),website:optional(250),
  tax_status:z.enum(["afecto","exento","otro"]),legal_representative:z.string().trim().min(2).max(180),
  invoice_email:z.email(),payment_terms:z.enum(["contado","7","15","30"]),
  requires_oc:z.enum(["si","no"]),requires_hes:z.enum(["si","no"]),requires_edp:z.enum(["si","no"]),
  edp_email:email.default(""),bank_name:optional(100),account_type:z.enum(["corriente","vista","ahorro","otro",""]).default(""),account_number:optional(60),
  account_holder:optional(180),account_holder_tax_id:optional(25),currency:optional(20),proof_email:email.default(""),
  swift_iban:optional(100),bank_notes:optional(500),contacts:z.array(contact).length(5)});

export type Counterparty={id:string;client_id:string|null;kind:"cliente"|"proveedor"|"ambos";legal_name:string;
  trade_name:string|null;tax_id:string;business_activity:string;industry:string|null;legal_address:string;locality:string;
  phone:string;general_email:string;website:string|null;tax_status:"afecto"|"exento"|"otro";
  legal_representative:string;invoice_email:string;payment_terms:"contado"|"7"|"15"|"30";
  requires_oc:boolean;requires_hes:boolean;requires_edp:boolean;edp_email:string|null;
  bank_name:string|null;account_type:string|null;account_number:string|null;account_holder:string|null;
  account_holder_tax_id:string|null;currency:string|null;proof_email:string|null;swift_iban:string|null;
  bank_notes:string|null;contacts:{area:string;name:string;role:string;phone:string;email:string}[];
  status:"pendiente"|"verificada";verified_by:string|null;verified_at:Date|string|null;
  updated_by:string;updated_at:Date|string};
export type CounterpartyDocument={id:string;kind:"rut_empresa"|"certificado_bancario"|"carpeta_tributaria";
  filename:string;uploaded_at:Date|string};
export class CounterpartyError extends Error{}
function reject(message:string):never{throw new CounterpartyError(message);}
function admin(actor:Actor){if(actor.role!=="admin")reject("Sólo administración puede consultar y modificar fichas bancarias.");}
export function normalizeRut(raw:string){
  const clean=raw.replace(/[.\s]/g,"").toUpperCase();
  if(!/^\d{7,9}-[\dK]$/.test(clean))reject("RUT inválido: use número, guion y dígito verificador.");
  const [body,digit]=clean.split("-");
  let sum=0,multiplier=2;
  for(let i=body.length-1;i>=0;i--){sum+=Number(body[i])*multiplier;multiplier=multiplier===7?2:multiplier+1;}
  const expected=11-sum%11;
  if((expected===11?"0":expected===10?"K":String(expected))!==digit)reject("El dígito verificador del RUT no coincide.");
  return clean;
}
export async function listCounterparties(actor:Actor){admin(actor);
  return db.query<Counterparty>("SELECT * FROM counterparty_profiles ORDER BY legal_name LIMIT 400");
}
export async function getCounterparty(actor:Actor,id:string){admin(actor);uuid.parse(id);
  const [profile]=await db.query<Counterparty>("SELECT * FROM counterparty_profiles WHERE id=$1",[id]);
  if(!profile)reject("Ficha no encontrada.");
  const documents=await db.query<CounterpartyDocument>(`SELECT id,kind,filename,uploaded_at FROM counterparty_documents
    WHERE profile_id=$1 ORDER BY kind`,[id]);
  return {profile,documents};
}
export async function listVerifiedSuppliers(actor:Actor){admin(actor);
  return db.query<Pick<Counterparty,"id"|"legal_name"|"tax_id">>(`SELECT id,legal_name,tax_id FROM counterparty_profiles
    WHERE kind IN ('proveedor','ambos') AND status='verificada' ORDER BY legal_name`,[]);
}
export async function saveCounterparty(actor:Actor,input:unknown){
  admin(actor);const data=schema.parse(input),taxId=normalizeRut(data.tax_id);
  if(data.kind!=="proveedor"&&!data.client_id)reject("Seleccione el cliente existente para vincular esta ficha.");
  if(data.kind==="proveedor"&&data.client_id)reject("Use «Ambos» si esta empresa también figura como cliente.");
  if(data.requires_edp==="si"&&!data.edp_email)reject("Indique el correo para enviar el estado de pago.");
  const bankKeys=["bank_name","account_type","account_number","account_holder","account_holder_tax_id","proof_email"] as const;
  if(data.kind!=="cliente"&&bankKeys.some(key=>!data[key]))reject("Complete banco, cuenta, titular, RUT del titular y correo de comprobantes del proveedor.");
  if(data.kind==="cliente"&&bankKeys.some(key=>data[key])&&bankKeys.some(key=>!data[key]))
    reject("Si el cliente requiere pagos o devoluciones, complete todos sus datos bancarios.");
  if(data.account_holder_tax_id)normalizeRut(data.account_holder_tax_id);
  return transaction(async tx=>{
    if(data.client_id){
      const [client]=await tx.query<{id:string}>("SELECT id FROM clients WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",[data.client_id]);
      if(!client)reject("El cliente vinculado no existe.");
    }
    const [duplicate]=await tx.query<{id:string}>("SELECT id FROM counterparty_profiles WHERE tax_id=$1 OR ($2::uuid IS NOT NULL AND client_id=$2::uuid)",
      [taxId,data.client_id||null]);
    if(duplicate&&duplicate.id!==data.id)reject("Ya existe una ficha para este RUT o cliente. Edite la ficha existente.");
    const fields=["client_id","kind","legal_name","trade_name","tax_id","business_activity","industry","legal_address","locality",
      "phone","general_email","website","tax_status","legal_representative","invoice_email","payment_terms",
      "requires_oc","requires_hes","requires_edp","edp_email","bank_name","account_type","account_number",
      "account_holder","account_holder_tax_id","currency","proof_email","swift_iban","bank_notes","contacts"] as const;
    const values=[data.client_id||null,data.kind,data.legal_name,data.trade_name||null,taxId,data.business_activity,
      data.industry||null,data.legal_address,data.locality,data.phone,data.general_email,data.website||null,data.tax_status,
      data.legal_representative,data.invoice_email,data.payment_terms,data.requires_oc==="si",data.requires_hes==="si",
      data.requires_edp==="si",data.edp_email||null,data.bank_name||null,data.account_type||null,data.account_number||null,
      data.account_holder||null,data.account_holder_tax_id||null,data.currency||null,data.proof_email||null,
      data.swift_iban||null,data.bank_notes||null,JSON.stringify(data.contacts)];
    let id=data.id;
    if(id){
      const [previous]=await tx.query<Counterparty>("SELECT * FROM counterparty_profiles WHERE id=$1 FOR UPDATE",[id]);
      if(!previous)reject("Ficha no encontrada.");
      await tx.query(`UPDATE counterparty_profiles SET ${fields.map((key,i)=>`${key}=$${i+2}`).join(",")},
        status='pendiente',verified_by=NULL,verified_at=NULL,updated_by=$${fields.length+2},updated_at=now() WHERE id=$1`,
        [id,...values,actor.id]);
    }else{
      const [created]=await tx.query<{id:string}>(`INSERT INTO counterparty_profiles
        (${fields.join(",")},created_by,updated_by) VALUES(${fields.map((_,i)=>`$${i+1}`).join(",")},$${fields.length+1},$${fields.length+2}) RETURNING id`,
        [...values,actor.id,actor.id]);id=created.id;
    }
    if(data.client_id){
      const main=data.contacts.find(c=>c.name)?.name||null;
      await tx.query(`UPDATE clients SET name=$2,tax_id=$3,email=$4,address=$5,
        contact_name=COALESCE($6,contact_name) WHERE id=$1`,
        [data.client_id,data.legal_name,taxId,data.general_email,data.legal_address,main]);
    }
    await tx.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value)
      VALUES($1,$2,'counterparty_profile',$3,$4)`,[actor.id,data.id?"update":"create",id,
        JSON.stringify({kind:data.kind,legal_name:data.legal_name,tax_id:taxId,client_id:data.client_id||null,
          bank_name:data.bank_name||null,account_ending:data.account_number.slice(-4),status:"pendiente"})]);
    return id;
  });
}
const documentKind=z.enum(["rut_empresa","certificado_bancario","carpeta_tributaria"]);
function mime(bytes:Buffer){
  if(bytes.subarray(0,4).toString()==="%PDF")return "application/pdf";
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "image/png";
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "image/jpeg";
  reject("Adjunte PDF, PNG o JPG válido.");
}
export async function uploadCounterpartyDocument(actor:Actor,id:string,kind:string,file:File){
  admin(actor);uuid.parse(id);const type=documentKind.parse(kind);
  if(!file||file.size<1||file.size>4*1024*1024)reject("El archivo debe pesar entre 1 byte y 4 MB.");
  const bytes=Buffer.from(await file.arrayBuffer()),fileMime=mime(bytes);
  const filename=file.name.replace(/[\r\n"\\/]/g,"_").slice(0,180)||"documento";
  await transaction(async tx=>{
    const [profile]=await tx.query("SELECT id FROM counterparty_profiles WHERE id=$1 FOR UPDATE",[id]);
    if(!profile)reject("Ficha no encontrada.");
    await tx.query(`INSERT INTO counterparty_documents(profile_id,kind,filename,mime,content,uploaded_by)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(profile_id,kind) DO UPDATE SET
        filename=EXCLUDED.filename,mime=EXCLUDED.mime,content=EXCLUDED.content,
        uploaded_by=EXCLUDED.uploaded_by,uploaded_at=now()`,[id,type,filename,fileMime,bytes,actor.id]);
    await tx.query("UPDATE counterparty_profiles SET status='pendiente',verified_by=NULL,verified_at=NULL,updated_by=$2,updated_at=now() WHERE id=$1",[id,actor.id]);
    await tx.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value)
      VALUES($1,'document','counterparty_profile',$2,$3)`,[actor.id,id,JSON.stringify({kind:type,filename})]);
  });
}
export async function verifyCounterparty(actor:Actor,id:string){
  admin(actor);uuid.parse(id);
  await transaction(async tx=>{
    const [profile]=await tx.query<Counterparty>("SELECT * FROM counterparty_profiles WHERE id=$1 FOR UPDATE",[id]);
    if(!profile||profile.status!=="pendiente")reject("La ficha no requiere esta revisión.");
    if(profile.updated_by===actor.id)reject("Otra persona de administración debe verificar la ficha y la cuenta bancaria.");
    const rows=await tx.query<{kind:string}>("SELECT kind FROM counterparty_documents WHERE profile_id=$1",[id]);
    const present=new Set(rows.map(r=>r.kind)),required=profile.kind==="cliente"?
      ["rut_empresa","carpeta_tributaria"]:["rut_empresa","certificado_bancario","carpeta_tributaria"];
    if(required.some(kind=>!present.has(kind)))reject("Adjunte RUT, carpeta tributaria y, para proveedores, certificado bancario antes de verificar.");
    await tx.query("UPDATE counterparty_profiles SET status='verificada',verified_by=$2,verified_at=now() WHERE id=$1",[id,actor.id]);
    await tx.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id,next_value)
      VALUES($1,'verify','counterparty_profile',$2,$3)`,[actor.id,id,JSON.stringify({status:"verificada"})]);
  });
}
export async function getCounterpartyDocument(actor:Actor,id:string){admin(actor);uuid.parse(id);
  const [row]=await db.query<{filename:string;mime:string;content:Buffer}>(
    "SELECT filename,mime,content FROM counterparty_documents WHERE id=$1",[id]);return row??null;
}
