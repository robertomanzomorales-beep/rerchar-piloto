import {XMLParser,XMLValidator} from "fast-xml-parser";
import {z} from "zod";
import {createHash} from "node:crypto";

export class SiiDocumentError extends Error {}
export function siiReject(message:string):never{throw new SiiDocumentError(message);}
export function siiRut(value:string){
  const clean=value.replace(/[.\s]/g,"").toUpperCase(),match=clean.match(/^(\d{1,8})-([\dK])$/);
  if(!match||Number(match[1])===0)siiReject("Revise el RUT y su dígito verificador.");
  const body=String(Number(match[1]));let sum=0,multiplier=2;
  for(const digit of [...body].reverse()){sum+=Number(digit)*multiplier;multiplier=multiplier===7?2:multiplier+1;}
  const dv=11-sum%11,expected=dv===11?"0":dv===10?"K":String(dv);
  if(expected!==match[2])siiReject("Revise el RUT y su dígito verificador.");
  return body+"-"+expected;
}
export const siiDocumentNames:Record<number,string>={33:"Factura electrónica",34:"Factura exenta",56:"Nota de débito",61:"Nota de crédito"};
export type SiiXmlDocument={document_type:number;folio:string;issued_on:string;due_on:string|null;
  issuer_tax_id:string;issuer_name:string;receiver_tax_id:string;receiver_name:string;
  net_clp:number;exempt_clp:number;vat_clp:number;total_clp:number;totals_match:boolean;
  references:{document_type:string;folio:string}[];payload_sha256:string};
type Node=Record<string,unknown>;
const object=(value:unknown,label:string):Node=>{
  if(!value||typeof value!=="object"||Array.isArray(value))siiReject(`El XML no contiene ${label} de forma única.`);
  return value as Node;
};
const text=(node:Node,key:string,max=200)=>{
  const value=node[key];
  if(typeof value!=="string"||!value.trim()||value.trim().length>max)siiReject(`Revise el campo ${key} del XML.`);
  return value.trim();
};
const folio=(value:string)=>{
  if(!/^[1-9]\d{0,9}$/.test(value))siiReject("El folio del XML debe ser un entero positivo de hasta diez dígitos.");
  return value;
};
const money=(node:Node,key:string,required=false)=>{
  if(node[key]===undefined&&!required)return 0;
  const value=text(node,key,14);
  if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value)))siiReject(`Monto inválido en ${key}.`);
  return Number(value);
};
const date=(value:string)=>{if(!z.iso.date().safeParse(value).success)siiReject("Fecha inválida en el XML.");return value;};

export function decodeSiiXml(bytes:Uint8Array){
  if(bytes.byteLength<1||bytes.byteLength>3*1024*1024)siiReject("Seleccione un XML de hasta 3 MB.");
  const declaration=new TextDecoder("ascii").decode(bytes.slice(0,250));
  const encoding=declaration.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i)?.[1].toLowerCase()??"utf-8";
  if(!["utf-8","utf8","iso-8859-1","windows-1252"].includes(encoding))siiReject("El XML debe usar UTF-8 o ISO-8859-1.");
  try{return new TextDecoder(encoding==="utf8"?"utf-8":encoding,{fatal:true}).decode(bytes);}
  catch{siiReject("La codificación del XML no coincide con su contenido.");}
}

export function parseSiiXml(bytes:Uint8Array):SiiXmlDocument[]{
  const xml=decodeSiiXml(bytes);
  if(/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))siiReject("El XML contiene declaraciones no admitidas.");
  // Bound the structure before parsing; downloaded DTE do not need extreme nesting.
  let depth=0;
  for(const token of xml.matchAll(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>/g)){
    const tag=token[0];if(/^<[!?]/.test(tag))continue;
    if(/^<\//.test(tag))depth--;else if(!/\/>$/.test(tag))depth++;
    if(depth>64)siiReject("El XML contiene demasiados niveles.");
  }
  if(XMLValidator.validate(xml)!==true)siiReject("El archivo no es un XML bien formado.");
  const parser=new XMLParser({ignoreAttributes:true,removeNSPrefix:true,parseTagValue:false,trimValues:true,
    ignoreDeclaration:true,processEntities:true,isArray:tag=>["DTE","Referencia"].includes(tag)});
  let root:Node;
  try{root=object(parser.parse(xml),"un DTE");}catch(e){if(e instanceof SiiDocumentError)throw e;siiReject("No fue posible leer el XML.");}
  let entries:unknown;
  const roots=Object.keys(root).filter(key=>!key.startsWith("?"));
  if(roots.length!==1)siiReject("Seleccione un XML con una única raíz DTE o EnvioDTE.");
  if(root.DTE){
    entries=root.DTE;
    if(!Array.isArray(entries)||entries.length!==1)siiReject("Un DTE individual debe contener un solo documento.");
  }
  else if(root.EnvioDTE){
    const envelope=object(root.EnvioDTE,"un envío DTE"),set=object(envelope.SetDTE,"SetDTE");entries=set.DTE;
  }
  if(!Array.isArray(entries)||entries.length<1||entries.length>100)siiReject("Seleccione un DTE o envío de hasta 100 documentos.");
  const parsed=entries.map(entry=>{
    const document=object(object(entry,"DTE").Documento,"Documento"),header=object(document.Encabezado,"Encabezado");
    const id=object(header.IdDoc,"IdDoc"),issuer=object(header.Emisor,"Emisor"),receiver=object(header.Receptor,"Receptor");
    const totals=object(header.Totales,"Totales"),type=text(id,"TipoDTE",3);
    if(!Object.hasOwn(siiDocumentNames,type))siiReject(`Tipo de documento ${type} no admitido. Use facturas 33/34 o notas 56/61.`);
    const issued=date(text(id,"FchEmis",10)),due=id.FchVenc===undefined?null:date(text(id,"FchVenc",10));
    if(due&&due<issued)siiReject("El vencimiento del XML es anterior a su emisión.");
    const net=money(totals,"MntNeto"),exempt=money(totals,"MntExe"),vat=money(totals,"IVA"),total=money(totals,"MntTotal",true);
    const references=(document.Referencia??[]) as unknown[];
    if(!Array.isArray(references)||references.length>40)siiReject("Referencias inválidas en el XML.");
    return {document_type:Number(type),folio:folio(text(id,"Folio",10)),issued_on:issued,due_on:due,
      issuer_tax_id:siiRut(text(issuer,"RUTEmisor",20)),issuer_name:text(issuer,"RznSoc"),
      receiver_tax_id:siiRut(text(receiver,"RUTRecep",20)),receiver_name:text(receiver,"RznSocRecep"),
      net_clp:net,exempt_clp:exempt,vat_clp:vat,total_clp:total,totals_match:net+exempt+vat===total,
      references:references.map(value=>{const ref=object(value,"Referencia");return {document_type:text(ref,"TpoDocRef",20),folio:text(ref,"FolioRef",80)};}),
      payload_sha256:createHash("sha256").update(JSON.stringify(document)).digest("hex")};
  });
  const keys=parsed.map(d=>`${d.issuer_tax_id}:${d.document_type}:${d.folio}`);
  if(new Set(keys).size!==keys.length)siiReject("El envío contiene folios repetidos. Separe los documentos antes de incorporarlos.");
  return parsed;
}
