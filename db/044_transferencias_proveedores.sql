-- Solicitud, aprobación, ejecución y verificación de pagos a proveedores.
-- El dinero se transfiere en el banco; sólo la verificación crea el pago contable.
CREATE TABLE IF NOT EXISTS supplier_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_key uuid NOT NULL UNIQUE,
  invoice_id uuid NOT NULL REFERENCES supplier_invoices(id),
  amount_clp numeric(14,2) NOT NULL CHECK (amount_clp>0),
  bank_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('corriente','vista','ahorro','otro')),
  account_number text NOT NULL,
  status text NOT NULL DEFAULT 'solicitada' CHECK (status IN ('solicitada','aprobada','rechazada','ejecutada','verificada')),
  requested_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  decision_note text,
  executed_by uuid REFERENCES users(id),
  executed_at timestamptz,
  paid_on date,
  bank_reference text,
  verified_by uuid REFERENCES users(id),
  verified_at timestamptz,
  verification_note text,
  payment_id uuid UNIQUE REFERENCES supplier_invoice_payments(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_transfer_requests_invoice_idx ON supplier_transfer_requests(invoice_id,created_at DESC);
CREATE INDEX IF NOT EXISTS supplier_transfer_requests_status_idx ON supplier_transfer_requests(status,created_at DESC);

CREATE TABLE IF NOT EXISTS supplier_transfer_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL UNIQUE REFERENCES supplier_transfer_requests(id),
  filename text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
  content bytea NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
