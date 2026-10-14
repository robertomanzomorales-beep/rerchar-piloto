-- Carol 11 y 12. Los registros anteriores no requieren ruta; los nuevos
-- servicios de retiro, transporte e instalación sí la requieren al entregar.
ALTER TABLE client_quotes ADD COLUMN IF NOT EXISTS route_required boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS client_quote_routes (
  quote_id uuid PRIMARY KEY REFERENCES client_quotes(id) ON DELETE CASCADE,
  origin text NOT NULL,
  pickup text NOT NULL,
  destination text NOT NULL,
  return_to text NOT NULL,
  pickup_km numeric(10,2) NOT NULL CHECK (pickup_km >= 0),
  destination_km numeric(10,2) NOT NULL CHECK (destination_km >= 0),
  return_km numeric(10,2) NOT NULL CHECK (return_km >= 0),
  total_km numeric(10,2) NOT NULL CHECK (total_km > 0),
  source text NOT NULL CHECK (source IN ('manual','mapa')),
  reviewed_for_truck boolean NOT NULL DEFAULT false,
  correction_reason text,
  route_url text NOT NULL,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT route_total_matches_legs CHECK (total_km=pickup_km+destination_km+return_km)
);

-- Campos de costo privados: no incluirlos en consultas públicas ni en PDF.
CREATE TABLE IF NOT EXISTS client_quote_costings (
  quote_id uuid PRIMARY KEY REFERENCES client_quotes(id) ON DELETE CASCADE,
  trips integer NOT NULL DEFAULT 1 CHECK (trips BETWEEN 1 AND 10000),
  asset_id uuid REFERENCES assets(id),
  equipment text NOT NULL DEFAULT '',
  capacity numeric(12,2) NOT NULL DEFAULT 0 CHECK (capacity >= 0),
  capacity_unit text NOT NULL DEFAULT 'tonelada' CHECK (capacity_unit IN ('tonelada','m³')),
  km_per_liter numeric(10,2) NOT NULL DEFAULT 0 CHECK (km_per_liter >= 0),
  fuel_price_clp numeric(14,2) NOT NULL DEFAULT 0 CHECK (fuel_price_clp >= 0),
  equipment_cost_clp numeric(14,2) NOT NULL DEFAULT 0 CHECK (equipment_cost_clp >= 0),
  tolls_clp numeric(14,2) NOT NULL DEFAULT 0 CHECK (tolls_clp >= 0),
  driver_hours numeric(10,2) NOT NULL DEFAULT 0 CHECK (driver_hours >= 0),
  driver_hour_clp numeric(14,2) NOT NULL DEFAULT 0 CHECK (driver_hour_clp >= 0),
  support_hours numeric(10,2) NOT NULL DEFAULT 0 CHECK (support_hours >= 0),
  support_hour_clp numeric(14,2) NOT NULL DEFAULT 0 CHECK (support_hour_clp >= 0),
  per_diem_clp numeric(14,2) NOT NULL DEFAULT 0 CHECK (per_diem_clp >= 0),
  loading_clp numeric(14,2) NOT NULL DEFAULT 0 CHECK (loading_clp >= 0),
  disposal_quantity numeric(12,2) NOT NULL DEFAULT 0 CHECK (disposal_quantity >= 0),
  disposal_unit text NOT NULL DEFAULT 'tonelada' CHECK (disposal_unit IN ('tonelada','m³')),
  disposal_unit_clp numeric(14,2) NOT NULL DEFAULT 0 CHECK (disposal_unit_clp >= 0),
  stay_clp numeric(14,2) NOT NULL DEFAULT 0 CHECK (stay_clp >= 0),
  other_clp numeric(14,2) NOT NULL DEFAULT 0 CHECK (other_clp >= 0),
  contingency_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (contingency_pct BETWEEN 0 AND 100),
  margin_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (margin_pct BETWEEN 0 AND 90),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
