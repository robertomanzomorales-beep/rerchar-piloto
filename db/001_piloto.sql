CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) >= 2),
  tax_id text,
  contact_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS client_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  name text NOT NULL,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (id, client_id)
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'operaciones', 'conductor', 'cliente')),
  client_id uuid REFERENCES clients(id),
  active boolean NOT NULL DEFAULT true,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_role_scope CHECK ((role = 'cliente' AND client_id IS NOT NULL) OR (role <> 'cliente' AND client_id IS NULL))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('camion', 'rampa', 'equipo')),
  plate text,
  available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  submission_key uuid NOT NULL UNIQUE,
  client_id uuid NOT NULL REFERENCES clients(id),
  site_id uuid NOT NULL,
  service_type text NOT NULL CHECK (service_type IN ('retiro', 'traslado', 'compra', 'venta', 'otro')),
  waste_type text NOT NULL,
  estimated_kg numeric(14,2) CHECK (estimated_kg > 0),
  origin text NOT NULL,
  destination text NOT NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'alta', 'critica')),
  scheduled_for timestamptz,
  status text NOT NULL DEFAULT 'solicitada' CHECK (status IN ('solicitada', 'programada', 'en_ruta', 'completada', 'cancelada')),
  notes text,
  assigned_asset_id uuid REFERENCES assets(id),
  driver_id uuid REFERENCES users(id),
  guide_number text,
  gross_kg numeric(14,2) CHECK (gross_kg >= 0),
  tare_kg numeric(14,2) CHECK (tare_kg >= 0),
  started_at timestamptz,
  closed_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT site_belongs_to_client FOREIGN KEY (site_id, client_id) REFERENCES client_sites(id, client_id),
  CONSTRAINT valid_weights CHECK (gross_kg IS NULL OR tare_kg IS NULL OR gross_kg >= tare_kg)
);
CREATE INDEX IF NOT EXISTS service_status_date_idx ON service_requests(status, scheduled_for);
CREATE INDEX IF NOT EXISTS service_client_idx ON service_requests(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS service_driver_idx ON service_requests(driver_id, scheduled_for);
CREATE INDEX IF NOT EXISTS service_asset_idx ON service_requests(assigned_asset_id, scheduled_for);

CREATE TABLE IF NOT EXISTS service_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL UNIQUE REFERENCES service_requests(id),
  vehicle_ok boolean NOT NULL,
  documents_ok boolean NOT NULL,
  containment_ok boolean NOT NULL,
  ppe_ok boolean NOT NULL,
  comment text,
  completed_by uuid NOT NULL REFERENCES users(id),
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES service_requests(id),
  description text NOT NULL,
  storage_key text,
  original_filename text,
  mime_type text,
  size_bytes integer,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_service_idx ON service_evidence(service_id, created_at);

CREATE TABLE IF NOT EXISTS service_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES service_requests(id),
  kind text NOT NULL,
  description text NOT NULL,
  actor_id uuid REFERENCES users(id),
  previous_value jsonb,
  next_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_events_idx ON service_events(service_id, created_at, id);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  previous_value jsonb,
  next_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_events(entity_type, entity_id, created_at);
