import type {Actor} from "./auth";
import {db} from "./db";
import {moduleReady} from "./schema-readiness";

export type EdpServiceInvoice={service_id:string;statement_id:string;statement_number:string;invoice_number:string|null};
export type ClientEdpInvoice={id:string;invoice_number:string;issued_on:Date|string;statement_numbers:string[]};

async function ready(){return await moduleReady("edp_service_import")&&await moduleReady("edp_billing");}

// Un EDP puede agrupar varios servicios. Devolvemos el folio, nunca su importe por servicio.
export async function listEdpServiceInvoices(serviceIds:string[]):Promise<EdpServiceInvoice[]>{
  if(!serviceIds.length||!await ready())return [];
  return db.query<EdpServiceInvoice>(`SELECT DISTINCT o.service_id,p.id AS statement_id,
    p.number AS statement_number,COALESCE(i.invoice_number,f.invoice_number) AS invoice_number
    FROM payment_statement_operations o JOIN payment_statements p ON p.id=o.statement_id
    JOIN service_requests s ON s.id=o.service_id AND s.client_id=p.client_id AND s.operating_company=p.issuer AND s.deleted_at IS NULL
    LEFT JOIN extra_receivable_invoices i ON i.id=p.receivable_invoice_id AND i.status='emitida'
    LEFT JOIN service_invoices f ON f.id=p.service_invoice_id AND f.status='emitida'
    WHERE o.service_id=ANY($1::uuid[])
    ORDER BY o.service_id,p.id DESC`,[serviceIds]);
}

export async function listClientEdpInvoices(actor:Actor,clientId:string):Promise<ClientEdpInvoice[]>{
  if(actor.role==="conductor"||actor.role==="cliente"&&actor.client_id!==clientId||!await ready())return [];
  return db.query<ClientEdpInvoice>(`SELECT i.id,i.invoice_number,i.issued_on,
    array_agg(DISTINCT p.number) AS statement_numbers
    FROM payment_statements p JOIN extra_receivable_invoices i ON i.id=p.receivable_invoice_id AND i.status='emitida'
    WHERE p.client_id=$1 AND i.client_id=$1 AND p.issuer='e_y_j'
      AND ($2::text<>'cliente' OR p.status IN ('enviado','aprobado'))
    GROUP BY i.id ORDER BY i.issued_on DESC,i.id DESC`,[clientId,actor.role]);
}
