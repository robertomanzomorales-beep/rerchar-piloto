-- La fecha del hallazgo y la ejecución histórica se distinguen de su registro en el sistema.
ALTER TABLE fleet_incidents ADD COLUMN IF NOT EXISTS observed_on date;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS performed_on date;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS history_only boolean NOT NULL DEFAULT false;

-- Elementos asignados físicamente a un camión, rampla o equipo.
CREATE TABLE IF NOT EXISTS asset_equipment_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  quantity numeric(12,2) NOT NULL CHECK (quantity > 0),
  condition text NOT NULL DEFAULT 'operativo' CHECK (condition IN ('operativo','por_revisar','fuera_servicio')),
  expires_on date,
  note text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS asset_equipment_active_name_idx
  ON asset_equipment_inventory(asset_id,lower(name)) WHERE active=true;
CREATE INDEX IF NOT EXISTS asset_equipment_asset_idx ON asset_equipment_inventory(asset_id,active);
