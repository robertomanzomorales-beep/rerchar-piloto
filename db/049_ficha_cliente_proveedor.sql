-- Ficha legal y bancaria entregada por Carol. Un mismo RUT puede ser cliente y proveedor.
CREATE TABLE IF NOT EXISTS counterparty_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid UNIQUE REFERENCES clients(id),
  kind text NOT NULL CHECK (kind IN ('cliente','proveedor','ambos')),
  legal_name text NOT NULL,
  trade_name text,
  tax_id text NOT NULL UNIQUE,
  business_activity text NOT NULL,
  industry text,
  legal_address text NOT NULL,
  locality text NOT NULL,
  phone text NOT NULL,
  general_email text NOT NULL,
  website text,
  tax_status text NOT NULL CHECK (tax_status IN ('afecto','exento','otro')),
  legal_representative text NOT NULL,
  invoice_email text NOT NULL,
  payment_terms text NOT NULL CHECK (payment_terms IN ('contado','7','15','30')),
  requires_oc boolean NOT NULL DEFAULT false,
  requires_hes boolean NOT NULL DEFAULT false,
  requires_edp boolean NOT NULL DEFAULT false,
  edp_email text,
  bank_name text,
  account_type text,
  account_number text,
  account_holder text,
  account_holder_tax_id text,
  currency text,
  proof_email text,
  swift_iban text,
  bank_notes text,
  contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','verificada')),
  verified_by uuid REFERENCES users(id),
  verified_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT counterparty_client_kind CHECK (kind='proveedor' OR client_id IS NOT NULL),
  CONSTRAINT counterparty_supplier_bank CHECK (kind='cliente' OR
    (bank_name IS NOT NULL AND account_type IS NOT NULL AND account_number IS NOT NULL
      AND account_holder IS NOT NULL AND account_holder_tax_id IS NOT NULL AND proof_email IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS counterparty_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES counterparty_profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('rut_empresa','certificado_bancario','carpeta_tributaria')),
  filename text NOT NULL,
  mime text NOT NULL,
  content bytea NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id,kind)
);

ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS supplier_profile_id uuid REFERENCES counterparty_profiles(id);
CREATE INDEX IF NOT EXISTS supplier_invoices_profile_idx ON supplier_invoices(supplier_profile_id)
  WHERE supplier_profile_id IS NOT NULL;
