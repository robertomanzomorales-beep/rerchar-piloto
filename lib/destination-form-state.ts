export type DestinationFormKind="create"|"update";
export type DestinationContext={empresa?:"rerchar"|"e_y_j"};
export type DestinationFormState={error:string;values:Record<string,string>;categories:string[];fileName:string};
export const emptyDestinationState:DestinationFormState={error:"",values:{},categories:[],fileName:""};
const limits={id:36,name:180,facility_type:30,address:250,commune:100,latitude:32,longitude:32,location_url:500,
  status:20,authorization_reference:180,authorization_valid_until:10,disposal_unit:20,disposal_price_clp:32} as const;
const baseFields=["name","facility_type","address","commune","latitude","longitude","location_url"] as const;
export const destinationId=(value:unknown)=>typeof value==="string"&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)?value.toLowerCase():"";
export function destinationContext(input:{empresa?:unknown}):DestinationContext{return input.empresa==="rerchar"||input.empresa==="e_y_j"?{empresa:input.empresa}:{};}
export function destinationDraft(kind:DestinationFormKind,form:FormData,error:string):DestinationFormState{
  const fields=kind==="create"?baseFields:Object.keys(limits) as (keyof typeof limits)[];
  const file=form.get("authorization_document");
  return {error,values:Object.fromEntries(fields.map(key=>[key,typeof form.get(key)==="string"?String(form.get(key)).slice(0,limits[key]):""])),
    categories:kind==="update"?form.getAll("accepted_categories").filter((value):value is string=>typeof value==="string").slice(0,6).map(value=>value.slice(0,40)):[],
    fileName:file instanceof File&&file.size?file.name.replace(/[\r\n\\/]/g,"_").slice(0,160):""};
}
export function destinationHref(context:DestinationContext,kind?:DestinationFormKind,id="",saved=""){
  const query=new URLSearchParams(destinationContext(context));
  if(kind)query.set("formulario",kind);
  const selected=destinationId(id),stamp=destinationId(saved);
  if(selected)query.set("destino",selected);
  if(stamp){query.set("ok","1");query.set("guardado",stamp);}
  return `/destinos${query.size?`?${query}`:""}${selected?`#destino-${selected}`:kind==="create"?"#crear-destino":""}`;
}
