-- Carol, observación 28: Servicios distingue Traslado y Arriendo.
-- Retiro, Compra y Venta existentes conservan exactamente su clasificación.
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_service_type_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_service_type_check
  CHECK (service_type IN ('retiro','traslado','arriendo','compra','venta','otro'));
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS rental_from date;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS rental_to date;
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_rental_period_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_rental_period_check CHECK
  ((rental_from IS NULL AND rental_to IS NULL AND service_type<>'arriendo') OR
   (service_type='arriendo' AND rental_from IS NOT NULL AND rental_to IS NOT NULL AND rental_to>=rental_from));
CREATE INDEX IF NOT EXISTS rental_period_asset_idx ON service_requests(assigned_asset_id,rental_from,rental_to)
  WHERE service_type='arriendo' AND status='programada' AND deleted_at IS NULL;

ALTER TABLE service_tariffs DROP CONSTRAINT IF EXISTS service_tariffs_service_type_check;
ALTER TABLE service_tariffs ADD CONSTRAINT service_tariffs_service_type_check
  CHECK (service_type IN ('retiro','traslado','arriendo','compra','venta','otro'));
ALTER TABLE service_tariffs DROP CONSTRAINT IF EXISTS service_tariffs_unit_check;
ALTER TABLE service_tariffs ADD CONSTRAINT service_tariffs_unit_check CHECK (unit IN ('servicio','kg','dia'));
