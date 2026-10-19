-- Conservar la valoración y la familia vigentes al registrar un consumo.
-- Los movimientos anteriores quedan sin costo histórico: no se reconstruyen
-- desde el catálogo actual, pues éste pudo cambiar después de la salida.
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS unit_cost_clp_at_movement numeric(14,2)
  CHECK (unit_cost_clp_at_movement IS NULL OR unit_cost_clp_at_movement >= 0);
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS category_at_movement text;
CREATE INDEX IF NOT EXISTS inventory_consumption_month_idx
  ON inventory_movements(created_at DESC, item_id) WHERE kind='consumo';
