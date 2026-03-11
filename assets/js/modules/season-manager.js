/**
 * Season Manager Module
 * Handles tournament archiving, player rating calculations, and leaderboard data
 * Supports hybrid storage: localStorage + Supabase sync
 */

class SeasonManager {
  constructor(eventBus, i18n, persistence, supabaseClient = null) {
    this.eventBus = eventBus;
    this.i18n = i18n;
    this.persistence = persistence;
    this.supabaseClient = supabaseClient;

    this.archive = [];
    this.playerStats = new Map();

    this.setupEventListeners();
  }

  /**
   * Setup event listeners for tournament completion and other events
   */
  setupEventListeners() {
    this.eventBus.on('tournament:complete', (data) => {
      this.completeTournament(data.tournament);
    });
  }

  /**
   * ═══════════════════════════════════════════════════
   * TOURNAMENT COMPLETION & ARCHIVING
   * ═══════════════════════════════════════════════════
   */

  /**
   * Complete tournament and archive it
   * Called when grand final is complete and tournament is finished
   * @param {Object} tournament - Current tournament state
   * @returns {Object} Archive entry
   */
  completeTournament(tournament) {
    if (!tournament || !tournament.bracket) {
      console.error('Invalid tournament state');
      return null;
    }

    // Calculate final standings
    const finalStandings = this.calculateFinalStandings(tournament);

    // Create archive entry
    const archiveEntry = {
      id: this.generateTournamentId(),
      date: new Date().toISOString(),
      name: tournament.name || 'Tournament',
      numberOfTeams: tournament.teams ? tournament.teams.length : 0,
      finalStandings: finalStandings,
      allMatches: this.extractAllMatches(tournament)
    };

    // Save to archive
    this.archive.push(archiveEntry);
    this.persistence.saveArchive(this.archive);

    // Update player stats for each participant
    this.updatePlayerStats(finalStandings);
    this.persistence.savePlayerStats(this.playerStats);

    // Attempt to sync with Supabase if available
    if (this.supabaseClient) {
      this.syncArchiveToSupabase(archiveEntry).catch(err => {
        console.warn('Supabase sync failed, but data saved locally:', err);
      });
    }

    // Emit event
    this.eventBus.emit('tournament:archived', { archiveEntry });

    return archiveEntry;
  }

  /**
   * Calculate final standings from tournament bracket
   * Determines placement based on double elimination results
   * @param {Object} tournament - Tournament instance
   * @returns {Array} Standings array with player info and points
   */
  calculateFinalStandings(tournament) {
    const standings = [];

    // Helper: get team from tournament
    const getTeam = (teamId) => {
      if (!teamId) return null;
      return tournament.teams.find(t => t.id === teamId);
    };

    // Extract bracket structure
    const bracket = tournament.bracket;
    if (!bracket) return standings;

    // 1st Place: Grand Final Winner
    if (bracket.grand_final && bracket.grand_final.winner_id) {
      const team = getTeam(bracket.grand_final.winner_id);
      if (team) {
        standings.push({
          rank: 1,
          pairId: team.id,
          playerM: team.male || 'Unknown',
          playerF: team.female || 'Unknown',
          wins: this.countTeamWins(tournament, team.id),
          losses: this.countTeamLosses(tournament, team.id),
          points: 0 // Will be calculated below
        });
      }

      // 2nd Place: Grand Final Loser
      const loserTeamId = bracket.grand_final.team_a_id === bracket.grand_final.winner_id
        ? bracket.grand_final.team_b_id
        : bracket.grand_final.team_a_id;

      const loserTeam = getTeam(loserTeamId);
      if (loserTeam) {
        standings.push({
          rank: 2,
          pairId: loserTeam.id,
          playerM: loserTeam.male || 'Unknown',
          playerF: loserTeam.female || 'Unknown',
          wins: this.countTeamWins(tournament, loserTeam.id),
          losses: this.countTeamLosses(tournament, loserTeam.id),
          points: 0
        });
      }
    }

    // 3rd-4th Place: LB Winners (simplified)
    // In full implementation, would extract from loser's bracket
    if (bracket.loser_final && bracket.loser_final.winner_id) {
      const team = getTeam(bracket.loser_final.winner_id);
      if (team) {
        standings.push({
          rank: 3,
          pairId: team.id,
          playerM: team.male || 'Unknown',
          playerF: team.female || 'Unknown',
          wins: this.countTeamWins(tournament, team.id),
          losses: this.countTeamLosses(tournament, team.id),
          points: 0
        });
      }
    }

    // Fill remaining teams (those eliminated)
    const placedTeamIds = standings.map(s => s.pairId);
    const remainingTeams = tournament.teams.filter(t => !placedTeamIds.includes(t.id));

    remainingTeams.forEach((team, idx) => {
      standings.push({
        rank: standings.length + 1,
        pairId: team.id,
        playerM: team.male || 'Unknown',
        playerF: team.female || 'Unknown',
        wins: this.countTeamWins(tournament, team.id),
        losses: this.countTeamLosses(tournament, team.id),
        points: 0
      });
    });

    // Calculate points for each placement
    standings.forEach((entry) => {
      entry.points = this.calculatePlacementPoints(
        entry.rank,
        tournament.teams.length
      );
    });

    return standings;
  }

