import type {AuditRow} from "./audit-report";
import {chileCsvDateTime} from "./chile-csv";
const cell=(value:string)=>{const safe=/^\s*[=+\-@]/u.test(value)||/^[\t\r\n]/.test(value)?`'${value}`:value;return `"${safe.replaceAll('"','""')}"`;};
export const auditCsvHeader="\uFEFF"+["Fecha y hora (Chile)","Persona","Acción","Entidad","ID del registro"].map(cell).join(";")+"\r\n";
export function auditCsvRows(rows:AuditRow[]){return rows.map(row=>[chileCsvDateTime(row.created_at),row.actor_name,row.action,row.entity_type,row.entity_id].map(cell).join(";")).join("\r\n")+(rows.length?"\r\n":"");}
