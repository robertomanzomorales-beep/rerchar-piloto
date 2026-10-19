-- Clasificación de respaldos de faena solicitada por Don Hugo.
ALTER TABLE service_evidence DROP CONSTRAINT IF EXISTS service_document_kind_valid;
ALTER TABLE service_evidence ADD CONSTRAINT service_document_kind_valid CHECK (document_kind IN
  ('evidencia','guia_traslado','guia_valorizada','hoja_servicio','ticket_pesaje',
   'foto_material','foto_area','checklist','factura','certificado','resumen_retiros','otro'));
