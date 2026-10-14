import type {Company} from "./companies";
import type {Receivable} from "./receivables";

export type ReceivableFilter="todas"|"vencidas"|"proximas"|"pendientes"|"pagadas";
export function parseReceivableFilter(value:string|null|undefined):ReceivableFilter{
  return value==="todas"||value==="vencidas"||value==="proximas"||value==="pagadas"?value:"pendientes";
}

const day=(value:Date|string)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
const plusDays=(date:string,days:number)=>{
  const value=new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate()+days);
  return value.toISOString().slice(0,10);
};
const balance=(invoice:Receivable)=>Number(invoice.total_clp)-Number(invoice.paid_clp);

export function filterReceivables(rows:Receivable[],filter:ReceivableFilter,today:string){
  const seven=plusDays(today,7);
  return rows.filter(invoice=>{
    const amount=balance(invoice),due=day(invoice.due_on);
    return filter==="todas"||filter==="vencidas"&&amount>0&&due<today||
      filter==="proximas"&&amount>0&&due>=today&&due<=seven||
      filter==="pagadas"&&amount<=0||filter==="pendientes"&&amount>0;
  });
}

function csv(value:string|number){
  const raw=String(value);
  const safe=/^[=+\-@\t\r\n]/.test(raw)?`'${raw}`:raw;
  return `"${safe.replaceAll('"','""')}"`;
}

export function receivablesCsv(rows:Receivable[],company:Company,today:string){
  const seven=plusDays(today,7);
  const header=["Empresa","Folio factura","Cliente","Origen","Emisión","Vencimiento","Días vencidos","Estado","Total CLP","Abonado CLP","Saldo CLP","EDP vinculados","Cargos vinculados","Guías vinculadas"];
  const lines=[header.map(csv).join(";")];
  for(const invoice of rows){
    const due=day(invoice.due_on),amount=balance(invoice);
    const daysOverdue=amount>0&&due<today?Math.round((Date.parse(`${today}T12:00:00Z`)-Date.parse(`${due}T12:00:00Z`))/86400000):0;
    const status=amount<=0?"Pagada":due<today?"Vencida":due<=seven?"Vence en 7 días":"Pendiente";
    const origin=invoice.source==="servicio"?"Servicio":invoice.source==="edp"?"Estado de pago":invoice.source==="material"?"Venta de material":"Cargo extraordinario";
    const money=(value:number|string)=>Number(value).toFixed(2).replace(".",",");
    lines.push([company==="rerchar"?"RERCHAR":"E y J",invoice.invoice_number,invoice.client_name,origin,
      day(invoice.issued_on),due,daysOverdue,status,money(invoice.total_clp),money(invoice.paid_clp),money(amount),
      invoice.edp_count,invoice.extra_count,invoice.guide_count].map(csv).join(";"));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
