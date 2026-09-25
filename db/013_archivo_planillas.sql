-- Archivo de origen consultable; cada versión del Excel conserva sus propias filas.
-- No se crean clientes ni facturas automáticamente a partir de filas ambiguas.
CREATE TABLE IF NOT EXISTS legacy_workbook_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  sha256 text NOT NULL UNIQUE CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  row_count integer NOT NULL DEFAULT 0,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS legacy_workbook_rows (
  source_id uuid NOT NULL REFERENCES legacy_workbook_sources(id),
  sheet_name text NOT NULL,
  row_number integer NOT NULL CHECK (row_number > 0),
  cells jsonb NOT NULL,
  PRIMARY KEY(source_id,sheet_name,row_number)
);
CREATE INDEX IF NOT EXISTS legacy_workbook_rows_sheet_idx ON legacy_workbook_rows(source_id,sheet_name,row_number);
