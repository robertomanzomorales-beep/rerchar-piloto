-- Roberto confirmó el 18/11/2026 que RAM-01 y RAM-001 son la misma rampla HXHY-46.
-- Consolidación puntual, transaccional y con archivo lógico; no elimina historiales.
-- En bases que no contienen esta ficha no modifica activos ni crea una auditoría.
CREATE TEMP TABLE rampla_repair_20261118 (
  source_id uuid NOT NULL,
  target_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  source_before jsonb NOT NULL,
  target_before jsonb NOT NULL,
  approved boolean NOT NULL CHECK (approved)
) ON COMMIT DROP;

INSERT INTO rampla_repair_20261118
SELECT s.id,t.id,(SELECT id FROM users WHERE role='admin' AND active=true ORDER BY created_at,id LIMIT 1),to_jsonb(s),to_jsonb(t),
  s.code='RAM-01' AND t.code='RAM-001' AND s.kind='rampa' AND t.kind='rampa'
  AND regexp_replace(upper(s.plate),'[^A-Z0-9]','','g')='HXHY46'
  AND regexp_replace(upper(t.plate),'[^A-Z0-9]','','g')='HXHY46'
  AND t.deleted_at IS NULL AND s.reading_unit=t.reading_unit
FROM assets s LEFT JOIN assets t ON t.id='20998d30-dcb6-4f60-a594-82c203d119de'
WHERE s.id='172de6e6-9e7c-449f-937c-f7cb3682e342' AND s.deleted_at IS NULL;

SELECT a.id FROM assets a JOIN rampla_repair_20261118 m ON a.id IN (m.source_id,m.target_id) ORDER BY a.id FOR UPDATE OF a;

-- Guardar las claves y referencias originales permite reconstruir los vínculos anteriores.
INSERT INTO audit_events(actor_id,action,entity_type,entity_id,previous_value,next_value)
SELECT m.actor_id,'asset_consolidated','asset',m.target_id,
  jsonb_build_object('source',m.source_before,'target',m.target_before,'references',jsonb_build_object(
    'service_requests',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'assigned_asset_id',r.assigned_asset_id,'ramp_asset_id',r.ramp_asset_id)) FROM service_requests r WHERE r.assigned_asset_id=m.source_id OR r.ramp_asset_id=m.source_id),'[]'::jsonb),
    'fleet_incidents',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'asset_id',r.asset_id)) FROM fleet_incidents r WHERE r.asset_id=m.source_id),'[]'::jsonb),
    'asset_readings',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'asset_id',r.asset_id)) FROM asset_readings r WHERE r.asset_id=m.source_id),'[]'::jsonb),
    'maintenance_plans',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'asset_id',r.asset_id)) FROM maintenance_plans r WHERE r.asset_id=m.source_id),'[]'::jsonb),
    'work_orders',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'asset_id',r.asset_id)) FROM work_orders r WHERE r.asset_id=m.source_id),'[]'::jsonb),
    'fuel_entries',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'asset_id',r.asset_id)) FROM fuel_entries r WHERE r.asset_id=m.source_id),'[]'::jsonb),
    'tires',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'asset_id',r.asset_id)) FROM tires r WHERE r.asset_id=m.source_id),'[]'::jsonb),
    'tire_events',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'asset_id',r.asset_id)) FROM tire_events r WHERE r.asset_id=m.source_id),'[]'::jsonb),
    'client_quote_costings',COALESCE((SELECT jsonb_agg(jsonb_build_object('quote_id',r.quote_id,'asset_id',r.asset_id)) FROM client_quote_costings r WHERE r.asset_id=m.source_id),'[]'::jsonb),
    'asset_equipment_inventory',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'asset_id',r.asset_id)) FROM asset_equipment_inventory r WHERE r.asset_id=m.source_id),'[]'::jsonb),
    'fleet_day_notes',COALESCE((SELECT jsonb_agg(jsonb_build_object('day',r.day,'asset_id',r.asset_id)) FROM fleet_day_notes r WHERE r.asset_id=m.source_id),'[]'::jsonb),
    'service_day_reports',COALESCE((SELECT jsonb_agg(jsonb_build_object('service_id',r.service_id,'day',r.day,'asset_id',r.asset_id)) FROM service_day_reports r WHERE r.asset_id=m.source_id),'[]'::jsonb),
    'asset_documents',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'asset_id',r.asset_id)) FROM asset_documents r WHERE r.asset_id=m.source_id),'[]'::jsonb)
  )),jsonb_build_object('source_id',m.source_id,'target_id',m.target_id,'reason','Misma rampla HXHY-46 confirmada por Roberto Manzo el 18/11/2026','executed_by','deployment_migration_071','source_archived',true)
