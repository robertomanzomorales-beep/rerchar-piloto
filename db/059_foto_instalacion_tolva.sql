-- Foto opcional vinculada al movimiento que instala o reubica una tolva.
CREATE TABLE IF NOT EXISTS container_movement_photos (
  movement_id uuid PRIMARY KEY REFERENCES container_movements(id),
  filename text NOT NULL,
  mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
  file_content bytea NOT NULL CHECK (octet_length(file_content) BETWEEN 1 AND 4194304),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
