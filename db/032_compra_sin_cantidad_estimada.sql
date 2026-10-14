-- Carol, observación 4: la compra se solicita antes del pesaje.
-- Un peso acordado en una cotización sigue guardándose si ya se conoce.
ALTER TABLE service_request_materials ALTER COLUMN quantity_kg DROP NOT NULL;
