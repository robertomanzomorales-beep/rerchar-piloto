CREATE TABLE IF NOT EXISTS containers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('tolva','ampliroll','contenedor')),
  capacity_m3 numeric(12,2) NOT NULL CHECK (capacity_m3 > 0),
  status text NOT NULL DEFAULT 'patio' CHECK (status IN ('patio','instalada','en_transito','fuera_servicio')),
  client_id uuid REFERENCES clients(id),
  site_id uuid REFERENCES client_sites(id),
  location_name text NOT NULL,
  waste_type text,
  installed_at timestamptz,
  max_stay_days integer NOT NULL DEFAULT 14 CHECK (max_stay_days BETWEEN 1 AND 3650),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT container_site_scope FOREIGN KEY (site_id,client_id) REFERENCES client_sites(id,client_id),
  CONSTRAINT container_location_consistent CHECK (
    (status='instalada' AND client_id IS NOT NULL AND site_id IS NOT NULL AND installed_at IS NOT NULL)
    OR (status<>'instalada' AND client_id IS NULL AND site_id IS NULL AND installed_at IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS containers_status_idx ON containers(status,installed_at);
CREATE INDEX IF NOT EXISTS containers_client_idx ON containers(client_id,site_id);

CREATE TABLE IF NOT EXISTS container_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id uuid NOT NULL REFERENCES containers(id),
  kind text NOT NULL CHECK (kind IN ('alta','instalacion','retiro','reubicacion','traslado','fuera_servicio','reactivacion')),
  previous_status text,
  previous_location text,
  previous_waste_type text,
  next_status text NOT NULL,
  next_location text NOT NULL,
  next_waste_type text,
  service_id uuid REFERENCES service_requests(id),
  note text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS container_movements_history_idx ON container_movements(container_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS container_movements_service_idx ON container_movements(service_id,created_at DESC);
