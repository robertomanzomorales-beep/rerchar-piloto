import type {Company} from "./companies";

export function clientDashboardGroups(company:Company){
  return [
    {title:"Mis servicios",detail:"Solicitudes, programación y seguimiento de su empresa",links:[
      {label:"Mis cotizaciones",href:`/cotizaciones?empresa=${company}`},
      {label:"Mis solicitudes",href:`/solicitudes?empresa=${company}`},
      {label:"Nueva solicitud",href:`/solicitudes/nueva?empresa=${company}`},
      {label:"Agenda de servicios",href:`/agenda?empresa=${company}`},
    ]},
    {title:"Mis documentos",detail:"Carpeta, respaldos y reportes de sus servicios",links:[
      {label:"Mi carpeta documental",href:`/clientes?empresa=${company}`},
      ...(company==="rerchar"?[{label:"Certificados vigentes",href:"/certificados"},{label:"Ingresos de material",href:"/ingresos"}]:[]),
      {label:"Reportes de mis servicios",href:`/reportes?company=${company}`},
    ]},
  ];
}
