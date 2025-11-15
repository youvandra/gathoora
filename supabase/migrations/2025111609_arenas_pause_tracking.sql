ALTER TABLE arenas ADD COLUMN IF NOT EXISTS creator_paused_secs integer DEFAULT 0;
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS joiner_paused_secs integer DEFAULT 0;
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS creator_paused_at timestamptz;
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS joiner_paused_at timestamptz;
