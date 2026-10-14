-- Una factura externa puede cubrir varios materiales o guías del mismo cliente.
-- Su importe real se registra una sola vez en extra_receivable_invoices.
ALTER TABLE material_guide_items
  ADD COLUMN IF NOT EXISTS receivable_invoice_id uuid REFERENCES extra_receivable_invoices(id);
CREATE INDEX IF NOT EXISTS material_guide_items_receivable_idx
  ON material_guide_items(receivable_invoice_id) WHERE receivable_invoice_id IS NOT NULL;
