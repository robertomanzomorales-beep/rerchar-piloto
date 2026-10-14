-- Un hecho de terreno puede originar un cargo por revisar, sin emitir factura ni sumarse a la valorización.
CREATE TABLE IF NOT EXISTS service_extra_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_key uuid NOT NULL UNIQUE,
  service_id uuid NOT NULL REFERENCES service_requests(id),
  service_day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('flete_falso','sobrestadia','otro')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 1000),
  source_outcome text NOT NULL CHECK (source_outcome IN ('completado','incompleto','suspendido')),
  source_observation text NOT NULL,
  amount_clp numeric(14,2) CHECK (amount_clp > 0),
  quote_reference text CHECK (length(quote_reference)<=80),
  client_order_reference text CHECK (length(client_order_reference)<=80),
  status text NOT NULL DEFAULT 'propuesto' CHECK (status IN ('propuesto','aprobado','descartado','facturado')),
  decision_note text,
  invoice_number text,
  invoiced_on date,
  created_by uuid NOT NULL REFERENCES users(id),
  decided_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CONSTRAINT extra_charge_day FOREIGN KEY(service_id,service_day) REFERENCES service_day_reports(service_id,day),
  CONSTRAINT extra_charge_complete CHECK (
    (status='propuesto' AND decided_by IS NULL AND decided_at IS NULL AND invoice_number IS NULL AND invoiced_on IS NULL)
    OR (status='descartado' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_note IS NOT NULL AND length(trim(decision_note))>=5 AND invoice_number IS NULL AND invoiced_on IS NULL)
    OR (status='aprobado' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_note IS NOT NULL AND length(trim(decision_note))>=5 AND amount_clp IS NOT NULL AND amount_clp>0 AND invoice_number IS NULL AND invoiced_on IS NULL)
    OR (status='facturado' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_note IS NOT NULL AND length(trim(decision_note))>=5 AND amount_clp IS NOT NULL AND amount_clp>0 AND invoice_number IS NOT NULL AND length(trim(invoice_number))>=2 AND invoiced_on IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS service_extra_charges_service_idx ON service_extra_charges(service_id,created_at DESC);
CREATE INDEX IF NOT EXISTS service_extra_charges_status_idx ON service_extra_charges(status,service_day DESC);
