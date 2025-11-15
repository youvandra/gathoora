ALTER TABLE arenas ADD COLUMN IF NOT EXISTS creator_writing_status text CHECK (creator_writing_status IN ('idle','writing','paused','finished')) DEFAULT 'idle';
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS joiner_writing_status text CHECK (joiner_writing_status IN ('idle','writing','paused','finished')) DEFAULT 'idle';
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS creator_writing_started_at timestamptz;
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS joiner_writing_started_at timestamptz;
