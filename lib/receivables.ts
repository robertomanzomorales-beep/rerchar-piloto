import type {Actor} from "./auth";
import {db} from "./db";
import type {Company} from "./companies";

export class ReceivableError extends Error {}
function admin(actor:Actor){if(actor.role!=="admin")throw new ReceivableError("Acceso administrativo requerido.");}
function validCompany(company:Company){if(!["rerchar","e_y_j"].includes(company))throw new ReceivableError("Empresa inválida.");}
export const todayChile=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export type Receivable={id:string;source:"servicio"|"extraordinario";service_id:string;client_name:string;invoice_number:string;
  issued_on:Date|string;due_on:Date|string;total_clp:string;paid_clp:string;extra_count:string};
export type ReceivableOverview={total:string;overdue:string;upcoming:string;outstanding:string;legacy:string};

const base=`SELECT f.id,'servicio'::text AS source,v.service_id,c.name AS client_name,f.invoice_number,
  f.issued_on,f.due_on,f.total_clp,COALESCE((SELECT sum(p.amount_clp) FROM invoice_payments p WHERE p.invoice_id=f.id),0)::text AS paid_clp,
  (SELECT count(*)::text FROM service_extra_charges x WHERE x.linked_service_invoice_id=f.id) AS extra_count
  FROM service_invoices f JOIN service_valuations v ON v.id=f.valuation_id JOIN service_requests s ON s.id=v.service_id
  JOIN clients c ON c.id=s.client_id WHERE s.operating_company=$1 AND s.deleted_at IS NULL AND f.status='emitida' AND f.total_verified=true`;
const extraordinary=`SELECT i.id,'extraordinario'::text AS source,
  (SELECT x.service_id FROM service_extra_charges x WHERE x.receivable_invoice_id=i.id ORDER BY x.created_at LIMIT 1) AS service_id,
  c.name AS client_name,i.invoice_number,i.issued_on,i.due_on,i.total_clp,
  COALESCE((SELECT sum(p.amount_clp) FROM extra_receivable_payments p WHERE p.invoice_id=i.id),0)::text AS paid_clp,
  (SELECT count(*)::text FROM service_extra_charges x WHERE x.receivable_invoice_id=i.id) AS extra_count
  FROM extra_receivable_invoices i JOIN clients c ON c.id=i.client_id WHERE i.issuer=$1 AND i.status='emitida'`;

export async function listReceivables(actor:Actor,company:Company){
  admin(actor);validCompany(company);
  return db.query<Receivable>(`SELECT * FROM (${base} UNION ALL ${extraordinary}) r
    ORDER BY (r.total_clp::numeric-r.paid_clp::numeric)<=0,r.due_on,r.invoice_number LIMIT 500`,[company]);
}

export async function listUnverifiedServiceInvoices(actor:Actor,company:Company){
  admin(actor);validCompany(company);
  return db.query<{service_id:string;invoice_number:string;client_name:string}>(`SELECT v.service_id,f.invoice_number,c.name AS client_name
    FROM service_invoices f JOIN service_valuations v ON v.id=f.valuation_id
    JOIN service_requests s ON s.id=v.service_id JOIN clients c ON c.id=s.client_id
    WHERE s.operating_company=$1 AND s.deleted_at IS NULL AND f.status='emitida' AND f.total_verified=false
    ORDER BY f.issued_on DESC LIMIT 100`,[company]);
}

export async function receivablesOverview(actor:Actor,company:Company,on=todayChile()){
  admin(actor);validCompany(company);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(on))throw new ReceivableError("Fecha inválida.");
  const [row]=await db.query<ReceivableOverview>(`WITH invoices AS (${base} UNION ALL ${extraordinary}), balances AS (
    SELECT GREATEST(total_clp::numeric-paid_clp::numeric,0) AS balance,due_on FROM invoices)
    SELECT count(*)::text AS total,
      count(*) FILTER (WHERE balance>0 AND due_on<$2::date)::text AS overdue,
      count(*) FILTER (WHERE balance>0 AND due_on>=$2::date AND due_on<=$2::date+7)::text AS upcoming,
      COALESCE(sum(balance),0)::text AS outstanding,
      ((SELECT count(*) FROM service_extra_charges x JOIN service_requests s ON s.id=x.service_id
        WHERE s.operating_company=$1 AND s.deleted_at IS NULL AND x.status='facturado'
          AND x.receivable_invoice_id IS NULL AND x.linked_service_invoice_id IS NULL)
      +(SELECT count(*) FROM service_invoices f JOIN service_valuations v ON v.id=f.valuation_id
        JOIN service_requests s ON s.id=v.service_id WHERE s.operating_company=$1 AND s.deleted_at IS NULL
          AND f.status='emitida' AND f.total_verified=false))::text AS legacy
    FROM balances`,[company,on]);
  return row;
}
