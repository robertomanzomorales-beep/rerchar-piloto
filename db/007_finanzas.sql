CREATE TABLE IF NOT EXISTS client_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  site_id uuid,
  code text NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id,code),
  CONSTRAINT contract_site_scope FOREIGN KEY (site_id,client_id) REFERENCES client_sites(id,client_id),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS client_contract_idx ON client_contracts(client_id,site_id,active);

CREATE TABLE IF NOT EXISTS service_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES client_contracts(id),
  service_type text NOT NULL CHECK (service_type IN ('retiro','traslado','compra','venta','otro')),
  waste_type text,
  unit text NOT NULL CHECK (unit IN ('servicio','kg')),
  unit_price_clp numeric(14,2) NOT NULL CHECK (unit_price_clp >= 0),
  valid_from date NOT NULL,
  valid_until date,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
CREATE INDEX IF NOT EXISTS tariff_contract_date_idx ON service_tariffs(contract_id,service_type,valid_from DESC);

CREATE TABLE IF NOT EXISTS service_valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL UNIQUE REFERENCES service_requests(id),
  tariff_id uuid NOT NULL REFERENCES service_tariffs(id),
  quantity numeric(14,2) NOT NULL CHECK (quantity >= 0),
  unit_price_clp numeric(14,2) NOT NULL CHECK (unit_price_clp >= 0),
  total_clp numeric(14,2) NOT NULL CHECK (total_clp >= 0),
  client_order_reference text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id uuid NOT NULL REFERENCES service_valuations(id),
  invoice_number text NOT NULL UNIQUE,
  issued_on date NOT NULL,
  due_on date NOT NULL,
  total_clp numeric(14,2) NOT NULL CHECK (total_clp >= 0),
  status text NOT NULL DEFAULT 'emitida' CHECK (status IN ('emitida','anulada')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (due_on >= issued_on)
);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_active_valuation_idx ON service_invoices(valuation_id) WHERE status='emitida';

CREATE TABLE IF NOT EXISTS invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_key uuid NOT NULL UNIQUE,
  invoice_id uuid NOT NULL REFERENCES service_invoices(id),
  amount_clp numeric(14,2) NOT NULL CHECK (amount_clp > 0),
  paid_on date NOT NULL,
  method text NOT NULL CHECK (method IN ('transferencia','efectivo','tarjeta','otro')),
  reference text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_payments_idx ON invoice_payments(invoice_id,created_at DESC);

CREATE TABLE IF NOT EXISTS service_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_key uuid NOT NULL UNIQUE,
  service_id uuid NOT NULL REFERENCES service_requests(id),
  category text NOT NULL CHECK (category IN ('mano_obra','disposicion','peajes','equipos','otros')),
  amount_clp numeric(14,2) NOT NULL CHECK (amount_clp > 0),
  description text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_cost_idx ON service_costs(service_id,created_at DESC);
