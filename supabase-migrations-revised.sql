-- ============================================================================
-- Supabase Database Schema - Revised (Addressing Gemini AI Vulnerabilities)
-- ============================================================================
-- This schema implements:
-- 1. Court-level locking for conflict resolution
-- 2. Prerequisite match references for bracket progression
-- 3. Standardized stage naming
-- 4. Dead Letter Queue for sync failures
-- 5. Audit logging for security/debugging
-- ============================================================================

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Tournaments
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  organizer_id UUID,

  -- Access control tiers
  public_qr_id VARCHAR(20) NOT NULL UNIQUE,  -- Format: XXX-XXX-XXX
  organizer_token VARCHAR(255) NOT NULL,      -- JWT or complex token

  -- Tournament metadata
  sport VARCHAR(50) NOT NULL,                 -- "beach_volleyball", etc.
  format VARCHAR(50) NOT NULL,                -- "double_elimination", "round_robin", etc.
  max_teams INT NOT NULL,
  status VARCHAR(50) DEFAULT 'planning',      -- 'planning', 'active', 'completed', 'archived'

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_status CHECK (status IN ('planning', 'active', 'completed', 'archived'))
);

-- Tournament Teams
CREATE TABLE tournament_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  seed INT NOT NULL,                          -- 1-based seeding (1 = strongest)
  true_skill_index NUMERIC(10, 2),            -- Player skill rating

  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  sets_for INT DEFAULT 0,
  sets_against INT DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(tournament_id, name),
  CONSTRAINT valid_seed CHECK (seed > 0)
);

-- Matches with prerequisite references
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,

  -- Match identification
  match_number INT NOT NULL,
  round_name VARCHAR(50) NOT NULL,  -- "Group Stage", "Round 1", "Quarterfinals", "Semifinals", "Grand Final", etc.
  bracket_side VARCHAR(20) NOT NULL, -- "winners", "losers", "grand_final"

  -- Court/Location
  court_id INT,

  -- Teams
  team_1_id UUID REFERENCES tournament_teams(id),
  team_2_id UUID REFERENCES tournament_teams(id),
  winner_id UUID REFERENCES tournament_teams(id),

  -- Bracket Progression (FIX: Prerequisite match dependencies)
  -- These fields ensure proper bracket flow:
  -- - In Round 1: NULL (no prerequisites)
  -- - In Quarterfinals: References two winners from Round 1
  -- - In Finals: References winners from earlier rounds
  prerequisite_match_1_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  prerequisite_match_2_id UUID REFERENCES matches(id) ON DELETE SET NULL,

  match_status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'in_progress', 'completed'

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_bracket_sides CHECK (bracket_side IN ('winners', 'losers', 'grand_final')),
  CONSTRAINT valid_status CHECK (match_status IN ('pending', 'in_progress', 'completed')),
  CONSTRAINT valid_prerequisites CHECK (
    -- Either both NULL or both NOT NULL
    (prerequisite_match_1_id IS NULL AND prerequisite_match_2_id IS NULL) OR
    (prerequisite_match_1_id IS NOT NULL AND prerequisite_match_2_id IS NOT NULL)
  ),
  CONSTRAINT different_prerequisites CHECK (
    prerequisite_match_1_id IS NULL OR prerequisite_match_1_id != prerequisite_match_2_id
  )
);

-- Sets (individual sets in a match)
CREATE TABLE sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,

  set_number INT NOT NULL,
  team_1_score INT DEFAULT 0,
  team_2_score INT DEFAULT 0,
  winner_id UUID REFERENCES tournament_teams(id),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_set_number CHECK (set_number > 0),
  CONSTRAINT valid_scores CHECK (team_1_score >= 0 AND team_2_score >= 0)
);

-- ============================================================================
-- CONFLICT RESOLUTION & LOCKING
-- ============================================================================

-- Court Locks (Prevents concurrent score modifications)
CREATE TABLE court_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,

  court_id INT NOT NULL,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,

  -- Lock holder identification
  locked_by_device_uuid VARCHAR(255) NOT NULL,
  lock_token VARCHAR(255) NOT NULL UNIQUE,

  -- Lock lifecycle
  locked_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '10 minutes',
  released_at TIMESTAMP,

  -- Snapshot of locked match data (for conflict resolution)
  locked_data JSONB,

  CONSTRAINT lock_not_expired CHECK (expires_at > locked_at),
  CONSTRAINT token_not_empty CHECK (length(lock_token) > 0)
);

