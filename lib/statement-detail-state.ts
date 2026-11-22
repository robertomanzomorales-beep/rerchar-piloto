export const statementDetailFields={
  operation:["line_id","line_number","description","operation_on","weight_kg","weighing_ticket","service_sheet","guide_number","sidrep","rental_from","rental_to","is_disposal"],
  service:["service_id","line_number","is_disposal"],
  charge:["line_id","line_number","description","pricing","unit_value","quantity","uf_value_clp","uf_on"],
  order:["client_order_reference","client_order_on","client_order_exception"],
  invoice:["invoice_number","issued_on","due_on","total_clp","variance_note"],
  send:["recipient"],manual:["channel","recipient","reference"],resolve:["outcome","reference"],
} as const;
export type StatementDetailKind=keyof typeof statementDetailFields;
type Field=(typeof statementDetailFields)[StatementDetailKind][number];
export type StatementDetailValues=Partial<Record<Field,string>>;
export type StatementDetailState={error:string;values:StatementDetailValues};
const limits:Record<Field,number>={line_id:36,line_number:6,description:500,operation_on:10,weight_kg:24,weighing_ticket:80,service_sheet:80,guide_number:80,sidrep:80,rental_from:10,rental_to:10,is_disposal:1,service_id:36,pricing:20,unit_value:24,quantity:24,uf_value_clp:24,uf_on:10,client_order_reference:80,client_order_on:10,client_order_exception:500,invoice_number:80,issued_on:10,due_on:10,total_clp:24,variance_note:500,recipient:254,channel:20,reference:500,outcome:20};
export function statementDetailDraft(kind:StatementDetailKind,form:FormData):StatementDetailValues{
  return Object.fromEntries(statementDetailFields[kind].map(key=>[key,typeof form.get(key)==="string"?String(form.get(key)).replace(/\r\n?/g,"\n").slice(0,limits[key]):""]));
}
export const statementDetailAnchors:Record<StatementDetailKind,string>={operation:"operaciones-edp",service:"servicios-edp",charge:"cobros-edp",order:"oc-edp",invoice:"factura-edp",send:"control-edp",manual:"control-edp",resolve:"control-edp"};
export function statementDetailHref(id:string,kind:StatementDetailKind,lineId="",editing=false,ok="1"){
  const query=new URLSearchParams(editing?{formulario_edp:kind}:{origen_edp:kind,ok});
  if(lineId)query.set("item",lineId);
  const anchor=lineId&&(kind==="operation"||kind==="service"||kind==="charge")?`${kind==="charge"?"cobro-edp":"item-operativo"}-${lineId}`:statementDetailAnchors[kind];
  return `/estados-pago/${encodeURIComponent(id)}?${query}#${anchor}`;
}
export function nextStatementLine(rows:{line_number:number}[],maximum:number){
  const used=new Set(rows.map(row=>row.line_number));
  for(let line=1;line<=maximum;line++)if(!used.has(line))return line;
  return null;
}
