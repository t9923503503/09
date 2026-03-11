/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SPECTATOR MODE MODULE
 * Large display, read-only view for projectors and live broadcasts
 * ═══════════════════════════════════════════════════════════════════════════════
 */

class SpectatorMode {
  constructor(tournament, navigator = null) {
    this.tournament = tournament;
    this.navigator = navigator;

    // Display settings
    this.settings = {
      fontSize: 1.5,          // Multiplier (1.5x = 50% larger)
      lineHeight: 1.8,        // Increased line spacing
      contrastMode: false,    // High contrast
      colorMode: "auto",      // "auto", "light", "dark"
      animationSpeed: 0.3,    // 300ms animations
      layout: "wide",         // "wide", "tall", "compact"
      highlightCurrent: true, // Highlight current match
      showUpsets: true,       // Highlight upsets
      autoScroll: false,      // Auto-scroll matches
      refreshInterval: 2000   // Refresh every 2s (ms)
    };

    // Display state
    this.currentRound = null;
    this.currentBracket = "WB";
    this.displayMode = "bracket";  // "bracket", "standings", "stats", "upcoming"
    this.autoPlayNext = false;
    this.scrollPosition = 0;
  }

  /**
   * Get formatted match display for spectators
   * @param {Match} match - Match object
   * @returns {Object} Formatted display object
   */
  formatMatch(match) {
    const teamA = this.tournament.teams.find(t => t.id === match.team_a_id);
    const teamB = this.tournament.teams.find(t => t.id === match.team_b_id);

    const formatted = {
      id: match.id,
      bracket: match.bracket,
      round: match.round,
      position: match.position,

      // Team A
      teamA: teamA ? {
        id: teamA.id,
        name: teamA.name,
        seed: teamA.seed,
        tsi: teamA.trueSkillIndex,
        isBye: match.isBye && match.team_b_id === null
      } : null,

      // Team B
      teamB: teamB ? {
        id: teamB.id,
        name: teamB.name,
        seed: teamB.seed,
        tsi: teamB.trueSkillIndex,
        isBye: false
      } : null,

      // Match state
      status: match.status,
      winner: match.winner_id ?
        this.tournament.teams.find(t => t.id === match.winner_id)?.name : null,
      upset: match.upsetAlert,
      bye: match.isBye,

      // Styling hints
      highlight: false,
      cssClass: this._getMatchCssClass(match),
      sizeMultiplier: this._getMatchSize(match),
      showAnimation: match.status === "completed"
    };

    return formatted;
  }

  /**
   * Get CSS class for match styling
   * @private
   */
  _getMatchCssClass(match) {
    const classes = [];

    if (match.status === "completed") {
      classes.push("match-completed");
    } else if (match.status === "in_progress") {
      classes.push("match-active");
    } else {
      classes.push("match-pending");
    }

    if (match.upsetAlert) {
      classes.push("match-upset");
    }

    if (match.isBye) {
      classes.push("match-bye");
    }

    return classes.join(" ");
  }

  /**
   * Get visual size multiplier for match
   * @private
   */
  _getMatchSize(match) {
    // Make finals bigger
    if (match.bracket === "GRAND_FINAL" || match.bracket === "SUPER_FINAL") {
      return 2.5;
    }

    // Make finals of each bracket bigger
    const maxRound = Math.max(...this.tournament.bracket.winners.map(m => m.round));
    if (match.round === maxRound) {
      return 2.0;
    }

    return 1.0;
  }

  /**
   * Get current match for display (large, centered)
   * @returns {Object} Formatted current match
   */
  getCurrentMatch() {
    if (!this.navigator) {
      const pending = Object.values(this.tournament.matches)
        .filter(m => m.status === "pending" && m.bracket === "WB")
        .sort((a, b) => a.round - b.round || a.position - b.position);

      if (pending.length === 0) return null;
      return this.formatMatch(pending[0]);
    }

    const wbPending = this.navigator.search({ bracket: "WB", status: "pending" });
    if (wbPending.length === 0) return null;

    return this.formatMatch(wbPending[0]);
  }

