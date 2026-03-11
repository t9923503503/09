-- ═══════════════════════════════════════════════════════════════════════════════
-- SUPABASE MIGRATIONS: Double Elimination Tournament Tables
-- Run these migrations in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ════════════════════════════════════════════════════════════
-- 1. TOURNAMENTS TABLE
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  format TEXT DEFAULT 'DOUBLE_ELIMINATION',
  status TEXT DEFAULT 'seeding',    -- seeding | running | completed

  -- JSON storage of full tournament object
  data JSONB,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,                  -- User ID

  -- Constraints
  CONSTRAINT format_check CHECK (format IN ('DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'PAIRS')),
  CONSTRAINT status_check CHECK (status IN ('seeding', 'running', 'completed'))
);

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_format ON tournaments(format);
CREATE INDEX IF NOT EXISTS idx_tournaments_created_at ON tournaments(created_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read all tournaments
CREATE POLICY tournaments_read_policy
  ON public.tournaments
  FOR SELECT
  USING (true);

-- RLS Policy: Users can create tournaments
CREATE POLICY tournaments_create_policy
  ON public.tournaments
  FOR INSERT
  WITH CHECK (true);

-- ════════════════════════════════════════════════════════════
-- 2. TOURNAMENT TEAMS/PAIRS TABLE
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tournament_teams (
  id TEXT PRIMARY KEY,
  tournament_id TEXT REFERENCES public.tournaments(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  true_skill_index INT NOT NULL,
  seed INT NOT NULL,
  has_bye BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Composite unique constraint (team must be unique within tournament)
  UNIQUE(tournament_id, id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_teams_tournament_id
  ON tournament_teams(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_teams_seed
  ON tournament_teams(tournament_id, seed);

ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY tournament_teams_read_policy
  ON public.tournament_teams
  FOR SELECT
  USING (true);

-- ════════════════════════════════════════════════════════════
-- 3. TOURNAMENT PLAYERS TABLE
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tournament_players (
  id TEXT PRIMARY KEY,
  team_id TEXT REFERENCES public.tournament_teams(id) ON DELETE CASCADE,
  tournament_id TEXT REFERENCES public.tournaments(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  level INT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT level_check CHECK (level >= 1 AND level <= 5)
);

CREATE INDEX IF NOT EXISTS idx_tournament_players_team_id
  ON tournament_players(team_id);
CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament_id
  ON tournament_players(tournament_id);

ALTER TABLE public.tournament_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY tournament_players_read_policy
  ON public.tournament_players
  FOR SELECT
  USING (true);

-- ════════════════════════════════════════════════════════════
-- 4. MATCHES TABLE (Real-time updates)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT REFERENCES public.tournaments(id) ON DELETE CASCADE,

  -- Bracket info
  bracket TEXT NOT NULL,     -- WB | LB | GRAND_FINAL | SUPER_FINAL
  round INT NOT NULL,
  position INT NOT NULL,

  -- Teams
  team_a_id TEXT,            -- Can be NULL if bye
  team_b_id TEXT,            -- Can be NULL if bye

  -- Score & Status
  score_a INT DEFAULT 0,
  score_b INT DEFAULT 0,
  status TEXT DEFAULT 'pending',  -- pending | in_progress | completed
  winner_id TEXT,            -- ID of winning team

  -- Double elimination specific
  is_bye BOOLEAN DEFAULT FALSE,
  upset_alert BOOLEAN DEFAULT FALSE,

  -- References to next matches
  next_match_winner_id TEXT,  -- Format: "matchId:slot" (a/b)
  next_match_loser_id TEXT,   -- Where loser goes (usually to LB)

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT bracket_check CHECK (bracket IN ('WB', 'LB', 'GRAND_FINAL', 'SUPER_FINAL')),
  CONSTRAINT status_check CHECK (status IN ('pending', 'in_progress', 'completed')),
  CONSTRAINT unique_match UNIQUE(tournament_id, bracket, round, position)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id
  ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_bracket
  ON matches(tournament_id, bracket);
CREATE INDEX IF NOT EXISTS idx_matches_status
  ON matches(tournament_id, status);
CREATE INDEX IF NOT EXISTS idx_matches_team_a
  ON matches(tournament_id, team_a_id);
CREATE INDEX IF NOT EXISTS idx_matches_team_b
  ON matches(tournament_id, team_b_id);

-- Enable RLS for real-time
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY matches_read_policy
  ON public.matches
  FOR SELECT
  USING (true);

CREATE POLICY matches_update_policy
  ON public.matches
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ════════════════════════════════════════════════════════════
-- 5. TOURNAMENT HISTORY / AUDIT LOG
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tournament_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id TEXT REFERENCES public.tournaments(id) ON DELETE CASCADE,
  match_id TEXT REFERENCES public.matches(id),

  event_type TEXT NOT NULL,  -- match_completed | team_advanced | etc.

  team_a_id TEXT,
  team_b_id TEXT,
  winner_id TEXT,
  loser_id TEXT,

  score_a INT,
  score_b INT,

  metadata JSONB,            -- Any additional info

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT            -- User who recorded this
);

CREATE INDEX IF NOT EXISTS idx_tournament_history_tournament_id
  ON tournament_history(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_history_match_id
  ON tournament_history(match_id);
CREATE INDEX IF NOT EXISTS idx_tournament_history_created_at
  ON tournament_history(created_at DESC);

-- ════════════════════════════════════════════════════════════
-- 6. REALTIME PUBLICATION
-- ════════════════════════════════════════════════════════════

-- Enable realtime for matches table
ALTER PUBLICATION supabase_realtime ADD TABLE matches;

-- Enable realtime for tournaments table (for status updates)
ALTER PUBLICATION supabase_realtime ADD TABLE tournaments;

-- ════════════════════════════════════════════════════════════
-- 7. UTILITY FUNCTIONS
-- ════════════════════════════════════════════════════════════

-- Function to calculate tournament progress
CREATE OR REPLACE FUNCTION get_tournament_progress(tournament_id TEXT)
RETURNS TABLE (
  total_matches INT,
  completed_matches INT,
  pending_matches INT,
  in_progress_matches INT,
  percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INT as total_matches,
    COUNT(CASE WHEN status = 'completed' THEN 1 END)::INT as completed_matches,
    COUNT(CASE WHEN status = 'pending' THEN 1 END)::INT as pending_matches,
    COUNT(CASE WHEN status = 'in_progress' THEN 1 END)::INT as in_progress_matches,
    ROUND((COUNT(CASE WHEN status = 'completed' THEN 1 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 2) as percentage
  FROM matches
  WHERE matches.tournament_id = get_tournament_progress.tournament_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get tournament bracket structure
CREATE OR REPLACE FUNCTION get_tournament_bracket(tournament_id TEXT)
RETURNS TABLE (
  bracket_type TEXT,
  round_num INT,
  total_matches INT,
  completed_matches INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    matches.bracket,
    matches.round,
    COUNT(*)::INT,
    COUNT(CASE WHEN matches.status = 'completed' THEN 1 END)::INT
  FROM matches
  WHERE matches.tournament_id = get_tournament_bracket.tournament_id
  GROUP BY matches.bracket, matches.round
  ORDER BY matches.bracket, matches.round;
END;
$$ LANGUAGE plpgsql;

-- Function to check for upsets in a tournament
CREATE OR REPLACE FUNCTION get_tournament_upsets(tournament_id TEXT)
RETURNS TABLE (
  match_id TEXT,
  bracket TEXT,
  team_a_name TEXT,
  team_a_seed INT,
  team_b_name TEXT,
  team_b_seed INT,
  winner_name TEXT,
  winner_seed INT,
  score TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.bracket,
    ta.name,
    ta.seed,
    tb.name,
    tb.seed,
    COALESCE(tw.name, 'TBD'),
    COALESCE(tw.seed, 0),
    CONCAT(m.score_a, '-', m.score_b)
  FROM matches m
  LEFT JOIN tournament_teams ta ON m.team_a_id = ta.id
  LEFT JOIN tournament_teams tb ON m.team_b_id = tb.id
  LEFT JOIN tournament_teams tw ON m.winner_id = tw.id
  WHERE m.tournament_id = get_tournament_upsets.tournament_id
    AND m.upset_alert = TRUE
    AND m.status = 'completed'
  ORDER BY m.updated_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════
-- 8. VIEWS
-- ════════════════════════════════════════════════════════════

-- View: Tournament with stats
CREATE OR REPLACE VIEW tournament_stats AS
SELECT
  t.id,
  t.name,
  t.format,
  t.status,
  COUNT(DISTINCT tt.id) as total_teams,
  COUNT(DISTINCT m.id) as total_matches,
  COUNT(CASE WHEN m.status = 'completed' THEN 1 END) as completed_matches,
  COUNT(CASE WHEN m.upset_alert = TRUE AND m.status = 'completed' THEN 1 END) as upset_count,
  t.created_at
FROM tournaments t
LEFT JOIN tournament_teams tt ON t.id = tt.tournament_id
LEFT JOIN matches m ON t.id = m.tournament_id
GROUP BY t.id, t.name, t.format, t.status, t.created_at;

-- View: Current matches (pending or in progress)
CREATE OR REPLACE VIEW active_matches AS
SELECT
  m.id,
  m.tournament_id,
  m.bracket,
  m.round,
  ta.name as team_a_name,
  ta.seed as team_a_seed,
  tb.name as team_b_name,
  tb.seed as team_b_seed,
  m.status,
  m.updated_at
FROM matches m
LEFT JOIN tournament_teams ta ON m.team_a_id = ta.id
LEFT JOIN tournament_teams tb ON m.team_b_id = tb.id
WHERE m.status IN ('pending', 'in_progress')
ORDER BY m.tournament_id, m.bracket, m.round, m.position;

-- ════════════════════════════════════════════════════════════
-- 9. SAMPLE DATA (for testing)
-- ════════════════════════════════════════════════════════════

-- Insert sample tournament
INSERT INTO public.tournaments (id, name, format, status, data)
VALUES (
  't_sample_2026_03_09',
  'Sample Tournament 2026',
  'DOUBLE_ELIMINATION',
  'seeding',
  '{"id":"t_sample_2026_03_09","name":"Sample Tournament 2026","format":"DOUBLE_ELIMINATION"}'
)
ON CONFLICT DO NOTHING;

-- Insert sample teams
INSERT INTO public.tournament_teams (id, tournament_id, name, true_skill_index, seed, has_bye)
VALUES
  ('pair_001', 't_sample_2026_03_09', 'Иван & Петр', 9, 1, true),
  ('pair_002', 't_sample_2026_03_09', 'Сергей & Алексей', 8, 2, true),
  ('pair_003', 't_sample_2026_03_09', 'Виктор & Павел', 8, 3, false),
  ('pair_004', 't_sample_2026_03_09', 'Дмитрий & Игорь', 6, 4, false),
  ('pair_005', 't_sample_2026_03_09', 'Андрей & Констин', 6, 5, false),
  ('pair_006', 't_sample_2026_03_09', 'Борис & Федор', 6, 6, false)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 10. CLEANUP COMMANDS (optional)
-- ════════════════════════════════════════════════════════════

-- To reset sample data (use with caution):
-- DELETE FROM tournaments WHERE id LIKE 't_sample_%';
-- DELETE FROM tournament_teams WHERE id LIKE 'pair_%';
-- DELETE FROM matches WHERE tournament_id LIKE 't_sample_%';
