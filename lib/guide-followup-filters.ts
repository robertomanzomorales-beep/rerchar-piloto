import {recordPage} from "./record-pagination";

export const guideFilters={todas:"Todas",mias:"Mis pendientes",mias_atrasadas:"Atrasadas a mi cargo",
  atrasadas:"Atrasadas",proximas:"Vencen en 7 días",sin_plazo:"Sin plazo",pendientes:"Por recibir"} as const;
export type GuideFilter=keyof typeof guideFilters;
export function parseGuideFilter(value:unknown):GuideFilter{return typeof value==="string"&&Object.hasOwn(guideFilters,value)?value as GuideFilter:"todas";}
export function guideFollowupHref(filter:GuideFilter="todas",page:unknown=1){
  const query=new URLSearchParams({empresa:"rerchar",estado:parseGuideFilter(filter)}),current=recordPage(page);
  if(current>1)query.set("pagina",String(current));
  return `/seguimiento-guias?${query}`;
}
