import {db} from "./db";

type GuideStats={total:string;pending:string;stock_pending:string};
type MaterialStats={guides:GuideStats;materials:string;stock_ready:boolean};
const empty:GuideStats={total:"0",pending:"0",stock_pending:"0"};

function missingTable(error:unknown){
  return typeof error==="object"&&error!==null&&"code" in error&&error.code==="42P01";
}

export async function rercharReceiptGuideDashboard(){
  try{
    const [row]=await db.query<{pending:string}>(`SELECT count(*)::text AS pending FROM material_receipts
      WHERE valued_guide_requested_on IS NOT NULL AND valued_guide IS NULL`);
    return {pending:row?.pending??"0",ready:true};
  }catch(error){
    if(typeof error==="object"&&error!==null&&"code" in error&&["42P01","42703"].includes(String(error.code)))
      return {pending:"0",ready:false};
    throw error;
  }
}

// El panel sigue disponible cuando un despliegue de código antecede a la migración.
// Otros errores de base de datos se propagan para no presentar cifras falsas.
export async function rercharMaterialDashboard():Promise<MaterialStats>{
  try{
    const [guides,balances]=await Promise.all([
      db.query<GuideStats>(`SELECT count(*)::text AS total,
        count(*) FILTER (WHERE movement_type='venta' AND EXISTS (
          SELECT 1 FROM material_guide_items i WHERE i.guide_id=g.id AND
            (i.arrival_kg IS NULL OR i.invoice_number IS NULL OR
              (i.invoice_number IS NOT NULL AND i.invoice_status IS DISTINCT FROM 'pagada'))))::text AS pending,
        count(*) FILTER (WHERE movement_type='venta' AND EXISTS (
          SELECT 1 FROM material_guide_items i WHERE i.guide_id=g.id AND i.stock_kg>0 AND
            COALESCE((SELECT -sum(m.delta_kg) FROM material_stock_movements m WHERE m.guide_item_id=i.id),0)<i.stock_kg))::text AS stock_pending
        FROM material_guides g WHERE operating_company='rerchar'`),
      db.query<{materials:string}>("SELECT count(*)::text AS materials FROM material_stock_balances WHERE quantity_kg>0"),
    ]);
    return {guides:guides[0]??empty,materials:balances[0]?.materials??"0",stock_ready:true};
  }catch(error){
    if(!missingTable(error))throw error;
    try{
      const [guides]=await db.query<Omit<GuideStats,"stock_pending">>(`SELECT count(*)::text AS total,
        count(*) FILTER (WHERE movement_type='venta' AND EXISTS (
          SELECT 1 FROM material_guide_items i WHERE i.guide_id=g.id AND
            (i.arrival_kg IS NULL OR i.invoice_number IS NULL OR
              (i.invoice_number IS NOT NULL AND i.invoice_status IS DISTINCT FROM 'pagada'))))::text AS pending
        FROM material_guides g WHERE operating_company='rerchar'`);
      return {guides:{...empty,...guides},materials:"0",stock_ready:false};
    }catch(olderError){
      if(!missingTable(olderError))throw olderError;
      return {guides:empty,materials:"0",stock_ready:false};
    }
  }
}

export async function eyjPaymentDashboard(){
  try{
    const [row]=await db.query<{total:string;pending:string}>(`SELECT count(*)::text AS total,
      count(*) FILTER (WHERE status IN ('borrador','observado'))::text AS pending
      FROM payment_statements WHERE issuer='e_y_j'`);
    return {total:row?.total??"0",pending:row?.pending??"0",ready:true};
  }catch(error){
    if(!missingTable(error))throw error;
    return {total:"0",pending:"0",ready:false};
  }
}
