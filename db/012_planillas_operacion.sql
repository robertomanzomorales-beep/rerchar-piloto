ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS maximum_qty numeric(14,3) CHECK (maximum_qty IS NULL OR maximum_qty >= minimum_qty);
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS unit_cost_clp numeric(14,2) CHECK (unit_cost_clp IS NULL OR unit_cost_clp >= 0);
ALTER TABLE stock_items DROP CONSTRAINT IF EXISTS stock_items_unit_check;
ALTER TABLE stock_items ADD CONSTRAINT stock_items_unit_check CHECK (unit IN ('un','kg','lt','m','m3','caja_10','caja_50','pallet','bolsa_10','centena'));
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS document_reference text;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS cost_center text;
ALTER TABLE purchase_requests DROP CONSTRAINT IF EXISTS purchase_requests_category_check;
ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_category_check CHECK (category IN ('repuestos','insumos','seguridad','servicios','operacion','otros'));

ALTER TABLE service_guide_controls ADD COLUMN IF NOT EXISTS departure_ticket text;
ALTER TABLE service_guide_controls ADD COLUMN IF NOT EXISTS driver_name text;
ALTER TABLE service_guide_controls ADD COLUMN IF NOT EXISTS truck_plate text;
ALTER TABLE service_guide_controls ADD COLUMN IF NOT EXISTS material_name text;
ALTER TABLE service_guide_controls ADD COLUMN IF NOT EXISTS agreed_price_clp numeric(14,2) CHECK (agreed_price_clp >= 0);
ALTER TABLE service_guide_controls ADD COLUMN IF NOT EXISTS invoice_price_clp numeric(14,2) CHECK (invoice_price_clp >= 0);
ALTER TABLE service_guide_controls ADD COLUMN IF NOT EXISTS invoice_issued_on date;
ALTER TABLE service_guide_controls ADD COLUMN IF NOT EXISTS payment_on date;
ALTER TABLE service_guide_controls ADD COLUMN IF NOT EXISTS freight_company text;
ALTER TABLE service_guide_controls ADD COLUMN IF NOT EXISTS freight_invoice_number text;
ALTER TABLE service_guide_controls ADD COLUMN IF NOT EXISTS freight_guide_reference text;
ALTER TABLE service_guide_controls ADD COLUMN IF NOT EXISTS freight_payment_required text CHECK (freight_payment_required IN ('si','no','pendiente'));

CREATE TABLE IF NOT EXISTS material_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  service_id uuid REFERENCES service_requests(id),
  kind text NOT NULL CHECK (kind IN ('ingreso','excedente')),
  movement_on date NOT NULL,
  site_name text NOT NULL,
  origin text,
  destination text,
  driver_name text,
  driver_tax_id text,
  truck_plate text,
  trailer_plate text,
  weighing_ticket text NOT NULL,
  material_name text NOT NULL,
  supplier_kg numeric(14,2) CHECK (supplier_kg >= 0),
  rerchar_kg numeric(14,2) CHECK (rerchar_kg >= 0),
  impurity_kg numeric(14,2) NOT NULL DEFAULT 0 CHECK (impurity_kg >= 0),
  net_basis text NOT NULL CHECK (net_basis IN ('proveedor','rerchar')),
  net_reported_kg numeric(14,2) CHECK (net_reported_kg >= 0),
  impurity_report text,
  origin_guide text,
  transfer_guide text,
  entry_sheet text,
  valued_guide text,
  certificate_number text,
  act_number text,
  invoice_number text,
  unit_price_clp numeric(14,2) CHECK (unit_price_clp >= 0),
  payment_status text NOT NULL DEFAULT 'pendiente' CHECK (payment_status IN ('pendiente','parcial','pagado','no_aplica')),
  paid_on date,
  notes text,
  recorded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((net_basis='proveedor' AND supplier_kg IS NOT NULL AND supplier_kg>=impurity_kg)
    OR (net_basis='rerchar' AND rerchar_kg IS NOT NULL AND rerchar_kg>=impurity_kg))
);
CREATE INDEX IF NOT EXISTS material_receipts_client_idx ON material_receipts(client_id,movement_on DESC);
CREATE INDEX IF NOT EXISTS material_receipts_service_idx ON material_receipts(service_id,movement_on DESC);

CREATE TABLE IF NOT EXISTS supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL CHECK (issuer IN ('rerchar','e_y_j')),
  supplier_tax_id text NOT NULL,
  supplier_name text NOT NULL,
  invoice_number text NOT NULL,
  issued_on date NOT NULL,
  due_on date,
  description text NOT NULL,
  net_clp numeric(14,2) CHECK (net_clp >= 0),
  vat_clp numeric(14,2) CHECK (vat_clp >= 0),
  total_clp numeric(14,2) NOT NULL CHECK (total_clp >= 0),
  cost_area text,
  purchase_id uuid REFERENCES purchase_requests(id),
  service_id uuid REFERENCES service_requests(id),
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','parcial','pagada','observada')),
  paid_clp numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_clp >= 0 AND paid_clp <= total_clp),
  paid_on date,
  notes text,
  recorded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(issuer,supplier_tax_id,invoice_number),
  CHECK (net_clp IS NULL OR vat_clp IS NULL OR abs(net_clp+vat_clp-total_clp)<=0.01)
);
CREATE INDEX IF NOT EXISTS supplier_invoices_due_idx ON supplier_invoices(status,due_on);

CREATE TABLE IF NOT EXISTS supplier_invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_key uuid NOT NULL UNIQUE,
  invoice_id uuid NOT NULL REFERENCES supplier_invoices(id),
  amount_clp numeric(14,2) NOT NULL CHECK (amount_clp > 0),
  paid_on date NOT NULL,
  reference text NOT NULL,
  recorded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_invoice_payments_idx ON supplier_invoice_payments(invoice_id,created_at DESC);

CREATE TABLE IF NOT EXISTS operation_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid REFERENCES material_receipts(id),
  invoice_id uuid REFERENCES supplier_invoices(id),
  kind text NOT NULL CHECK (kind IN ('guia','ticket','informe_impurezas','factura','comprobante','certificado','acta','otro')),
  filename text NOT NULL,
  mime_type text NOT NULL,
  content bytea NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((receipt_id IS NULL) <> (invoice_id IS NULL))
);
CREATE INDEX IF NOT EXISTS operation_files_receipt_idx ON operation_files(receipt_id,created_at DESC);
CREATE INDEX IF NOT EXISTS operation_files_invoice_idx ON operation_files(invoice_id,created_at DESC);

CREATE TABLE IF NOT EXISTS valued_guide_followups (
  service_id uuid PRIMARY KEY REFERENCES service_requests(id),
  requested_on date,
  received_on date,
  documents_sent_on date,
  notes text,
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (received_on IS NULL OR requested_on IS NULL OR received_on >= requested_on)
);

CREATE TABLE IF NOT EXISTS service_commercial_details (
  service_id uuid PRIMARY KEY REFERENCES service_requests(id),
  quote_reference text,
  quote_on date,
  order_reference text,
  order_on date,
  service_sheet text,
  eyj_guide text,
  client_guide text,
  sidrep text,
  rental_days numeric(10,2) CHECK (rental_days >= 0),
  quantity numeric(14,3) CHECK (quantity >= 0),
  service_value_clp numeric(14,2) CHECK (service_value_clp >= 0),
  notes text,
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
