CREATE TABLE IF NOT EXISTS worker_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  national_id text,
  position text,
  shift text,
  phone text,
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  site_id uuid,
  name text NOT NULL CHECK (length(trim(name)) >= 3),
  kind text NOT NULL CHECK (kind IN ('licencia','curso','examen','acreditacion','otro')),
  warning_days integer NOT NULL DEFAULT 30 CHECK (warning_days BETWEEN 0 AND 365),
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accreditation_site_scope FOREIGN KEY (site_id,client_id) REFERENCES client_sites(id,client_id)
);
CREATE INDEX IF NOT EXISTS requirement_scope_idx ON site_requirements(client_id,site_id,active);

CREATE TABLE IF NOT EXISTS worker_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
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
CREATE INDEX IF NOT EXISTS credential_user_idx ON worker_credentials(user_id,requirement_id,state,expires_on DESC);
