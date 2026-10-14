-- Vínculo auditable del respaldo operativo con el servicio original de E y J.
-- Un servicio puede producir una línea de transporte y otra de disposición.
ALTER TABLE payment_statement_operations
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES service_requests(id);

CREATE UNIQUE INDEX IF NOT EXISTS edp_service_category_once_idx
  ON payment_statement_operations(service_id,is_disposal)
  WHERE service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS edp_operations_service_idx
  ON payment_statement_operations(service_id)
  WHERE service_id IS NOT NULL;