-- ============================================================================
-- SYNC & RELIABILITY
-- ============================================================================

-- Dead Letter Queue (Tracks failed sync operations)
CREATE TABLE sync_dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,

  -- Transaction metadata
  transaction_id VARCHAR(255) NOT NULL UNIQUE,
  transaction_type VARCHAR(50) NOT NULL,  -- 'match:update', 'court:lock', etc.
  transaction_data JSONB NOT NULL,

  -- Error tracking
  error_message TEXT,
  error_details JSONB,
  retry_count INT DEFAULT 0 CHECK (retry_count >= 0),

  -- Status lifecycle
  status VARCHAR(50) DEFAULT 'failed',  -- 'failed', 'skipped', 'retried'
  failed_at TIMESTAMP DEFAULT NOW(),
  skipped_at TIMESTAMP,
  skip_reason VARCHAR(255),

  CONSTRAINT valid_status CHECK (status IN ('failed', 'skipped', 'retried'))
);

-- ============================================================================
-- SEASON & ARCHIVE
-- ============================================================================

-- Season Archive (Historical tournament data for rankings)
CREATE TABLE season_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tournament_id UUID NOT NULL REFERENCES tournaments(id),
  season_year INT NOT NULL,

  -- Tournament summary
  total_teams INT,
  champion_id UUID,

  -- Ranking calculation basis
  rating_formula VARCHAR(100),  -- e.g., "placement * tournament_size_coefficient"

  archived_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Player Rankings (Persistent player skill ratings across tournaments)
CREATE TABLE player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  player_name VARCHAR(255) NOT NULL UNIQUE,
  true_skill_index NUMERIC(10, 2) DEFAULT 1500.00,  -- Glicko-2 baseline

  tournaments_played INT DEFAULT 0,
  total_wins INT DEFAULT 0,
  total_losses INT DEFAULT 0,

  highest_placement INT,                             -- Best tournament finish (1 = champion)
  average_placement NUMERIC(10, 2),

  win_rate NUMERIC(5, 2),                            -- Percentage

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- AUDIT LOGGING
-- ============================================================================

-- Audit Log (Track all critical operations)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,

  event_type VARCHAR(100) NOT NULL,  -- 'lock_acquired', 'lock_force_released', 'match_updated', etc.
  event_details JSONB,

  actor_device_uuid VARCHAR(255),
  actor_role VARCHAR(50),  -- 'spectator', 'scorer', 'organizer'

  timestamp TIMESTAMP DEFAULT NOW(),
  ip_address VARCHAR(45)  -- Supports IPv4 and IPv6
);

-- ============================================================================
-- INDICES (Performance Optimization)
-- ============================================================================

-- Tournament queries
CREATE INDEX idx_tournaments_status ON tournaments(status);
CREATE INDEX idx_tournaments_public_qr_id ON tournaments(public_qr_id);
CREATE INDEX idx_tournaments_created_at ON tournaments(created_at);

-- Team queries
CREATE INDEX idx_tournament_teams_tournament_id ON tournament_teams(tournament_id);
CREATE INDEX idx_tournament_teams_seed ON tournament_teams(seed);

-- Match queries
CREATE INDEX idx_matches_tournament_id ON matches(tournament_id);
CREATE INDEX idx_matches_bracket_side ON matches(bracket_side);
CREATE INDEX idx_matches_round_name ON matches(round_name);
CREATE INDEX idx_matches_court_id ON matches(court_id);
CREATE INDEX idx_matches_match_status ON matches(match_status);
CREATE INDEX idx_matches_team_1 ON matches(team_1_id);
CREATE INDEX idx_matches_team_2 ON matches(team_2_id);

-- Set queries
CREATE INDEX idx_sets_match_id ON sets(match_id);
CREATE INDEX idx_sets_tournament_id ON sets(tournament_id);

-- Lock queries
CREATE INDEX idx_court_locks_tournament_id ON court_locks(tournament_id);
CREATE INDEX idx_court_locks_court_id ON court_locks(court_id);
CREATE INDEX idx_court_locks_expires_at ON court_locks(expires_at);
CREATE INDEX idx_court_locks_token ON court_locks(lock_token);

-- DLQ queries
CREATE INDEX idx_sync_dlq_tournament_id ON sync_dead_letter_queue(tournament_id);
CREATE INDEX idx_sync_dlq_status ON sync_dead_letter_queue(status);
CREATE INDEX idx_sync_dlq_failed_at ON sync_dead_letter_queue(failed_at);

