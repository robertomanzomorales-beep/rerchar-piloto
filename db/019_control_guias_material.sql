-- Control de guías de material de RERCHAR: la venta o salida comienza aquí,
-- sin crear una solicitud de servicio ficticia. Una guía admite varios materiales.
CREATE TABLE material_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_key uuid NOT NULL UNIQUE,
  operating_company text NOT NULL DEFAULT 'rerchar' CHECK (operating_company='rerchar'),
  guide_number text NOT NULL CHECK (length(trim(guide_number))>0),
  movement_on date NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('venta','compra','traslado')),
  movement_detail text,
  counterparty_id uuid NOT NULL REFERENCES clients(id),
  origin text NOT NULL,
  destination text NOT NULL,
  driver_name text,
  truck_plate text,
  trailer_plate text,
  freight_company text,
  freight_cost_clp numeric(14,2) CHECK (freight_cost_clp>=0),
  freight_invoice_number text,
  freight_guide_reference text,
  freight_payment_required text CHECK (freight_payment_required IN ('si','no','pendiente')),
  freight_invoice_status text CHECK (freight_invoice_status IN ('pendiente','parcial','pagada')),
  notes text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX material_guides_number_idx ON material_guides(operating_company,lower(guide_number));
CREATE INDEX material_guides_date_idx ON material_guides(movement_on DESC,created_at DESC);

CREATE TABLE material_guide_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id uuid NOT NULL REFERENCES material_guides(id),
  line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 100),
  material_name text NOT NULL,
  origin_ticket text,
  origin_kg numeric(14,2) CHECK (origin_kg>=0),
  stock_kg numeric(14,2) CHECK (stock_kg>=0),
  departure_ticket text,
  destination_ticket text,
  arrival_kg numeric(14,2) CHECK (arrival_kg>=0),
  returned_kg numeric(14,2) CHECK (returned_kg>=0),
  return_ticket text,
  return_kg numeric(14,2) CHECK (return_kg>=0),
  destination_impurity_kg numeric(14,2) CHECK (destination_impurity_kg>=0),
  invoice_kg numeric(14,2) CHECK (invoice_kg>=0),
  agreed_price_clp numeric(14,2) CHECK (agreed_price_clp>=0),
  invoice_price_clp numeric(14,2) CHECK (invoice_price_clp>=0),
  invoice_number text,
  invoice_issued_on date,
  invoice_status text CHECK (invoice_status IN ('pendiente','parcial','pagada')),
  payment_on date,
  valued_guide_number text,
  notes text,
  recorded_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guide_id,line_number)
);
CREATE INDEX material_guide_items_guide_idx ON material_guide_items(guide_id,line_number);
