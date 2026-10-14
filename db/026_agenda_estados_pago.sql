-- Agenda de cortes E y J: cada período y contacto se acuerdan con el cliente.
-- Los registros no emiten un estado de pago ni una factura por sí solos.
CREATE TABLE IF NOT EXISTS payment_statement_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL DEFAULT 'e_y_j' CHECK (issuer='e_y_j'),
  client_id uuid NOT NULL REFERENCES clients(id),
  statement_type text NOT NULL CHECK (statement_type IN ('residuos','arriendo')),
  period_from date NOT NULL,
  period_to date NOT NULL,
  cutoff_on date NOT NULL,
  send_on date NOT NULL,
  contact_email text NOT NULL,
  notes text,
  statement_id uuid REFERENCES payment_statements(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_statement_cycles_dates CHECK (period_from <= period_to AND period_to <= cutoff_on AND cutoff_on <= send_on),
  CONSTRAINT payment_statement_cycles_unique UNIQUE (issuer,client_id,statement_type,period_from,period_to)
);
CREATE INDEX IF NOT EXISTS payment_statement_cycles_send_idx ON payment_statement_cycles(send_on);
