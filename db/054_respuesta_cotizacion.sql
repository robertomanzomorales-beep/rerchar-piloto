-- Enlace de respuesta único; sólo se almacena el hash y nunca el token del correo.
CREATE TABLE IF NOT EXISTS quote_response_tokens (
  quote_id uuid PRIMARY KEY REFERENCES client_quotes(id),
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash)=64),
  recipient text NOT NULL,
  issued_by uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