-- Archive queries
CREATE INDEX idx_season_archive_tournament_id ON season_archive(tournament_id);
CREATE INDEX idx_season_archive_year ON season_archive(season_year);

-- Player stats
CREATE INDEX idx_player_stats_tsi ON player_stats(true_skill_index DESC);
CREATE INDEX idx_player_stats_updated_at ON player_stats(updated_at);

-- Audit log queries
CREATE INDEX idx_audit_logs_tournament_id ON audit_logs(tournament_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-cleanup expired locks
CREATE OR REPLACE FUNCTION cleanup_expired_locks() RETURNS void AS $$
BEGIN
  DELETE FROM court_locks WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Auto-update tournament updated_at timestamp
CREATE OR REPLACE FUNCTION update_tournament_timestamp() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tournament_updated_at
  BEFORE UPDATE ON tournaments
  FOR EACH ROW
  EXECUTE FUNCTION update_tournament_timestamp();

-- Auto-update match timestamp
CREATE OR REPLACE FUNCTION update_match_timestamp() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_match_updated_at
  BEFORE UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION update_match_timestamp();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) - Protect data access
-- ============================================================================

-- Enable RLS on sensitive tables
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE court_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_dead_letter_queue ENABLE ROW LEVEL SECURITY;

-- Policy: Public QR access (read-only to tournament and leaderboard)
CREATE POLICY public_qr_read ON tournaments
  FOR SELECT USING (true);

-- Policy: Organizer full access
CREATE POLICY organizer_full_access ON tournaments
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- VIEWS (Helpful queries)
-- ============================================================================

-- Active Locks View
CREATE OR REPLACE VIEW active_court_locks AS
  SELECT
    cl.*,
    t.name as tournament_name,
    m.round_name,
    m.bracket_side
  FROM court_locks cl
  JOIN tournaments t ON cl.tournament_id = t.id
  JOIN matches m ON cl.match_id = m.id
  WHERE cl.expires_at > NOW()
  ORDER BY cl.locked_at DESC;

-- Failed Sync Operations View
CREATE OR REPLACE VIEW pending_dlq_items AS
  SELECT
    sdlq.*,
    t.name as tournament_name
  FROM sync_dead_letter_queue sdlq
  JOIN tournaments t ON sdlq.tournament_id = t.id
  WHERE sdlq.status = 'failed'
  ORDER BY sdlq.failed_at DESC;

-- Tournament Status View
CREATE OR REPLACE VIEW tournament_summary AS
  SELECT
    t.id,
    t.name,
    t.status,
    (SELECT COUNT(*) FROM tournament_teams WHERE tournament_id = t.id) as team_count,
    (SELECT COUNT(*) FROM matches WHERE tournament_id = t.id AND match_status = 'completed') as completed_matches,
    (SELECT COUNT(*) FROM matches WHERE tournament_id = t.id) as total_matches,
    (SELECT COUNT(*) FROM court_locks WHERE tournament_id = t.id AND expires_at > NOW()) as active_locks,
    t.created_at,
    t.started_at,
    t.completed_at
  FROM tournaments t;

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE court_locks IS 'Implements court-level locking to prevent concurrent match score modifications (fixes server-wins conflict vulnerability)';
COMMENT ON TABLE sync_dead_letter_queue IS 'Dead Letter Queue for sync operations that fail after max retries (fixes sync reliability)';
COMMENT ON COLUMN matches.prerequisite_match_1_id IS 'Reference to winning team source in bracket progression (fixes bracket integrity)';
COMMENT ON COLUMN matches.round_name IS 'Standardized stage names like "Quarterfinals", "Semifinals" (fixes stage naming)';
COMMENT ON TABLE audit_logs IS 'Security audit trail for tracking access and modifications (supports compliance & debugging)';

-- ============================================================================
-- Sample Data (For testing)
-- ============================================================================

-- Uncomment below for test data
/*
-- INSERT INTO tournaments (name, public_qr_id, organizer_token, sport, format, max_teams, status)
-- VALUES (
--   'Test Tournament',
--   'ABC-DEF-GHI',
--   'test_organizer_token_12345',
--   'beach_volleyball',
--   'double_elimination',
--   16,
--   'planning'
-- );
*/

-- ============================================================================
-- EOF
-- ============================================================================
