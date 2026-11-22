import {recordPage} from "./record-pagination";

export const materialStockFields=["material_id","kind","quantity_kg","occurred_on","reference","reason"] as const;
type Field=(typeof materialStockFields)[number];
export type MaterialStockValues=Partial<Record<Field,string>>;
export type MaterialStockFormState={error:string;values:MaterialStockValues};
export type MaterialStockContext={material?:string;pagina?:string};
const limits:Record<Field,number>={material_id:36,kind:14,quantity_kg:24,occurred_on:10,reference:80,reason:500};
export const isStockMaterialId=(id?:string)=>!!id&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id);
export function materialStockDraft(form:FormData):MaterialStockValues{
  return Object.fromEntries(materialStockFields.map(key=>[key,typeof form.get(key)==="string"?String(form.get(key)).replace(/\r\n?/g,"\n").slice(0,limits[key]):""]));
}
export function materialStockContext(input:MaterialStockContext):MaterialStockContext{
  return {...(isStockMaterialId(input.material)?{material:input.material}:{}),pagina:String(recordPage(input.pagina))};
}
export function materialStockAdjustmentHref(input:MaterialStockContext){
  return `/materiales-stock?${new URLSearchParams({...materialStockContext(input),formulario:"ajuste"})}#ajuste-material`;
}
export function materialStockSavedHref(materialId:string,movementId:string){
  return `/materiales-stock?${new URLSearchParams({material:materialId,pagina:"1",ok:movementId})}#movimientos-material`;
}
