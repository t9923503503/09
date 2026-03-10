/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TOURNAMENT NAVIGATION & SEARCH MODULE
 * Search, filter, and navigate through tournament matches
 * ═══════════════════════════════════════════════════════════════════════════════
 */

class TournamentNavigator {
  constructor(tournament) {
    this.tournament = tournament;
    this.currentMatch = null;
    this.searchResults = [];
    this.filters = {
      bracket: null,      // "WB", "LB", "GRAND_FINAL"
      round: null,        // 1-N
      status: null,       // "pending", "in_progress", "completed"
      team: null,         // Team ID or name substring
      upset: false        // Only upsets
    };
  }

  /**
   * Search for matches by various criteria
   * @param {Object} criteria - Search parameters
   * @returns {Array} Matching matches
   */
  search(criteria = {}) {
    let results = Object.values(this.tournament.matches);

    // Filter by bracket
    if (criteria.bracket) {
      results = results.filter(m => m.bracket === criteria.bracket);
    }

    // Filter by round
    if (criteria.round !== null && criteria.round !== undefined) {
      results = results.filter(m => m.round === criteria.round);
    }

    // Filter by status
    if (criteria.status) {
      results = results.filter(m => m.status === criteria.status);
    }

    // Filter by team (search in team names/IDs)
    if (criteria.team) {
      const searchStr = criteria.team.toLowerCase();
      results = results.filter(m => {
        const teamA = this.tournament.teams.find(t => t.id === m.team_a_id);
        const teamB = this.tournament.teams.find(t => t.id === m.team_b_id);

        const teamAMatch = teamA && (
          teamA.id.toLowerCase().includes(searchStr) ||
          teamA.name.toLowerCase().includes(searchStr)
        );

        const teamBMatch = teamB && (
          teamB.id.toLowerCase().includes(searchStr) ||
          teamB.name.toLowerCase().includes(searchStr)
        );

        return teamAMatch || teamBMatch;
      });
    }

    // Filter by upset
    if (criteria.upset) {
      results = results.filter(m => m.upsetAlert === true);
    }

    // Sort by bracket, round, position
    results.sort((a, b) => {
      const bracketOrder = { "WB": 0, "LB": 1, "GRAND_FINAL": 2, "SUPER_FINAL": 3 };
      const aOrder = bracketOrder[a.bracket] || 99;
      const bOrder = bracketOrder[b.bracket] || 99;

      if (aOrder !== bOrder) return aOrder - bOrder;
      if (a.round !== b.round) return a.round - b.round;
      return a.position - b.position;
    });

    this.searchResults = results;
    return results;
  }

  /**
   * Get pending matches (next to be played)
   * @returns {Array} Pending matches sorted by bracket and round
   */
  getPendingMatches() {
    return this.search({ status: "pending" });
  }

  /**
   * Get completed matches
   * @returns {Array} Completed matches
   */
  getCompletedMatches() {
    return this.search({ status: "completed" });
  }

  /**
   * Get matches in specific bracket
   * @param {string} bracket - "WB", "LB", "GRAND_FINAL", "SUPER_FINAL"
   * @returns {Array} Matches in bracket
   */
  getMatchesInBracket(bracket) {
    return this.search({ bracket });
  }

  /**
   * Get matches in specific round
   * @param {string} bracket - Bracket type
   * @param {number} round - Round number
   * @returns {Array} Matches in round
   */
  getMatchesInRound(bracket, round) {
    return this.search({ bracket, round });
  }

  /**
   * Get all matches for a team
   * @param {string} teamId - Team ID
   * @returns {Array} Team's matches
   */
  getTeamMatches(teamId) {
    return this.search({ team: teamId });
  }

  /**
   * Get upset matches
   * @returns {Array} Matches marked as upsets
   */
  getUpsets() {
    return this.search({ upset: true });
  }

