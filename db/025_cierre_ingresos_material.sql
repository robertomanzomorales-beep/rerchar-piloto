-- Seguimiento administrativo del ingreso después de recibir la guía valorizada.
-- La dirección de la factura queda sin definir hasta que operaciones la confirme.
ALTER TABLE material_receipts ADD COLUMN IF NOT EXISTS invoice_direction text;
ALTER TABLE material_receipts ADD COLUMN IF NOT EXISTS invoice_issued_on date;
ALTER TABLE material_receipts ADD COLUMN IF NOT EXISTS payment_reference text;
ALTER TABLE material_receipts ADD COLUMN IF NOT EXISTS closure_notified_on date;
ALTER TABLE material_receipts ADD COLUMN IF NOT EXISTS closure_recipient text;
ALTER TABLE material_receipts ADD COLUMN IF NOT EXISTS closure_note text;
ALTER TABLE material_receipts DROP CONSTRAINT IF EXISTS material_receipts_invoice_direction_check;
ALTER TABLE material_receipts ADD CONSTRAINT material_receipts_invoice_direction_check
  CHECK (invoice_direction IS NULL OR invoice_direction IN ('emitida','recibida'));
CREATE INDEX IF NOT EXISTS material_receipts_closure_pending_idx
  ON material_receipts(valued_guide_received_on) WHERE closure_notified_on IS NULL;
