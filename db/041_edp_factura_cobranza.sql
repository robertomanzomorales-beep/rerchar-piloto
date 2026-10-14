-- Un EDP aprobado enlaza un folio de factura externa; la cuenta se registra una sola vez.
-- Se reutiliza una factura vigente del mismo cliente cuando el folio ya existe.
ALTER TABLE payment_statements ADD COLUMN IF NOT EXISTS receivable_invoice_id uuid REFERENCES extra_receivable_invoices(id);
ALTER TABLE payment_statements ADD COLUMN IF NOT EXISTS service_invoice_id uuid REFERENCES service_invoices(id);
ALTER TABLE payment_statements ADD COLUMN IF NOT EXISTS invoice_variance_note text;
ALTER TABLE payment_statements DROP CONSTRAINT IF EXISTS payment_statement_one_invoice;
ALTER TABLE payment_statements ADD CONSTRAINT payment_statement_one_invoice
  CHECK (receivable_invoice_id IS NULL OR service_invoice_id IS NULL);
CREATE INDEX IF NOT EXISTS payment_statements_receivable_idx ON payment_statements(receivable_invoice_id)
  WHERE receivable_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_statements_service_invoice_idx ON payment_statements(service_invoice_id)
  WHERE service_invoice_id IS NOT NULL;
