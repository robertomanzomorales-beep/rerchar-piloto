-- Transportistas sin acceso al sistema; la operación sigue bajo una cuenta de operaciones.
CREATE TABLE IF NOT EXISTS external_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) >= 2),
  tax_id text NOT NULL UNIQUE,
  company_name text NOT NULL CHECK (length(trim(company_name)) >= 2),
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS external_driver_id uuid REFERENCES external_drivers(id);
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_driver_exclusive;
ALTER TABLE service_requests ADD CONSTRAINT service_driver_exclusive CHECK (driver_id IS NULL OR external_driver_id IS NULL);
CREATE INDEX IF NOT EXISTS service_external_driver_idx ON service_requests(external_driver_id,scheduled_for);

CREATE TABLE IF NOT EXISTS external_driver_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_driver_id uuid NOT NULL REFERENCES external_drivers(id),
  requirement_id uuid NOT NULL REFERENCES site_requirements(id),
  reference text NOT NULL,
  issued_on date NOT NULL,
  expires_on date NOT NULL,
  state text NOT NULL DEFAULT 'pendiente' CHECK (state IN ('pendiente','verificada','rechazada','revocada')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_note text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_on >= issued_on),
  CHECK ((state='pendiente' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (state<>'pendiente' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS external_credential_idx ON external_driver_credentials(external_driver_id,requirement_id,state,expires_on DESC);
