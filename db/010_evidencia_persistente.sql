-- Evidencias pequeñas en la base: opción persistente para el piloto alojado sin volumen privado.
-- Los archivos anteriores conservan storage_key y pueden leerse desde el almacenamiento local original.
ALTER TABLE service_evidence ADD COLUMN IF NOT EXISTS file_content bytea;
