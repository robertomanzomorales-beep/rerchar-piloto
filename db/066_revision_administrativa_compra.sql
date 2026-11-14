-- La revisión administrativa de la compra conserva qué documentos y datos se cotejaron
-- al cerrar el pesaje; el ticket puede no haber sido entregado por el cliente.
CREATE TABLE IF NOT EXISTS purchase_closure_reviews (
  service_id uuid PRIMARY KEY REFERENCES service_requests(id),
  guide_evidence_id uuid NOT NULL REFERENCES service_evidence(id),
  sheet_evidence_id uuid NOT NULL REFERENCES service_evidence(id),
  ticket_evidence_id uuid REFERENCES service_evidence(id),
  missing_ticket_reason text,
  material_name text NOT NULL,
  gross_kg numeric(14,2) NOT NULL CHECK (gross_kg > 0),
  tare_kg numeric(14,2) NOT NULL CHECK (tare_kg >= 0 AND tare_kg <= gross_kg),
  impurity_kg numeric(14,2) NOT NULL DEFAULT 0 CHECK (impurity_kg >= 0 AND impurity_kg <= gross_kg - tare_kg),
  observations text,
  reviewed_by uuid NOT NULL REFERENCES users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((ticket_evidence_id IS NOT NULL AND missing_ticket_reason IS NULL)
    OR (ticket_evidence_id IS NULL AND length(trim(missing_ticket_reason)) >= 5))
);
