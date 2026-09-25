CREATE TABLE IF NOT EXISTS warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(trim(name)) >= 2),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(trim(name)) >= 2),
  unit text NOT NULL CHECK (unit IN ('un','kg','lt','m','m3')),
  minimum_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK (minimum_qty >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_balances (
  item_id uuid NOT NULL REFERENCES stock_items(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved numeric(14,3) NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= quantity),
  PRIMARY KEY (item_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  submission_key uuid NOT NULL UNIQUE,
  title text NOT NULL CHECK (length(trim(title)) >= 3),
  category text NOT NULL CHECK (category IN ('repuestos','insumos','seguridad','servicios','otros')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','alta','critica')),
  status text NOT NULL DEFAULT 'solicitada' CHECK (status IN ('solicitada','aprobada','ordenada','parcial','recibida','cancelada')),
  notes text,
  supplier text,
  order_reference text,
  expected_date date,
  requested_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_status_idx ON purchase_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES purchase_requests(id),
  item_id uuid NOT NULL REFERENCES stock_items(id),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  received_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK (received_qty >= 0 AND received_qty <= quantity),
  UNIQUE (request_id, item_id)
);

CREATE TABLE IF NOT EXISTS purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_key uuid NOT NULL UNIQUE,
  request_id uuid NOT NULL REFERENCES purchase_requests(id),
  line_id uuid NOT NULL REFERENCES purchase_lines(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  guide_number text NOT NULL CHECK (length(trim(guide_number)) > 0),
  invoice_number text,
  payment_status text NOT NULL DEFAULT 'pendiente' CHECK (payment_status IN ('pendiente','pagada')),
  recorded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS receipt_request_idx ON purchase_receipts(request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES stock_items(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'activa' CHECK (status IN ('activa','liberada','consumida')),
  reason text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  closed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS reservation_status_idx ON inventory_reservations(status, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES stock_items(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  kind text NOT NULL CHECK (kind IN ('recepcion','ajuste_entrada','ajuste_salida','transferencia_entrada','transferencia_salida','reserva','liberacion','consumo')),
  qty_delta numeric(14,3) NOT NULL DEFAULT 0,
  reserved_delta numeric(14,3) NOT NULL DEFAULT 0,
  note text NOT NULL,
  purchase_receipt_id uuid UNIQUE REFERENCES purchase_receipts(id),
  reservation_id uuid REFERENCES inventory_reservations(id),
  transfer_group uuid,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (qty_delta <> 0 OR reserved_delta <> 0)
);
CREATE INDEX IF NOT EXISTS movements_kardex_idx ON inventory_movements(item_id, warehouse_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS purchase_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES purchase_requests(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_events_idx ON purchase_events(request_id, created_at DESC, id DESC);
