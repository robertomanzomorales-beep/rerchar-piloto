-- La tarifa anterior conserva la vigencia histórica; el aviso se registra por separado.
CREATE TABLE IF NOT EXISTS tariff_change_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_tariff_id uuid NOT NULL REFERENCES service_tariffs(id),
  new_tariff_id uuid NOT NULL UNIQUE REFERENCES service_tariffs(id),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 500),
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','enviado')),
  notified_on date,
  channel text CHECK (channel IN ('correo','presencial')),
  recipient text,
  reference text,
  recorded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status='pendiente' AND notified_on IS NULL AND channel IS NULL AND recipient IS NULL AND reference IS NULL AND recorded_by IS NULL
    OR status='enviado' AND notified_on IS NOT NULL AND channel IS NOT NULL AND recipient IS NOT NULL AND reference IS NOT NULL AND recorded_by IS NOT NULL)
);