FROM rampla_repair_20261118 m;

-- Las restricciones existentes abortan toda la operación si hay posiciones o planes incompatibles.
UPDATE service_requests r SET assigned_asset_id=m.target_id FROM rampla_repair_20261118 m WHERE r.assigned_asset_id=m.source_id;
UPDATE service_requests r SET ramp_asset_id=m.target_id FROM rampla_repair_20261118 m WHERE r.ramp_asset_id=m.source_id;
UPDATE fleet_incidents r SET asset_id=m.target_id FROM rampla_repair_20261118 m WHERE r.asset_id=m.source_id;
UPDATE asset_readings r SET asset_id=m.target_id FROM rampla_repair_20261118 m WHERE r.asset_id=m.source_id;
UPDATE maintenance_plans r SET asset_id=m.target_id FROM rampla_repair_20261118 m WHERE r.asset_id=m.source_id;
UPDATE work_orders r SET asset_id=m.target_id FROM rampla_repair_20261118 m WHERE r.asset_id=m.source_id;
UPDATE fuel_entries r SET asset_id=m.target_id FROM rampla_repair_20261118 m WHERE r.asset_id=m.source_id;
UPDATE tires r SET asset_id=m.target_id FROM rampla_repair_20261118 m WHERE r.asset_id=m.source_id;
UPDATE tire_events r SET asset_id=m.target_id FROM rampla_repair_20261118 m WHERE r.asset_id=m.source_id;
UPDATE client_quote_costings r SET asset_id=m.target_id FROM rampla_repair_20261118 m WHERE r.asset_id=m.source_id;
UPDATE asset_equipment_inventory r SET asset_id=m.target_id FROM rampla_repair_20261118 m WHERE r.asset_id=m.source_id;
UPDATE fleet_day_notes r SET asset_id=m.target_id FROM rampla_repair_20261118 m WHERE r.asset_id=m.source_id;
UPDATE service_day_reports r SET asset_id=m.target_id FROM rampla_repair_20261118 m WHERE r.asset_id=m.source_id;
UPDATE asset_documents r SET asset_id=m.target_id FROM rampla_repair_20261118 m WHERE r.asset_id=m.source_id;

UPDATE assets t SET brand=COALESCE(t.brand,s.brand),model=COALESCE(t.model,s.model),
  model_year=COALESCE(t.model_year,s.model_year),current_reading=GREATEST(t.current_reading,s.current_reading),
  available=t.available AND s.available
FROM assets s,rampla_repair_20261118 m WHERE t.id=m.target_id AND s.id=m.source_id;

UPDATE assets s SET available=false,deleted_at=now()
FROM rampla_repair_20261118 m WHERE s.id=m.source_id;

-- Una misma patente física sólo tiene una ficha activa, incluidos cambios de separadores.
CREATE UNIQUE INDEX IF NOT EXISTS assets_active_plate_unique_idx
  ON assets ((regexp_replace(upper(plate),'[^A-Z0-9]','','g')))
  WHERE deleted_at IS NULL AND plate IS NOT NULL AND regexp_replace(upper(plate),'[^A-Z0-9]','','g')<>'';