  /**
   * Count wins for a team across all matches
   */
  countTeamWins(tournament, teamId) {
    if (!tournament.matches) return 0;
    return Object.values(tournament.matches).filter(
      m => m.winner_id === teamId && m.status === 'completed'
    ).length;
  }

  /**
   * Count losses for a team across all matches
   */
  countTeamLosses(tournament, teamId) {
    if (!tournament.matches) return 0;
    return Object.values(tournament.matches).filter(
      m => m.status === 'completed' &&
           (m.team_a_id === teamId || m.team_b_id === teamId) &&
           m.winner_id !== teamId
    ).length;
  }

  /**
   * Adaptive rating formula
   * Points = Base placement points × Tournament size coefficient
   * Larger tournaments = more points
   * @param {number} placement - 1-indexed placement (1st, 2nd, 3rd, etc.)
   * @param {number} tournamentSize - Total number of teams
   * @returns {number} Points earned for this placement
   */
  calculatePlacementPoints(placement, tournamentSize) {
    // Base points by placement
    let basePoints = 10; // participation minimum

    if (placement === 1) basePoints = 100;
    else if (placement === 2) basePoints = 80;
    else if (placement === 3) basePoints = 60;
    else if (placement <= 4) basePoints = 50;
    else if (placement <= 8) basePoints = 30;
    else if (placement <= 16) basePoints = 20;

    // Tournament size coefficient
    // 8 teams = 1.0x, 16 teams = 1.25x, 32 teams = 1.5x
    const normalizedSize = Math.max(8, tournamentSize);
    const sizeCoefficient = 1 + (Math.log2(normalizedSize) - 3) * 0.125;

    return Math.round(basePoints * sizeCoefficient);
  }

  /**
   * Update player statistics after tournament completion
   * Tracks both male and female players separately
   * @param {Array} finalStandings - Final tournament standings with player info
   */
  updatePlayerStats(finalStandings) {
    finalStandings.forEach((standing) => {
      this.updatePlayerRecord(standing.playerM, standing, 'M');
      this.updatePlayerRecord(standing.playerF, standing, 'F');
    });
  }

  /**
   * Update individual player record with tournament results
   * @param {string} playerName - Player name
   * @param {Object} standing - Standing object with rank, wins, losses, points
   * @param {string} gender - 'M' or 'F'
   */
  updatePlayerRecord(playerName, standing, gender = null) {
    if (!playerName || playerName === 'Unknown') return;

    const key = playerName;

    if (!this.playerStats.has(key)) {
      this.playerStats.set(key, {
        name: playerName,
        gender: gender,
        totalPoints: 0,
        wins: 0,
        losses: 0,
        participations: 0,
        winRate: 0,
        tournaments: [],
        bestPlacement: null,
        avgPointsPerTournament: 0
      });
    }

    const stats = this.playerStats.get(key);

    // Update counters
    stats.totalPoints += standing.points;
    stats.wins += standing.wins;
    stats.losses += standing.losses;
    stats.participations += 1;

    // Calculate win rate
    const totalMatches = stats.wins + stats.losses;
    stats.winRate = totalMatches > 0 ? stats.wins / totalMatches : 0;

    // Track best placement
    if (stats.bestPlacement === null || standing.rank < stats.bestPlacement) {
      stats.bestPlacement = standing.rank;
    }

    // Calculate average points per tournament
    stats.avgPointsPerTournament = Math.round(
      stats.totalPoints / stats.participations
    );

    // Add to tournament history (keep last 10)
    stats.tournaments.unshift({
      rank: standing.rank,
      points: standing.points,
      wins: standing.wins,
      losses: standing.losses,
      date: new Date().toISOString()
    });

    if (stats.tournaments.length > 10) {
      stats.tournaments.pop();
    }
  }

