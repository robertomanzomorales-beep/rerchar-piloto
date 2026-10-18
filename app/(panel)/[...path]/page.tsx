import {notFound} from "next/navigation";

// Keep existing panel URLs while serving them through one Next.js route.
// This keeps the Vercel Hobby deployment within its function limit.
const routes: {pattern:string[];load:()=>Promise<{default:unknown}>}[]=[
  {pattern:["agenda"],load:()=>import("@/lib/panel-pages/agenda/page")},
  {pattern:["auditoria"],load:()=>import("@/lib/panel-pages/auditoria/page")},
  {pattern:["certificados"],load:()=>import("@/lib/panel-pages/certificados/page")},
  {pattern:["clientes"],load:()=>import("@/lib/panel-pages/clientes/page")},
  {pattern:["cobranzas"],load:()=>import("@/lib/panel-pages/cobranzas/page")},
  {pattern:["cobros-extraordinarios"],load:()=>import("@/lib/panel-pages/cobros-extraordinarios/page")},
  {pattern:["combustible"],load:()=>import("@/lib/panel-pages/combustible/page")},
  {pattern:["compras"],load:()=>import("@/lib/panel-pages/compras/page")},
  {pattern:["contenedores"],load:()=>import("@/lib/panel-pages/contenedores/page")},
  {pattern:["control-guias"],load:()=>import("@/lib/panel-pages/control-guias/page")},
  {pattern:["cotizaciones"],load:()=>import("@/lib/panel-pages/cotizaciones/page")},
  {pattern:["cumplimiento"],load:()=>import("@/lib/panel-pages/cumplimiento/page")},
  {pattern:["destinos"],load:()=>import("@/lib/panel-pages/destinos/page")},
  {pattern:["estados-pago"],load:()=>import("@/lib/panel-pages/estados-pago/page")},
  {pattern:["facturas-recibidas"],load:()=>import("@/lib/panel-pages/facturas-recibidas/page")},
  {pattern:["fichas"],load:()=>import("@/lib/panel-pages/fichas/page")},
  {pattern:["finanzas"],load:()=>import("@/lib/panel-pages/finanzas/page")},
  {pattern:["flota"],load:()=>import("@/lib/panel-pages/flota/page")},
  {pattern:["ingresos"],load:()=>import("@/lib/panel-pages/ingresos/page")},
  {pattern:["inventario"],load:()=>import("@/lib/panel-pages/inventario/page")},
  {pattern:["maestros"],load:()=>import("@/lib/panel-pages/maestros/page")},
  {pattern:["mantenimiento"],load:()=>import("@/lib/panel-pages/mantenimiento/page")},
  {pattern:["materiales-stock"],load:()=>import("@/lib/panel-pages/materiales-stock/page")},
  {pattern:["personal"],load:()=>import("@/lib/panel-pages/personal/page")},
  {pattern:["reportes"],load:()=>import("@/lib/panel-pages/reportes/page")},
  {pattern:["seguimiento-guias"],load:()=>import("@/lib/panel-pages/seguimiento-guias/page")},
  {pattern:["solicitudes"],load:()=>import("@/lib/panel-pages/solicitudes/page")},
  {pattern:["transacciones"],load:()=>import("@/lib/panel-pages/transacciones/page")},
  {pattern:["transferencias"],load:()=>import("@/lib/panel-pages/transferencias/page")},
  {pattern:["usuarios"],load:()=>import("@/lib/panel-pages/usuarios/page")},
  {pattern:["control-guias","nueva"],load:()=>import("@/lib/panel-pages/control-guias/nueva/page")},
  {pattern:["cotizaciones","nueva"],load:()=>import("@/lib/panel-pages/cotizaciones/nueva/page")},
  {pattern:["estados-pago","calendario"],load:()=>import("@/lib/panel-pages/estados-pago/calendario/page")},
  {pattern:["estados-pago","nuevo"],load:()=>import("@/lib/panel-pages/estados-pago/nuevo/page")},
  {pattern:["fichas","nueva"],load:()=>import("@/lib/panel-pages/fichas/nueva/page")},
  {pattern:["solicitudes","nueva"],load:()=>import("@/lib/panel-pages/solicitudes/nueva/page")},
  {pattern:["clientes",":id"],load:()=>import("@/lib/panel-pages/clientes/[id]/page")},
  {pattern:["compras",":id"],load:()=>import("@/lib/panel-pages/compras/[id]/page")},
  {pattern:["control-guias",":id"],load:()=>import("@/lib/panel-pages/control-guias/[id]/page")},
  {pattern:["cotizaciones",":id"],load:()=>import("@/lib/panel-pages/cotizaciones/[id]/page")},
  {pattern:["cumplimiento",":id"],load:()=>import("@/lib/panel-pages/cumplimiento/[id]/page")},
  {pattern:["empresa",":empresa"],load:()=>import("@/lib/panel-pages/empresa/[empresa]/page")},
  {pattern:["estados-pago",":id"],load:()=>import("@/lib/panel-pages/estados-pago/[id]/page")},
  {pattern:["facturas-recibidas",":id"],load:()=>import("@/lib/panel-pages/facturas-recibidas/[id]/page")},
  {pattern:["fichas",":id"],load:()=>import("@/lib/panel-pages/fichas/[id]/page")},
  {pattern:["finanzas",":id"],load:()=>import("@/lib/panel-pages/finanzas/[id]/page")},
  {pattern:["flota",":id"],load:()=>import("@/lib/panel-pages/flota/[id]/page")},
  {pattern:["ingresos",":id"],load:()=>import("@/lib/panel-pages/ingresos/[id]/page")},
  {pattern:["mantenimiento",":id"],load:()=>import("@/lib/panel-pages/mantenimiento/[id]/page")},
  {pattern:["solicitudes",":id"],load:()=>import("@/lib/panel-pages/solicitudes/[id]/page")},
  {pattern:["clientes",":id","resumen"],load:()=>import("@/lib/panel-pages/clientes/[id]/resumen/page")},
  {pattern:["compras",":id","orden"],load:()=>import("@/lib/panel-pages/compras/[id]/orden/page")},
  {pattern:["estados-pago","calendario",":id"],load:()=>import("@/lib/panel-pages/estados-pago/calendario/[id]/page")},
  {pattern:["ingresos",":id","hoja"],load:()=>import("@/lib/panel-pages/ingresos/[id]/hoja/page")},
  {pattern:["solicitudes",":id","guias"],load:()=>import("@/lib/panel-pages/solicitudes/[id]/guias/page")},
  {pattern:["solicitudes",":id","orden"],load:()=>import("@/lib/panel-pages/solicitudes/[id]/orden/page")},
  {pattern:["solicitudes",":id","seguimiento"],load:()=>import("@/lib/panel-pages/solicitudes/[id]/seguimiento/page")},
];

export default async function PanelRoute({params,searchParams}:{params:Promise<{path:string[]}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const {path}=await params;
  const route=routes.find(({pattern})=>pattern.length===path.length&&
    pattern.every((segment,index)=>segment.startsWith(":")||segment===path[index]));
  if(!route)notFound();
  const named=Object.fromEntries(route.pattern.flatMap((segment,index)=>segment.startsWith(":")?[[segment.slice(1),path[index]]]:[]));
  const View=(await route.load()).default as (props:{params:Promise<Record<string,string>>;searchParams:Promise<Record<string,string|string[]|undefined>>})=>React.ReactNode|Promise<React.ReactNode>;
  return View({params:Promise.resolve(named),searchParams});
}
