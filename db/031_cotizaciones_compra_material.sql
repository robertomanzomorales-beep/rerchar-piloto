-- Carol 15, 17 y 18: cotización de compra, solicitud e ingreso comparten el catálogo.
ALTER TABLE client_quotes ADD COLUMN IF NOT EXISTS commercial_kind text NOT NULL DEFAULT 'general';
ALTER TABLE client_quotes ADD COLUMN IF NOT EXISTS tax_review_status text NOT NULL DEFAULT 'no_aplica';
ALTER TABLE client_quotes ADD COLUMN IF NOT EXISTS tax_review_note text;
ALTER TABLE client_quotes ADD COLUMN IF NOT EXISTS tax_reviewed_by uuid REFERENCES users(id);
ALTER TABLE client_quotes ADD COLUMN IF NOT EXISTS tax_reviewed_at timestamptz;
ALTER TABLE client_quotes DROP CONSTRAINT IF EXISTS client_quotes_purchase_tax_valid;
ALTER TABLE client_quotes ADD CONSTRAINT client_quotes_purchase_tax_valid CHECK
  ((commercial_kind='general' AND tax_review_status='no_aplica') OR
   (commercial_kind='compra_material' AND tax_review_status IN ('pendiente','sin_iva','con_iva')));

ALTER TABLE client_quote_lines ADD COLUMN IF NOT EXISTS material_id uuid REFERENCES material_catalog(id);
ALTER TABLE client_quote_lines ADD COLUMN IF NOT EXISTS line_note text;
CREATE INDEX IF NOT EXISTS quote_lines_material_idx ON client_quote_lines(material_id) WHERE material_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS service_request_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES service_requests(id),
  position integer NOT NULL CHECK (position>0),
  material_id uuid NOT NULL REFERENCES material_catalog(id),
  material_name text NOT NULL,
  quantity_kg numeric(14,3) NOT NULL CHECK (quantity_kg>0),
  unit_price_clp numeric(14,2) CHECK (unit_price_clp>=0),
  line_note text,
  source_quote_line_id uuid REFERENCES client_quote_lines(id),
  UNIQUE (service_id,position),
  UNIQUE (service_id,source_quote_line_id)
);
CREATE INDEX IF NOT EXISTS request_materials_catalog_idx ON service_request_materials(material_id,service_id);
