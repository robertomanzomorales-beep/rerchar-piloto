-- La entrega documental separa el trabajo del conductor del cierre administrativo.
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check CHECK
  (status IN ('solicitada','programada','en_ruta','pendiente_revision','completada','cancelada'));

-- Ticket y fotografía de carga se identifican por separado de las dos piezas obligatorias.
ALTER TABLE service_evidence DROP CONSTRAINT IF EXISTS service_document_kind_valid;
ALTER TABLE service_evidence ADD CONSTRAINT service_document_kind_valid CHECK (document_kind IN
  ('evidencia','guia_traslado','guia_valorizada','hoja_servicio','ticket_pesaje','foto_material',
   'factura','certificado','resumen_retiros','otro'));
