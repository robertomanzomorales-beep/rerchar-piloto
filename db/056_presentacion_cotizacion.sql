-- Presentación comercial editable, separada del título y las condiciones de cierre.
-- Las propuestas anteriores conservan su PDF sin una reseña inventada.
ALTER TABLE client_quotes ADD COLUMN IF NOT EXISTS company_intro text;
ALTER TABLE client_quotes ADD COLUMN IF NOT EXISTS proposal_objective text;
ALTER TABLE client_quotes ADD CONSTRAINT quote_company_intro_length CHECK (char_length(company_intro)<=700);
ALTER TABLE client_quotes ADD CONSTRAINT quote_proposal_objective_length CHECK (char_length(proposal_objective)<=700);
