import {db} from "./db";

export type ModuleKey="guias"|"ingresos"|"stock"|"edp"|"edp_calendar";

// Sólo se consultan nombres fijos del esquema. Detectar la tabla sin sus columnas
// evita mostrar un módulo parcialmente migrado como si estuviera operativo.
const requirements:Record<ModuleKey,{tables:string[];columns:[string,string][]}>={
  guias:{tables:["material_guides","material_guide_items","material_catalog","material_stock_movements"],
    columns:[["material_guide_items","material_id"],["material_guides","movement_detail"]]},
  ingresos:{tables:["material_receipts","material_catalog","material_stock_balances"],
    columns:[["material_receipts","material_id"],["material_receipts","receipt_mode"]]},
  stock:{tables:["material_catalog","material_stock_balances","material_stock_movements"],columns:[]},
  edp:{tables:["payment_statements","payment_statement_operations","payment_statement_charges"],
    columns:[["payment_statements","issuer_contact"],["payment_statements","contract_manager"]]},
  edp_calendar:{tables:["payment_statement_cycles","payment_statements","service_valuations"],
    columns:[["payment_statement_cycles","contact_email"],["payment_statement_cycles","statement_id"]]},
};

export async function moduleReady(key:ModuleKey){
  const {tables,columns}=requirements[key];
  const checks=[...tables.map(table=>`to_regclass('${table}') IS NOT NULL`),
    ...columns.map(([table,column])=>`EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='${table}' AND column_name='${column}')`)];
  const [result]=await db.query<{ready:boolean}>(`SELECT (${checks.join(" AND ")}) AS ready`);
  return result?.ready===true;
}
