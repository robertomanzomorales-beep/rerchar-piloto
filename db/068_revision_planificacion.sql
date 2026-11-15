-- Una modificación de conceptos de retiro/transporte obliga a revisar nuevamente ruta y costos.
ALTER TABLE client_quotes ADD COLUMN IF NOT EXISTS planning_review_after timestamptz;
