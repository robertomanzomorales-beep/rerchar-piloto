-- Vínculo opcional entre la OC y la ficha verificada del proveedor.
-- Las órdenes anteriores conservan sus datos impresos y no se vinculan por inferencia.
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS supplier_profile_id uuid REFERENCES counterparty_profiles(id);
CREATE INDEX IF NOT EXISTS purchase_requests_supplier_profile_idx
  ON purchase_requests(supplier_profile_id) WHERE supplier_profile_id IS NOT NULL;
