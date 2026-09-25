ALTER TABLE assets ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS model_year integer CHECK (model_year BETWEEN 1950 AND 2100);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS reading_unit text NOT NULL DEFAULT 'sin' CHECK (reading_unit IN ('sin','km','horas'));
ALTER TABLE assets ADD COLUMN IF NOT EXISTS current_reading numeric(14,2) NOT NULL DEFAULT 0 CHECK (current_reading >= 0);
UPDATE assets SET reading_unit='km' WHERE kind='camion' AND reading_unit='sin';

CREATE TABLE IF NOT EXISTS asset_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id),
  unit text NOT NULL CHECK (unit IN ('km','horas')),
  reading numeric(14,2) NOT NULL CHECK (reading >= 0),
  source text NOT NULL CHECK (source IN ('manual','combustible','mantenimiento')),
  source_id uuid,
  note text NOT NULL,
  recorded_by uuid NOT NULL REFERENCES users(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_readings_history_idx ON asset_readings(asset_id, recorded_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS maintenance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id),
  title text NOT NULL CHECK (length(trim(title)) >= 3),
  frequency_kind text NOT NULL CHECK (frequency_kind IN ('fecha','lectura')),
  interval_days integer CHECK (interval_days > 0),
  interval_reading numeric(14,2) CHECK (interval_reading > 0),
  next_due_date date,
  next_due_reading numeric(14,2),
  lead_days integer NOT NULL DEFAULT 15 CHECK (lead_days BETWEEN 0 AND 365),
  lead_reading numeric(14,2) NOT NULL DEFAULT 500 CHECK (lead_reading >= 0),
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((frequency_kind='fecha' AND interval_days IS NOT NULL AND next_due_date IS NOT NULL AND interval_reading IS NULL AND next_due_reading IS NULL)
    OR (frequency_kind='lectura' AND interval_reading IS NOT NULL AND next_due_reading IS NOT NULL AND interval_days IS NULL AND next_due_date IS NULL))
);
CREATE INDEX IF NOT EXISTS maintenance_plan_asset_idx ON maintenance_plans(asset_id, active);

CREATE TABLE IF NOT EXISTS work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  asset_id uuid NOT NULL REFERENCES assets(id),
  plan_id uuid REFERENCES maintenance_plans(id),
  incident_id uuid REFERENCES fleet_incidents(id),
  kind text NOT NULL CHECK (kind IN ('preventiva','correctiva','neumaticos')),
  title text NOT NULL CHECK (length(trim(title)) >= 3),
  description text,
  status text NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta','en_trabajo','cerrada','cancelada')),
  blocks_asset boolean NOT NULL DEFAULT false,
  scheduled_for date,
  started_at timestamptz,
  closed_at timestamptz,
  reading_at_close numeric(14,2),
  labor_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (labor_cost >= 0),
  parts_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (parts_cost >= 0),
  supplier text,
  resolution text,
  created_by uuid NOT NULL REFERENCES users(id),
  closed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (plan_id IS NULL OR incident_id IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS work_orders_active_plan_idx ON work_orders(plan_id) WHERE plan_id IS NOT NULL AND status IN ('abierta','en_trabajo');
CREATE UNIQUE INDEX IF NOT EXISTS work_orders_active_incident_idx ON work_orders(incident_id) WHERE incident_id IS NOT NULL AND status IN ('abierta','en_trabajo');
CREATE INDEX IF NOT EXISTS work_orders_asset_idx ON work_orders(asset_id, status, created_at DESC);
ALTER TABLE inventory_reservations ADD COLUMN IF NOT EXISTS work_order_id uuid REFERENCES work_orders(id);
CREATE INDEX IF NOT EXISTS reservation_work_order_idx ON inventory_reservations(work_order_id, status);

CREATE TABLE IF NOT EXISTS fuel_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_key uuid NOT NULL UNIQUE,
  asset_id uuid NOT NULL REFERENCES assets(id),
  driver_id uuid REFERENCES users(id),
  service_id uuid REFERENCES service_requests(id),
  fuel_date date NOT NULL,
  liters numeric(14,3) NOT NULL CHECK (liters > 0),
  cost_clp numeric(14,2) NOT NULL CHECK (cost_clp >= 0),
  reading numeric(14,2) NOT NULL CHECK (reading >= 0),
  full_tank boolean NOT NULL DEFAULT false,
  km_per_liter numeric(12,3) CHECK (km_per_liter > 0),
  supplier text NOT NULL,
  receipt_number text NOT NULL,
  notes text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fuel_asset_date_idx ON fuel_entries(asset_id, fuel_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS tires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  brand text,
  size text,
  status text NOT NULL DEFAULT 'disponible' CHECK (status IN ('disponible','instalado','retirado')),
  asset_id uuid REFERENCES assets(id),
  position text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status='instalado' AND asset_id IS NOT NULL AND position IS NOT NULL)
    OR (status<>'instalado' AND asset_id IS NULL AND position IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS tire_asset_position_idx ON tires(asset_id, position) WHERE status='instalado';
CREATE TABLE IF NOT EXISTS tire_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tire_id uuid NOT NULL REFERENCES tires(id),
  kind text NOT NULL CHECK (kind IN ('alta','instalacion','rotacion','retiro')),
  asset_id uuid REFERENCES assets(id),
  position text,
  reading numeric(14,2),
  note text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tire_events_history_idx ON tire_events(tire_id, created_at DESC, id DESC);