  /**
   * Navigate to next pending match
   * @returns {Match|null} Next pending match or null
   */
  nextPendingMatch() {
    const pending = this.getPendingMatches();
    if (pending.length === 0) return null;

    this.currentMatch = pending[0];
    return this.currentMatch;
  }

  /**
   * Navigate to specific match
   * @param {string} matchId - Match ID
   * @returns {Match|null} The match or null if not found
   */
  gotoMatch(matchId) {
    const match = this.tournament.matches[matchId];
    if (match) {
      this.currentMatch = match;
    }
    return match || null;
  }

  /**
   * Get match context (next matches in bracket)
   * @param {string} matchId - Match ID
   * @returns {Object} { current, nextWinner, nextLoser }
   */
  getMatchContext(matchId) {
    const match = this.tournament.matches[matchId];
    if (!match) return null;

    const context = {
      current: match,
      nextWinner: null,
      nextLoser: null
    };

    // Find next winner match
    if (match.nextMatchWinnerId) {
      const [nextId, slot] = match.nextMatchWinnerId.split(":");
      context.nextWinner = this.tournament.matches[nextId];
    }

    // Find next loser match
    if (match.nextMatchLoserId) {
      const [nextId, slot] = match.nextMatchLoserId.split(":");
      context.nextLoser = this.tournament.matches[nextId];
    }

    return context;
  }

  /**
   * Get match statistics
   * @returns {Object} Stats about tournament matches
   */
  getStatistics() {
    const matches = Object.values(this.tournament.matches);
    const brackets = {};
    const statuses = { pending: 0, in_progress: 0, completed: 0 };
    const byRound = {};

    matches.forEach(m => {
      // Count by bracket
      brackets[m.bracket] = (brackets[m.bracket] || 0) + 1;

      // Count by status
      if (statuses.hasOwnProperty(m.status)) {
        statuses[m.status]++;
      }

      // Count by round
      const key = `${m.bracket}_R${m.round}`;
      byRound[key] = (byRound[key] || 0) + 1;
    });

    return {
      totalMatches: matches.length,
      byBracket: brackets,
      byStatus: statuses,
      byRound,
      upsets: this.getUpsets().length,
      completionPercentage: Math.round(
        (statuses.completed / matches.length) * 100
      ) || 0
    };
  }

  /**
   * Get bracket progression (visual representation)
   * @param {string} bracket - Bracket type
   * @returns {Object} Rounds with match counts
   */
  getBracketProgression(bracket) {
    const matches = this.search({ bracket });
    const progression = {};

    matches.forEach(m => {
      const round = m.round;
      if (!progression[round]) {
        progression[round] = {
          total: 0,
          completed: 0,
          pending: 0
        };
      }

      progression[round].total++;
      if (m.status === "completed") {
        progression[round].completed++;
      } else {
        progression[round].pending++;
      }
    });

    return progression;
  }

  /**
   * Get tournament health status
   * @returns {Object} Status indicators
   */
  getHealthStatus() {
    const stats = this.getStatistics();
    const total = stats.totalMatches;

    return {
      progress: stats.completionPercentage,
      matchesPlayed: stats.byStatus.completed,
      matchesRemaining: stats.byStatus.pending + stats.byStatus.in_progress,
      upsetCount: stats.upsets,
      estimatedCompletion: this._estimateCompletion(stats.byStatus)
    };
  }

  /**
   * Estimate when tournament will complete
   * @private
   */
  _estimateCompletion(statuses) {
    const total = Object.values(statuses).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;

    const completed = statuses.completed || 0;
    const remaining = total - completed;

    // Estimate based on matches per minute (simplified)
    // Assuming 1 match per 3 minutes on average
    const estimatedMinutes = remaining * 3;

    return {
      remainingMatches: remaining,
      estimatedMinutes,
      estimatedHours: Math.ceil(estimatedMinutes / 60)
    };
  }
}

// ════════════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════════════

if (typeof module !== "undefined" && module.exports) {
  module.exports = { TournamentNavigator };
}
