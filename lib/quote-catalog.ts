// Catálogo comercial de Carol, observaciones 9 y 13. Las claves se guardan en
// la base de datos; los rótulos conservan la terminología de la planilla.
export const quotePrincipals = [
  {value:"arriendo",label:"Arriendo",segments:[
    {value:"arriendo_equipo",label:"Arriendo de Equipo"},
    {value:"excavadora_garra",label:"Excavadora Garra"},
    {value:"arriendo_tolva",label:"Arriendo de Tolva"},
    {value:"camion_pluma",label:"Camión Pluma"},
  ]},
  {value:"retiro",label:"Retiro",segments:[
    {value:"retiro_chatarra",label:"Retiro de Chatarra"},
    {value:"retiro_domiciliario",label:"Retiro de Domiciliario"},
    {value:"retiro_reciclable",label:"Retiro de Reciclable"},
    {value:"retiro_traslado_tolva",label:"Retiro/Traslado de Tolva"},
  ]},
  {value:"transporte",label:"Transporte",segments:[
    {value:"transporte_cama_baja",label:"Transporte de Cama Baja"},
    {value:"transporte_batea",label:"Transporte de Batea"},
    {value:"transporte_respel",label:"Transporte de RESPEL"},
    {value:"transporte_en_batea",label:"Transporte en Batea"},
    {value:"transporte_en_cama_baja",label:"Transporte en Cama Baja"},
    {value:"rampla_chatarrera",label:"Rampla Chatarrera"},
    {value:"rampla_plana",label:"Rampla Plana"},
    {value:"transporte_maquinaria",label:"Transporte de Maquinaria"},
  ]},
  {value:"recepcion",label:"Recepción",segments:[
    {value:"recepcion_chatarra",label:"Recepción de Chatarra"},
  ]},
  {value:"compra",label:"Compra",segments:[
    {value:"compra_metal",label:"Compra de Metal"},
  ]},
  {value:"instalacion",label:"Instalación",segments:[
    {value:"instalacion_desmovilizacion_tolva",label:"Instalación o Desmovilización de Tolva"},
  ]},
] as const;

export const quoteUnits=[
  {value:"viaje",label:"viaje"},{value:"día",label:"día"},{value:"mes",label:"mes"},
  {value:"hora",label:"hora"},{value:"tonelada",label:"tonelada"},{value:"m³",label:"m³"},
  {value:"servicio",label:"servicio"},{value:"kg",label:"kg"},
] as const;

export function validQuoteSegment(principal:string,segment:string){
  return quotePrincipals.some(group=>group.value===principal&&group.segments.some(item=>item.value===segment));
}
export function quotePrincipalLabel(principal:string|null){
  return quotePrincipals.find(group=>group.value===principal)?.label??"Sin clasificar";
}
export function quoteSegmentLabel(segment:string|null){
  for(const group of quotePrincipals){const item=group.segments.find(option=>option.value===segment);if(item)return item.label;}
  return segment??"Sin clasificar";
}
