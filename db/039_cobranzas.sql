-- Facturas externas de cargos extraordinarios. Un folio cubre varios cargos sin duplicar el total.
-- Las facturas anteriores copiaron el neto de la tarifa: quedan por confirmar antes de entrar al saldo.
ALTER TABLE service_invoices ADD COLUMN IF NOT EXISTS total_verified boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS extra_receivable_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL CHECK (issuer IN ('rerchar','e_y_j')),
  client_id uuid NOT NULL REFERENCES clients(id),
  invoice_number text NOT NULL CHECK (length(trim(invoice_number)) BETWEEN 2 AND 80),
  issued_on date NOT NULL,
  due_on date NOT NULL CHECK (due_on>=issued_on),
  total_clp numeric(14,2) NOT NULL CHECK (total_clp>0),
  status text NOT NULL DEFAULT 'emitida' CHECK (status IN ('emitida','anulada')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(issuer,invoice_number)
);
CREATE INDEX IF NOT EXISTS extra_receivable_due_idx ON extra_receivable_invoices(issuer,status,due_on);

ALTER TABLE service_extra_charges ADD COLUMN IF NOT EXISTS receivable_invoice_id uuid REFERENCES extra_receivable_invoices(id);
ALTER TABLE service_extra_charges ADD COLUMN IF NOT EXISTS linked_service_invoice_id uuid REFERENCES service_invoices(id);
ALTER TABLE service_extra_charges DROP CONSTRAINT IF EXISTS extra_charge_invoice_source;
ALTER TABLE service_extra_charges ADD CONSTRAINT extra_charge_invoice_source
  CHECK (receivable_invoice_id IS NULL OR linked_service_invoice_id IS NULL);
CREATE INDEX IF NOT EXISTS service_extra_receivable_idx ON service_extra_charges(receivable_invoice_id);
CREATE INDEX IF NOT EXISTS service_extra_main_invoice_idx ON service_extra_charges(linked_service_invoice_id);

CREATE TABLE IF NOT EXISTS extra_receivable_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_key uuid NOT NULL UNIQUE,
  invoice_id uuid NOT NULL REFERENCES extra_receivable_invoices(id),
  amount_clp numeric(14,2) NOT NULL CHECK (amount_clp>0),
  paid_on date NOT NULL,
  reference text NOT NULL CHECK (length(trim(reference)) BETWEEN 2 AND 120),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS extra_receivable_payments_idx ON extra_receivable_payments(invoice_id,created_at DESC);
