-- Plazo acordado y responsable de las guías valorizadas de servicios RERCHAR.
ALTER TABLE valued_guide_followups ADD COLUMN IF NOT EXISTS due_on date;
ALTER TABLE valued_guide_followups ADD COLUMN IF NOT EXISTS responsible_user_id uuid REFERENCES users(id);
CREATE INDEX IF NOT EXISTS valued_guide_followups_open_due_idx
  ON valued_guide_followups(due_on,responsible_user_id)
  WHERE requested_on IS NOT NULL AND received_on IS NULL;
