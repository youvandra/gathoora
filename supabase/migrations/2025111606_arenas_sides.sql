ALTER TABLE arenas ADD COLUMN IF NOT EXISTS creator_side text CHECK (creator_side IN ('pros','cons'));
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS joiner_side text CHECK (joiner_side IN ('pros','cons'));
