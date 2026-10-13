-- Estados de pago de E y J, separados de facturas y servicios de RERCHAR.
CREATE TABLE payment_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_key uuid NOT NULL UNIQUE,
  issuer text NOT NULL DEFAULT 'e_y_j' CHECK (issuer='e_y_j'),
  client_id uuid NOT NULL REFERENCES clients(id),
  number text NOT NULL,
  period_on date NOT NULL,
  statement_type text NOT NULL CHECK (statement_type IN ('residuos','arriendo')),
  client_name text NOT NULL,
  client_tax_id text NOT NULL,
  client_address text NOT NULL,
  client_contact text NOT NULL,
  issuer_contact text,
  contract_manager text,
  contract_reference text,
  notes text,
  status text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','enviado','aprobado','observado')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer,client_id,period_on,number)
);
CREATE INDEX payment_statements_period_idx ON payment_statements(period_on DESC,created_at DESC);

CREATE TABLE payment_statement_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES payment_statements(id),
  line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 200),
  description text NOT NULL,
  operation_on date,
  weight_kg numeric(14,2) CHECK (weight_kg>0),
  weighing_ticket text,
  service_sheet text,
  guide_number text,
  sidrep text,
  rental_from date,
  rental_to date,
  is_disposal boolean NOT NULL DEFAULT false,
  recorded_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(statement_id,line_number),
  CHECK (rental_to IS NULL OR rental_from IS NULL OR rental_to>=rental_from)
);
CREATE INDEX payment_statement_operations_idx ON payment_statement_operations(statement_id,line_number);

CREATE TABLE payment_statement_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES payment_statements(id),
  line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 100),
  description text NOT NULL,
  pricing text NOT NULL CHECK (pricing IN ('clp_servicio','uf_ton','uf_unidad')),
  unit_value numeric(14,2) NOT NULL CHECK (unit_value>0),
  quantity numeric(14,3) CHECK (quantity>0),
  uf_value_clp numeric(14,2) CHECK (uf_value_clp>0),
  uf_on date,
  recorded_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(statement_id,line_number),
  CHECK ((pricing='clp_servicio' AND quantity IS NOT NULL AND uf_value_clp IS NULL AND uf_on IS NULL)
    OR (pricing='uf_unidad' AND quantity IS NOT NULL AND uf_value_clp IS NOT NULL AND uf_on IS NOT NULL)
    OR (pricing='uf_ton' AND quantity IS NULL AND uf_value_clp IS NOT NULL AND uf_on IS NOT NULL))
);
CREATE INDEX payment_statement_charges_idx ON payment_statement_charges(statement_id,line_number);
