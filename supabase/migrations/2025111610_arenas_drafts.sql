ALTER TABLE arenas ADD COLUMN IF NOT EXISTS creator_draft_text text;
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS joiner_draft_text text;
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS creator_draft_agent_name text;
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS joiner_draft_agent_name text;