  /**
   * Extract all matches from tournament for archive
   * @param {Object} tournament - Tournament instance
   * @returns {Array} Match results
   */
  extractAllMatches(tournament) {
    const matches = [];

    if (!tournament.matches) return matches;

    Object.values(tournament.matches).forEach((match) => {
      if (match.status === 'completed') {
        const team_a = tournament.teams.find(t => t.id === match.team_a_id);
        const team_b = tournament.teams.find(t => t.id === match.team_b_id);

        matches.push({
          id: match.id,
          bracket: match.bracket,
          round: match.round,
          team_a_id: match.team_a_id,
          team_a_name: team_a ? `${team_a.male} & ${team_a.female}` : 'Unknown',
          team_b_id: match.team_b_id,
          team_b_name: team_b ? `${team_b.male} & ${team_b.female}` : 'Unknown',
          score_a: match.score_a,
          score_b: match.score_b,
          winner_id: match.winner_id,
          timestamp: match.timestamp || new Date().toISOString()
        });
      }
    });

    return matches;
  }

  /**
   * Generate unique tournament ID
   * Format: t_YYYY_MM_DD_XXX (XXX = counter for that day)
   * @returns {string} Tournament ID
   */
  generateTournamentId() {
    const date = new Date();
    const dateStr = `${date.getFullYear()}_${String(date.getMonth() + 1).padStart(2, '0')}_${String(date.getDate()).padStart(2, '0')}`;

    const counter = this.archive.filter(
      t => t.id.startsWith(`t_${dateStr}`)
    ).length;

    return `t_${dateStr}_${String(counter + 1).padStart(3, '0')}`;
  }

  /**
   * ═══════════════════════════════════════════════════
   * LEADERBOARD QUERIES
   * ═══════════════════════════════════════════════════
   */

  /**
   * Get leaderboard for current season with sorting and filtering
   * @param {Object} options - Query options
   *   - sortBy: 'points'|'wins'|'winRate'|'placement' (default: 'points')
   *   - limit: number (default: 100)
   *   - gender: 'M'|'F'|'all' (default: 'all')
   * @returns {Array} Ranked players
   */
  getLeaderboard(options = {}) {
    const {
      sortBy = 'points',
      limit = 100,
      gender = 'all'
    } = options;

    let players = Array.from(this.playerStats.values()).map((stats) => ({
      ...stats,
      rank: 0
    }));

    // Filter by gender if specified
    if (gender !== 'all') {
      players = players.filter(p => p.gender === gender);
    }

    // Sort by selected criterion
    players.sort((a, b) => {
      switch (sortBy) {
        case 'points':
          return b.totalPoints - a.totalPoints;
        case 'wins':
          return b.wins - a.wins;
        case 'winRate':
          return b.winRate - a.winRate;
        case 'placement':
          return (a.bestPlacement || Infinity) - (b.bestPlacement || Infinity);
        default:
          return b.totalPoints - a.totalPoints;
      }
    });

    // Add ranks after sorting
    players.forEach((p, idx) => {
      p.rank = idx + 1;
    });

    return players.slice(0, limit);
  }

  /**
   * Get player tournament history
   * @param {string} playerName
   * @returns {Array} Last 10 tournaments for this player
   */
  getPlayerHistory(playerName) {
    const stats = this.playerStats.get(playerName);
    return stats ? stats.tournaments : [];
  }

  /**
   * Get average points per tournament
   * @param {string} playerName
   * @returns {number}
   */
  getAveragePointsPerTournament(playerName) {
    const stats = this.playerStats.get(playerName);
    if (!stats) return 0;
    return stats.avgPointsPerTournament;
  }

