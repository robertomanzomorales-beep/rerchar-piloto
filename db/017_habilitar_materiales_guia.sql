-- Ejecutar cuando ya esté publicado el código que distingue los ítems de cada guía.
ALTER TABLE service_guide_controls DROP CONSTRAINT IF EXISTS service_guide_controls_service_id_guide_number_key;