  /**
   * Get upcoming matches (next 3-5)
   * @returns {Array} Formatted matches
   */
  getUpcomingMatches(count = 5) {
    if (!this.navigator) {
      const pending = Object.values(this.tournament.matches)
        .filter(m => m.status === "pending" && m.bracket === "WB")
        .sort((a, b) => a.round - b.round || a.position - b.position)
        .slice(0, count);

      return pending.map(m => this.formatMatch(m));
    }

    return this.navigator.search({ bracket: "WB", status: "pending" })
      .slice(0, count)
      .map(m => this.formatMatch(m));
  }

  /**
   * Get bracket for large display
   * @param {string} bracket - Bracket type ("WB", "LB", etc.)
   * @returns {Object} Bracket display structure
   */
  getBracketDisplay(bracket = "WB") {
    const matches = this.tournament.bracket[bracket === "WB" ? "winners" :
                                           bracket === "LB" ? "losers" :
                                           bracket === "GRAND_FINAL" ? "grand_final" : null];

    if (!matches) return null;

    const byRound = {};
    (Array.isArray(matches) ? matches : [matches])
      .filter(m => m)
      .forEach(match => {
        if (!byRound[match.round]) {
          byRound[match.round] = [];
        }
        byRound[match.round].push(this.formatMatch(match));
      });

    return {
      bracket,
      rounds: byRound,
      totalRounds: Object.keys(byRound).length,
      totalMatches: (Array.isArray(matches) ? matches : [matches]).filter(m => m).length
    };
  }

  /**
   * Get tournament standings for display
   * @returns {Object} Standings by position
   */
  getStandings() {
    const standings = {
      leaders: [],
      active: [],
      eliminated: [],
      completed: false
    };

    // Track which teams are still in tournament
    const teamStatus = {};
    this.tournament.teams.forEach(t => {
      teamStatus[t.id] = { team: t, matches: 0, wins: 0, losses: 0 };
    });

    // Count wins/losses
    Object.values(this.tournament.matches).forEach(match => {
      if (match.winner_id) {
        teamStatus[match.winner_id].wins++;
      }

      const loserId = match.team_a_id === match.winner_id ?
        match.team_b_id : match.team_a_id;
      if (loserId) {
        teamStatus[loserId].losses++;
      }
    });

    // Separate into categories
    Object.values(teamStatus).forEach(entry => {
      const winRate = entry.wins + entry.losses > 0 ?
        entry.wins / (entry.wins + entry.losses) : 0;

      if (entry.losses === 0) {
        standings.leaders.push({
          ...entry.team,
          wins: entry.wins,
          losses: entry.losses,
          winRate: (winRate * 100).toFixed(0) + "%"
        });
      } else if (entry.losses === 1) {
        standings.active.push({
          ...entry.team,
          wins: entry.wins,
          losses: entry.losses,
          winRate: (winRate * 100).toFixed(0) + "%"
        });
      } else {
        standings.eliminated.push({
          ...entry.team,
          wins: entry.wins,
          losses: entry.losses,
          winRate: (winRate * 100).toFixed(0) + "%"
        });
      }
    });

    // Sort each category
    standings.leaders.sort((a, b) => b.wins - a.wins);
    standings.active.sort((a, b) => b.wins - a.wins);
    standings.eliminated.sort((a, b) => b.wins - a.wins);

    return standings;
  }

  /**
   * Get tournament statistics for display
   * @returns {Object} Stats with formatted numbers
   */
  getTournamentStats() {
    if (!this.navigator) {
      return {
        totalMatches: Object.keys(this.tournament.matches).length,
        played: Object.values(this.tournament.matches).filter(m => m.status === "completed").length,
        remaining: Object.values(this.tournament.matches).filter(m => m.status !== "completed").length,
        upsets: 0,
        progress: 0
      };
    }

    const stats = this.navigator.getStatistics();
    const health = this.navigator.getHealthStatus();

    return {
      totalMatches: stats.totalMatches,
      played: stats.byStatus.completed,
      remaining: stats.byStatus.pending + stats.byStatus.in_progress,
      upsets: stats.upsets,
      progress: stats.completionPercentage,
      estimatedTime: health.estimatedCompletion
    };
  }

