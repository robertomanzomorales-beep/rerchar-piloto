ALTER TABLE clients ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS request_category text NOT NULL DEFAULT 'servicios';
UPDATE service_requests SET request_category=service_type WHERE service_type IN ('compra','venta','otro');
ALTER TABLE service_requests ADD CONSTRAINT request_category_valid CHECK (request_category IN ('servicios','compra','venta','otro'));

ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS employer text NOT NULL DEFAULT 'rerchar';
ALTER TABLE worker_profiles ADD CONSTRAINT worker_employer_valid CHECK (employer IN ('rerchar','e_y_j'));

ALTER TABLE service_evidence ADD COLUMN IF NOT EXISTS document_kind text NOT NULL DEFAULT 'evidencia';
ALTER TABLE service_evidence ADD CONSTRAINT service_document_kind_valid CHECK (document_kind IN
  ('evidencia','guia_traslado','guia_valorizada','hoja_servicio','factura','certificado','resumen_retiros','otro'));

CREATE TABLE IF NOT EXISTS client_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  submission_key uuid NOT NULL UNIQUE,
  client_id uuid NOT NULL REFERENCES clients(id),
  issuer text NOT NULL CHECK (issuer IN ('rerchar','e_y_j')),
  client_name text NOT NULL,
  client_tax_id text,
  client_email text,
  client_address text,
  title text NOT NULL,
  notes text,
  issued_on date NOT NULL,
  valid_until date NOT NULL,
  vat_rate numeric(5,4) NOT NULL DEFAULT 0.19 CHECK (vat_rate BETWEEN 0 AND 1),
  status text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','enviando','enviada','aceptada','rechazada')),
  sent_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until >= issued_on)
);
CREATE INDEX IF NOT EXISTS quotes_client_idx ON client_quotes(client_id,created_at DESC);

CREATE TABLE IF NOT EXISTS client_quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES client_quotes(id),
  position integer NOT NULL CHECK (position > 0),
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL,
  unit_price_clp numeric(14,2) NOT NULL CHECK (unit_price_clp >= 0),
  taxable boolean NOT NULL DEFAULT true,
  UNIQUE (quote_id,position)
);

CREATE TABLE IF NOT EXISTS service_guide_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES service_requests(id),
  guide_number text NOT NULL,
  movement_date date NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('compra','venta','traslado','servicio','otro')),
  origin_ticket text,
  destination_ticket text,
  return_ticket text,
  origin_kg numeric(14,2) CHECK (origin_kg >= 0),
  complementary_kg numeric(14,2) CHECK (complementary_kg >= 0),
  arrival_kg numeric(14,2) CHECK (arrival_kg >= 0),
  returned_impurities_kg numeric(14,2) CHECK (returned_impurities_kg >= 0),
  return_weight_kg numeric(14,2) CHECK (return_weight_kg >= 0),
  destination_impurities_kg numeric(14,2) CHECK (destination_impurities_kg >= 0),
  invoice_kg numeric(14,2) CHECK (invoice_kg >= 0),
  invoice_number text,
  valued_guide_number text,
  notes text,
  recorded_by uuid NOT NULL REFERENCES users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id,guide_number)
);
CREATE INDEX IF NOT EXISTS guide_controls_service_idx ON service_guide_controls(service_id,movement_date DESC);

ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS issuer text NOT NULL DEFAULT 'e_y_j';
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS supplier_tax_id text;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS supplier_address text;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS payment_terms text;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS vat_rate numeric(5,4) NOT NULL DEFAULT 0.19 CHECK (vat_rate BETWEEN 0 AND 1);
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS ordered_at timestamptz;
ALTER TABLE purchase_requests ADD CONSTRAINT purchase_issuer_valid CHECK (issuer IN ('rerchar','e_y_j'));
ALTER TABLE purchase_lines ADD COLUMN IF NOT EXISTS unit_price_clp numeric(14,2) CHECK (unit_price_clp >= 0);

CREATE TABLE IF NOT EXISTS container_service_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id uuid NOT NULL REFERENCES containers(id),
  service_id uuid REFERENCES service_requests(id),
  kind text NOT NULL CHECK (kind IN ('kilometraje','mantenimiento')),
  record_date date NOT NULL,
  kilometers numeric(14,2) CHECK (kilometers >= 0),
  description text NOT NULL,
  cost_clp numeric(14,2) CHECK (cost_clp >= 0),
  recorded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind='kilometraje' AND kilometers IS NOT NULL) OR kind='mantenimiento')
);
CREATE INDEX IF NOT EXISTS container_service_records_idx ON container_service_records(container_id,record_date DESC);
