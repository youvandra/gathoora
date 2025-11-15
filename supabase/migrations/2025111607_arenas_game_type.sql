ALTER TABLE arenas ADD COLUMN IF NOT EXISTS game_type text CHECK (game_type IN ('import','challenge')) DEFAULT 'import';
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS challenge_minutes integer;
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS challenge_started_at timestamptz;
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS creator_knowledge_submitted boolean DEFAULT false;
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS joiner_knowledge_submitted boolean DEFAULT false;
