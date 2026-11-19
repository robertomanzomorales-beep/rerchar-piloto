import {isFinanceId} from "./finance-catalog-state";
import {serviceDayContext,type ServiceDayContext} from "./service-day-state";
export const evidenceLabels={evidencia:"Evidencia general",guia_traslado:"Guía de Traslado",guia_valorizada:"Guía valorizada",hoja_servicio:"Hoja de Servicio",ticket_pesaje:"Ticket de pesaje",foto_material:"Foto del material",foto_area:"Foto del área de trabajo",checklist:"Checklist firmado o respaldo",factura:"Factura adjunta",certificado:"Certificado externo",resumen_retiros:"Resumen de retiros",otro:"Otro documento"} as const;
export type EvidenceKind=keyof typeof evidenceLabels;
export const operationalEvidenceKinds:EvidenceKind[]=["evidencia","guia_traslado","hoja_servicio","ticket_pesaje","foto_material","foto_area","checklist"];
export const evidenceSlots=["general","administrativo","guia_traslado","ticket_pesaje","hoja_servicio","foto_material","foto_area","checklist"] as const;
export type EvidenceSlot=(typeof evidenceSlots)[number];
export const isEvidenceSlot=(value:unknown):value is EvidenceSlot=>typeof value==="string"&&(evidenceSlots as readonly string[]).includes(value);
export type EvidenceFormState={error:string;values:{description?:string;document_kind?:string;submission_key?:string};filename?:string};
export type EvidenceContext=ServiceDayContext;
export type EvidenceQuery=EvidenceContext&{documento_form?:string;archivo?:string;formulario?:string;formulario_cargo?:string};
export function evidenceDraft(form:FormData):EvidenceFormState['values']{return Object.fromEntries(Object.entries({description:500,document_kind:40,submission_key:36}).map(([key,max])=>[key,typeof form.get(key)==="string"?String(form.get(key)).replace(/\r\n?/g,"\n").slice(0,max):""]));}
export function evidenceContextFromForm(form:FormData){return serviceDayContext(Object.fromEntries(["pagina_partes","pagina_cargos","pagina_documentos","pagina_historial","parte","nuevo_parte"].map(key=>[key,String(form.get(key)??"")])));}
export const evidenceAnchor=(id?:string)=>isFinanceId(id)?`archivo-${id}`:"documentacion";
export function evidenceHref(id:string,context:EvidenceContext={},anchor="documentacion",flags:{ok?:string;archivo?:string;documento_form?:string}={}){
  if(!isFinanceId(id))return "/solicitudes";const query=new URLSearchParams(serviceDayContext(context) as Record<string,string>);if(flags.ok)query.set("ok",flags.ok);if(isFinanceId(flags.archivo))query.set("archivo",flags.archivo!);if(isEvidenceSlot(flags.documento_form))query.set("documento_form",flags.documento_form);return `/solicitudes/${id}${query.size?"?"+query:""}${anchor?"#"+anchor:""}`;
}