  /**
   * Get player stats object
   * @param {string} playerName
   * @returns {Object|null}
   */
  getPlayerStats(playerName) {
    return this.playerStats.get(playerName) || null;
  }

  /**
   * ═══════════════════════════════════════════════════
   * SUPABASE SYNC
   * ═══════════════════════════════════════════════════
   */

  /**
   * Sync tournament archive to Supabase
   * Non-blocking: errors are logged but don't affect local operation
   * @param {Object} archiveEntry - Tournament archive entry
   * @returns {Promise<void>}
   */
  async syncArchiveToSupabase(archiveEntry) {
    if (!this.supabaseClient) return;

    try {
      const { error } = await this.supabaseClient
        .from('tournaments')
        .insert([{
          id: archiveEntry.id,
          date: archiveEntry.date,
          name: archiveEntry.name,
          number_of_teams: archiveEntry.numberOfTeams,
          standings: archiveEntry.finalStandings,
          all_matches: archiveEntry.allMatches
        }]);

      if (error) {
        console.error('Failed to sync tournament to Supabase:', error);
      } else {
        console.log(`Tournament ${archiveEntry.id} synced to Supabase`);
      }
    } catch (err) {
      console.error('Supabase sync error:', err);
    }
  }

  /**
   * Sync all player stats to Supabase
   * Non-blocking
   * @returns {Promise<void>}
   */
  async syncPlayerStatsToSupabase() {
    if (!this.supabaseClient) return;

    try {
      const stats = Array.from(this.playerStats.values());

      // Upsert player stats (replace if exists)
      const { error } = await this.supabaseClient
        .from('player_stats')
        .upsert(stats.map(stat => ({
          player_name: stat.name,
          total_points: stat.totalPoints,
          wins: stat.wins,
          losses: stat.losses,
          participations: stat.participations,
          win_rate: stat.winRate,
          tournaments: stat.tournaments,
          best_placement: stat.bestPlacement,
          avg_points_per_tournament: stat.avgPointsPerTournament
        })));

      if (error) {
        console.error('Failed to sync player stats to Supabase:', error);
      } else {
        console.log('Player stats synced to Supabase');
      }
    } catch (err) {
      console.error('Supabase player stats sync error:', err);
    }
  }

  /**
   * Load archive from Supabase (when online)
   * Merges with local data, keeping newer entries
   * @returns {Promise<void>}
   */
  async syncFromSupabase() {
    if (!this.supabaseClient) return;

    try {
      const { data: tournaments, error: tourError } = await this.supabaseClient
        .from('tournaments')
        .select('*');

      if (tourError) {
        console.warn('Failed to fetch tournaments from Supabase:', tourError);
        return;
      }

      if (tournaments && Array.isArray(tournaments)) {
        // Merge with local archive (keep local if newer)
        const mergedArchive = [...this.archive];

        tournaments.forEach((t) => {
          const existingIdx = mergedArchive.findIndex(a => a.id === t.id);
          if (existingIdx === -1) {
            // New tournament from cloud
            mergedArchive.push({
              id: t.id,
              date: t.date,
              name: t.name,
              numberOfTeams: t.number_of_teams,
              finalStandings: t.standings,
              allMatches: t.all_matches
            });
          }
        });

        this.archive = mergedArchive;
        this.persistence.saveArchive(this.archive);
      }

      console.log('Archive synced from Supabase');
    } catch (err) {
      console.error('Supabase sync error:', err);
    }
  }

  /**
   * ═══════════════════════════════════════════════════
   * UTILITY METHODS
   * ═══════════════════════════════════════════════════
   */

  /**
   * Clear all data (for testing or reset)
   */
  clearAll() {
    this.archive = [];
    this.playerStats.clear();
    this.persistence.saveArchive(this.archive);
    this.persistence.savePlayerStats(this.playerStats);
  }

  /**
   * Get archive entry by ID
   */
  getTournamentArchive(tournamentId) {
    return this.archive.find(t => t.id === tournamentId);
  }

  /**
   * Get all tournaments in archive
   */
  getAllTournaments() {
    return [...this.archive];
  }

  /**
   * Get total tournaments archived
   */
  getTotalTournaments() {
    return this.archive.length;
  }

  /**
   * Get total unique players
   */
  getTotalPlayers() {
    return this.playerStats.size;
  }
}
