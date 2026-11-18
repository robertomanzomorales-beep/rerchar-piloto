CREATE TABLE IF NOT EXISTS sii_company_settings (
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  company text PRIMARY KEY CHECK (company IN ('rerchar','e_y_j')),
  tax_id text UNIQUE,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO sii_company_settings(company) VALUES('rerchar'),('e_y_j') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS sii_xml_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company text NOT NULL REFERENCES sii_company_settings(company),
  sha256 text NOT NULL,
  original_filename text NOT NULL,
  original_xml bytea NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company,sha256),
  UNIQUE(id,company)
);

CREATE TABLE IF NOT EXISTS sii_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company text NOT NULL REFERENCES sii_company_settings(company),
  direction text NOT NULL CHECK (direction IN ('emitido','recibido')),
  document_type integer NOT NULL CHECK (document_type IN (33,34,56,61)),
  folio text NOT NULL,
  issued_on date NOT NULL,
  due_on date,
  issuer_tax_id text NOT NULL,
  issuer_name text NOT NULL,
  receiver_tax_id text NOT NULL,
  receiver_name text NOT NULL,
  net_clp numeric(14,0) NOT NULL CHECK (net_clp>=0),
  exempt_clp numeric(14,0) NOT NULL CHECK (exempt_clp>=0),
  vat_clp numeric(14,0) NOT NULL CHECK (vat_clp>=0),
  total_clp numeric(14,0) NOT NULL CHECK (total_clp>=0),
  totals_match boolean NOT NULL,
  document_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL CHECK (source='xml'),
  source_sha256 text NOT NULL,
  payload_sha256 text NOT NULL,
  source_id uuid NOT NULL,
  review_status text NOT NULL DEFAULT 'pendiente' CHECK (review_status IN ('pendiente','revisado')),
  review_note text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company,direction,issuer_tax_id,document_type,folio),
  FOREIGN KEY(source_id,company) REFERENCES sii_xml_sources(id,company),
  CHECK (due_on IS NULL OR due_on>=issued_on),
  CHECK ((review_status='pendiente' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (review_status='revisado' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS sii_documents_list_idx ON sii_documents(company,direction,issued_on DESC,created_at DESC,id);
