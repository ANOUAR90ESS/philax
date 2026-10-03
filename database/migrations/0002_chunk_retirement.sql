-- 0002: Retire knowledge chunks instead of deleting them, so that citations in
-- existing debates keep pointing at the exact text that was shown. Retrieval
-- only considers active chunks.
ALTER TABLE source_chunks ADD COLUMN retired_at TIMESTAMPTZ;
CREATE INDEX source_chunks_active_idx ON source_chunks (source_id) WHERE retired_at IS NULL;
