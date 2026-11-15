// La OC adjunta debe ser posterior al último registro o corrección de sus datos.
// Los documentos históricos se conservan para auditoría, pero no habilitan ruta.
export const currentOrderDocumentSql=`d.uploaded_at >= COALESCE((
  SELECT max(a.created_at) FROM audit_events a
  WHERE a.entity_type='client_quote' AND a.entity_id=q.id AND a.action='client_order'
),'-infinity'::timestamptz)`;

export const quoteOrderReadySql=`(q.client_order_exception IS NOT NULL OR
  (q.client_order_reference IS NOT NULL AND q.client_order_on IS NOT NULL AND EXISTS (
    SELECT 1 FROM client_quote_documents d WHERE d.quote_id=q.id AND d.kind='orden_compra'
      AND ${currentOrderDocumentSql})))`;

export const quoteReadyForSchedulingSql=`(q.commercial_kind='compra_material' OR ${quoteOrderReadySql})`;