  /**
   * Update display settings
   * @param {Object} newSettings - Settings to update
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };

    // Validate settings
    if (this.settings.fontSize < 0.8 || this.settings.fontSize > 3) {
      this.settings.fontSize = 1.5;
    }
  }

  /**
   * Get HTML-friendly display settings
   * @returns {Object} CSS-ready settings
   */
  getDisplaySettings() {
    return {
      root: {
        "--font-size-multiplier": this.settings.fontSize,
        "--line-height": this.settings.lineHeight,
        "--animation-duration": this.settings.animationSpeed + "s",
        "--contrast-mode": this.settings.contrastMode ? "1" : "0"
      },
      body: {
        fontSize: (16 * this.settings.fontSize) + "px",
        lineHeight: this.settings.lineHeight,
        colorScheme: this.settings.colorMode === "dark" ? "dark" :
                     this.settings.colorMode === "light" ? "light" : "auto"
      },
      match: {
        minHeight: (120 * this.settings.fontSize) + "px",
        padding: (20 * this.settings.fontSize) + "px"
      },
      team: {
        fontSize: (24 * this.settings.fontSize) + "px",
        fontWeight: "bold"
      }
    };
  }

  /**
   * Get color scheme for display
   * @returns {Object} Colors for UI
   */
  getColorScheme() {
    if (this.settings.contrastMode) {
      return {
        background: "#000000",
        foreground: "#FFFFFF",
        pending: "#FFD700",   // Gold
        active: "#00FF00",    // Green
        completed: "#0099FF",  // Blue
        upset: "#FF0000",     // Red
        bye: "#808080"        // Gray
      };
    }

    return {
      background: this.settings.colorMode === "dark" ? "#1A1A1A" : "#FFFFFF",
      foreground: this.settings.colorMode === "dark" ? "#FFFFFF" : "#000000",
      pending: "#FFA500",    // Orange
      active: "#4CAF50",     // Green
      completed: "#2196F3",  // Blue
      upset: "#FF5722",      // Red-Orange
      bye: "#9E9E9E"         // Gray
    };
  }

  /**
   * Export display as formatted text (for projectors/screens)
   * @returns {string} Formatted text display
   */
  exportAsText() {
    const current = this.getCurrentMatch();
    const upcoming = this.getUpcomingMatches(3);
    const stats = this.getTournamentStats();

    let text = "\n";
    text += "═".repeat(80) + "\n";
    text += " ".repeat(20) + "TOURNAMENT SPECTATOR VIEW\n";
    text += "═".repeat(80) + "\n\n";

    // Current match (large)
    if (current) {
      text += "CURRENT MATCH:\n";
      text += "─".repeat(80) + "\n";
      text += `${current.teamA?.name || "BYE"}`.padEnd(30) +
              " vs " +
              `${current.teamB?.name || "TBD"}`.padStart(30) + "\n";
      text += `Seed #${current.teamA?.seed || "−"}`.padEnd(30) +
              "     " +
              `Seed #${current.teamB?.seed || "−"}`.padStart(30) + "\n";
      text += "─".repeat(80) + "\n\n";
    }

    // Upcoming matches
    if (upcoming.length > 0) {
      text += "UPCOMING MATCHES:\n";
      text += "─".repeat(80) + "\n";
      upcoming.forEach((match, idx) => {
        text += `${idx + 1}. ${match.teamA?.name || "BYE"} vs ${match.teamB?.name || "TBD"}\n`;
      });
      text += "\n";
    }

    // Statistics
    text += "TOURNAMENT PROGRESS:\n";
    text += "─".repeat(80) + "\n";
    text += `Matches played: ${stats.played}/${stats.totalMatches} (${stats.progress}%)\n`;
    text += `Upsets: ${stats.upsets}\n`;
    text += "═".repeat(80) + "\n\n";

    return text;
  }

  /**
   * Get keyboard shortcuts for spectator navigation
   * @returns {Object} Shortcut mappings
   */
  getShortcuts() {
    return {
      "Space": "Next match",
      "←": "Previous match",
      "→": "Next match",
      "W": "Switch to Winners Bracket",
      "L": "Switch to Losers Bracket",
      "S": "Show standings",
      "P": "Toggle pause/play",
      "C": "High contrast mode",
      "+": "Increase font size",
      "-": "Decrease font size",
      "F": "Fullscreen",
      "Esc": "Exit fullscreen",
      "R": "Refresh",
      "H": "Show help"
    };
  }
}

// ════════════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════════════

if (typeof module !== "undefined" && module.exports) {
  module.exports = { SpectatorMode };
}
