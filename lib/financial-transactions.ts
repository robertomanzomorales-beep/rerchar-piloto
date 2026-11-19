import type {Actor} from "./auth";
import type {Company} from "./companies";
import {db} from "./db";
import {moduleReady} from "./schema-readiness";
import {recordWindow} from "./record-pagination";

export type FinancialTransaction={id:string;company:Company;direction:"entrada"|"salida";source:"proveedor"|"servicio"|"cobranza";
  invoice_id:string;service_id:string|null;invoice_number:string;counterparty:string;amount_clp:string;paid_on:Date|string;reference:string;
  recorded_by:string;recorded_name:string;verification:"verificada"|"registrada";transfer_id:string|null;created_at:Date|string};

async function transactionQuery(actor:Actor,company:Company|"",direction:"entrada"|"salida"|""){
  if(actor.role!=="admin")throw new Error("Acceso administrativo requerido.");
  if(company&&company!=="rerchar"&&company!=="e_y_j")throw new Error("Empresa inválida.");
  if(direction&&direction!=="entrada"&&direction!=="salida")throw new Error("Tipo inválido.");
  const ready=await moduleReady("supplier_transfers");
  return `SELECT * FROM (
    SELECT p.id,i.issuer AS company,'salida'::text AS direction,'proveedor'::text AS source,
      i.id AS invoice_id,NULL::uuid AS service_id,i.invoice_number,i.supplier_name AS counterparty,p.amount_clp,p.paid_on,p.reference,
      p.recorded_by,u.name AS recorded_name,${ready?"CASE WHEN t.id IS NULL THEN 'registrada' ELSE 'verificada' END":"'registrada'"}::text AS verification,
      ${ready?"t.id":"NULL::uuid"} AS transfer_id,p.created_at
      FROM supplier_invoice_payments p JOIN supplier_invoices i ON i.id=p.invoice_id JOIN users u ON u.id=p.recorded_by
      ${ready?"LEFT JOIN supplier_transfer_requests t ON t.payment_id=p.id AND t.status='verificada'":""}
    UNION ALL
    SELECT p.id,s.operating_company AS company,'entrada'::text AS direction,'servicio'::text AS source,
      i.id AS invoice_id,v.service_id,i.invoice_number,c.name AS counterparty,p.amount_clp,p.paid_on,p.reference,
      p.created_by,u.name AS recorded_name,'registrada'::text AS verification,NULL::uuid AS transfer_id,p.created_at
      FROM invoice_payments p JOIN service_invoices i ON i.id=p.invoice_id JOIN service_valuations v ON v.id=i.valuation_id
      JOIN service_requests s ON s.id=v.service_id JOIN clients c ON c.id=s.client_id JOIN users u ON u.id=p.created_by
      WHERE s.operating_company IS NOT NULL
    UNION ALL
    SELECT p.id,i.issuer AS company,'entrada'::text AS direction,'cobranza'::text AS source,
      i.id AS invoice_id,NULL::uuid AS service_id,i.invoice_number,c.name AS counterparty,p.amount_clp,p.paid_on,p.reference,
      p.created_by,u.name AS recorded_name,'registrada'::text AS verification,NULL::uuid AS transfer_id,p.created_at
      FROM extra_receivable_payments p JOIN extra_receivable_invoices i ON i.id=p.invoice_id
      JOIN clients c ON c.id=i.client_id JOIN users u ON u.id=p.created_by
  ) records WHERE ($1::text='' OR company=$1) AND ($2::text='' OR direction=$2)
  `;
}

const transactionOrder="ORDER BY paid_on DESC,created_at DESC,source,id";
export async function listFinancialTransactions(actor:Actor,company:Company|""="",direction:"entrada"|"salida"|""=""){
  const query=await transactionQuery(actor,company,direction);
  return db.query<FinancialTransaction>(`${query} ${transactionOrder}`,[company,direction]);
}
export async function listFinancialTransactionsPage(actor:Actor,company:Company|""="",direction:"entrada"|"salida"|""="",limit=100,offset=0){
  const query=await transactionQuery(actor,company,direction),window=recordWindow(limit,offset);
  const [rows,totals]=await Promise.all([
    db.query<FinancialTransaction>(`${query} ${transactionOrder} LIMIT $3 OFFSET $4`,[company,direction,window.limit,window.offset]),
    db.query<{total:string;incoming:string;outgoing:string}>(`SELECT count(*)::text AS total,
      COALESCE(sum(amount_clp) FILTER(WHERE direction='entrada'),0)::text AS incoming,
      COALESCE(sum(amount_clp) FILTER(WHERE direction='salida'),0)::text AS outgoing FROM (${query}) filtered`,[company,direction]),
  ]);
  return {items:rows,total:Number(totals[0]?.total??0),incoming:totals[0]?.incoming??"0",outgoing:totals[0]?.outgoing??"0"};
}
