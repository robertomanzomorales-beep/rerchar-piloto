-- Revisión explícita de la factura del proveedor antes de autorizar pagos.
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pendiente_revision'
  CHECK (review_status IN ('pendiente_revision','aceptada','disputada'));
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users(id);
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Valores internos comunes por empresa. Cada cotización guarda su propio cálculo histórico.
CREATE TABLE IF NOT EXISTS quote_cost_rates (
  issuer text PRIMARY KEY CHECK (issuer IN ('rerchar','e_y_j')),
  values_json jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(values_json)='object'),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
