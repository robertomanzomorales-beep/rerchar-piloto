-- Recepción de material: solicitud y recepción de guía valorizada son hitos distintos.
ALTER TABLE material_receipts ADD COLUMN IF NOT EXISTS valued_guide_requested_on date;
ALTER TABLE material_receipts ADD COLUMN IF NOT EXISTS valued_guide_received_on date;
ALTER TABLE material_receipts DROP CONSTRAINT IF EXISTS material_receipt_valued_guide_dates;
ALTER TABLE material_receipts ADD CONSTRAINT material_receipt_valued_guide_dates CHECK
  (valued_guide_received_on IS NULL OR valued_guide_requested_on IS NULL OR valued_guide_received_on >= valued_guide_requested_on);
CREATE INDEX IF NOT EXISTS material_receipts_valued_pending_idx
  ON material_receipts(valued_guide_requested_on) WHERE valued_guide IS NULL;

-- Fotografías y guía recibida se distinguen del documento que respaldó el ingreso inicial.
ALTER TABLE operation_files DROP CONSTRAINT IF EXISTS operation_files_kind_check;
ALTER TABLE operation_files ADD CONSTRAINT operation_files_kind_check CHECK
  (kind IN ('guia','guia_valorizada','ticket','hoja_ingreso','informe_impurezas','foto_material',
    'foto_diferencia','factura','comprobante','certificado','acta','otro'));
