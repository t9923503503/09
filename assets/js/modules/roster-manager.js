/**
 * ═══════════════════════════════════════════════
 * ROSTER MANAGER - Team/Player management
 * ═══════════════════════════════════════════════
 */

class RosterManager {
  constructor(eventBus, i18n) {
    this.eventBus = eventBus;
    this.i18n = i18n;
    this.teams = [];
    this.maxTeams = 256;
    this.minTeams = 2;
  }

  /**
   * Parse text input into team names with optional seeds
   * Handles formats:
   * - "Team Name" - no seed
   * - "Team Name/1" - with seed
   * - "Team Name\t2" - with tab separator
   * @param {string} text - Raw input text
   * @returns {Array} Array of {name, seed} objects
   */
  parseNames(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const lines = text
      .trim()
      .split(/[\n\r]+/)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    return lines.map((line, idx) => {
      // Try to parse seed from format: "Name/1" or "Name\t1" or "Name 1"
      const seedMatch = line.match(/^(.+?)[\s\/\t]+(\d+)\s*$/);

      if (seedMatch) {
        const name = seedMatch[1].trim();
        const seed = parseInt(seedMatch[2], 10);
        return { name, seed };
      }

      // No seed found, return just name
      return { name: line, seed: null };
    });
  }

  /**
   * Validate team count
   * @param {number} count - Number of teams
   * @returns {Object} {valid: bool, error: string|null}
   */
  validateCount(count) {
    if (count < this.minTeams) {
      return {
        valid: false,
        error: this.i18n.t('roster.error.empty')
      };
    }
    if (count > this.maxTeams) {
      return {
        valid: false,
        error: this.i18n.t('roster.error.tooMany')
      };
    }
    return { valid: true, error: null };
  }

  /**
   * Calculate bracket size (next power of 2)
   * @param {number} count - Team count
   * @returns {number} Bracket size
   */
  calculateBracketSize(count) {
    return Math.pow(2, Math.ceil(Math.log2(count)));
  }

  /**
   * Calculate bye count
   * @param {number} count - Team count
   * @returns {number} Number of byes needed
   */
  calculateByeCount(count) {
    const bracketSize = this.calculateBracketSize(count);
    return bracketSize - count;
  }

  /**
   * Create team objects from parsed names with seeds
   * @param {Array} parsedNames - Array of {name, seed} objects from parseNames()
   * @returns {Array} Team objects with auto-generated skill levels
   */
  createTeams(parsedNames) {
    return parsedNames.map((item, idx) => {
      // Handle both old format (string) and new format ({name, seed})
      const teamName = typeof item === 'string' ? item : item.name;
      const seedValue = (typeof item === 'string') ? null : item.seed;

      // Auto-generate skill levels (1-5 for each player)
      const p1Level = Math.floor(Math.random() * 5) + 1;
      const p2Level = Math.floor(Math.random() * 5) + 1;

      return {
        id: `team_${idx}`,
        name: teamName,
        players: [
          { id: `p${idx * 2}`, name: `Player ${idx * 2 + 1}`, level: p1Level },
          { id: `p${idx * 2 + 1}`, name: `Player ${idx * 2 + 2}`, level: p2Level }
        ],
        // Seed from user input (1 = strongest, higher = weaker)
        seed: seedValue || 0,
        bye: false,
        wins: 0,
        losses: 0,
        eliminated: false
      };
    });
  }

