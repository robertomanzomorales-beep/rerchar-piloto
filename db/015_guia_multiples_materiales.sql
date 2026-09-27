-- Una guía de transporte puede llevar varios materiales con pesos distintos.
-- Todos los controles existentes conservan el ítem 1 y sus identificadores.
ALTER TABLE service_guide_controls ADD COLUMN IF NOT EXISTS line_number integer NOT NULL DEFAULT 1
  CHECK (line_number BETWEEN 1 AND 100);
CREATE UNIQUE INDEX IF NOT EXISTS guide_controls_service_number_line_idx
  ON service_guide_controls(service_id,guide_number,line_number);