  /**
   * Shuffle teams array (Fisher-Yates)
   * @param {Array} teams - Teams to shuffle
   * @returns {Array} Shuffled teams
   */
  shuffleTeams(teams) {
    const shuffled = [...teams];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Generate roster from text input
   * @param {string} text - Raw input text
   * @param {boolean} shuffle - Whether to shuffle teams
   * @returns {Object} {teams: Array, error: string|null}
   */
  generateRoster(text, shuffle = false) {
    try {
      const names = this.parseNames(text);

      // Validate count
      const validation = this.validateCount(names.length);
      if (!validation.valid) {
        return { teams: [], error: validation.error };
      }

      // Create team objects
      let teams = this.createTeams(names);

      // Shuffle if requested
      if (shuffle) {
        teams = this.shuffleTeams(teams);
        // Re-index after shuffle
        teams.forEach((team, idx) => {
          team.id = `team_${idx}`;
        });
      }

      this.teams = teams;
      return { teams, error: null };
    } catch (error) {
      console.error('Error generating roster:', error);
      return {
        teams: [],
        error: this.i18n.t('roster.error.parsing')
      };
    }
  }

  /**
   * Get bracket info
   * @param {number} count - Team count
   * @returns {Object} {size: number, byes: number}
   */
  getBracketInfo(count) {
    const validation = this.validateCount(count);
    if (!validation.valid) {
      return { size: 0, byes: 0, valid: false };
    }

    return {
      size: this.calculateBracketSize(count),
      byes: this.calculateByeCount(count),
      valid: true
    };
  }

  /**
   * Get current roster
   * @returns {Array} Teams
   */
  getRoster() {
    return this.teams;
  }

  /**
   * Update team name
   * @param {string} teamId - Team ID
   * @param {string} newName - New name
   */
  updateTeamName(teamId, newName) {
    const team = this.teams.find(t => t.id === teamId);
    if (team) {
      const oldName = team.name;
      team.name = newName.trim();
      this.eventBus.emit('team:renamed', {
        teamId,
        oldName,
        newName: team.name
      });
    }
  }

  /**
   * Clear roster
   */
  clear() {
    this.teams = [];
  }

  /**
   * Get team by ID
   * @param {string} teamId - Team ID
   * @returns {Object|null}
   */
  getTeam(teamId) {
    return this.teams.find(t => t.id === teamId) || null;
  }

  /**
   * Get team name by ID
   * @param {string} teamId - Team ID
   * @returns {string} Team name
   */
  getTeamName(teamId) {
    if (!teamId) return this.i18n.t('bracket.tbd');
    const team = this.getTeam(teamId);
    return team ? team.name : this.i18n.t('bracket.tbd');
  }

  /**
   * Export roster as CSV
   * @returns {string} CSV content
   */
  exportCSV() {
    const headers = ['Team Name', 'Player 1', 'Level', 'Player 2', 'Level'];
    const rows = this.teams.map(team => [
      team.name,
      team.players[0]?.name || '',
      team.players[0]?.level || '',
      team.players[1]?.name || '',
      team.players[1]?.level || ''
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    return csv;
  }

  /**
   * Import roster from CSV
   * @param {string} csv - CSV content
   * @returns {Object} {teams: Array, error: string|null}
   */
  importCSV(csv) {
    try {
      const lines = csv.trim().split('\n');
      if (lines.length < 2) {
        return { teams: [], error: 'Invalid CSV format' };
      }

      const teams = [];
      // Skip header row
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',').map(cell => cell.replace(/"/g, '').trim());
        if (cells[0]) {
          teams.push({
            id: `team_${i - 1}`,
            name: cells[0],
            players: [
              {
                id: `p${(i - 1) * 2}`,
                name: cells[1] || `Player ${(i - 1) * 2 + 1}`,
                level: parseInt(cells[2]) || Math.floor(Math.random() * 5) + 1
              },
              {
                id: `p${(i - 1) * 2 + 1}`,
                name: cells[3] || `Player ${(i - 1) * 2 + 2}`,
                level: parseInt(cells[4]) || Math.floor(Math.random() * 5) + 1
              }
            ],
            seed: 0,
            bye: false,
            wins: 0,
            losses: 0,
            eliminated: false
          });
        }
      }

      const validation = this.validateCount(teams.length);
      if (!validation.valid) {
        return { teams: [], error: validation.error };
      }

      this.teams = teams;
      return { teams, error: null };
    } catch (error) {
      console.error('Error importing CSV:', error);
      return { teams: [], error: 'Failed to parse CSV' };
    }
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RosterManager };
}
