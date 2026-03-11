/**
 * ═══════════════════════════════════════════════════════════════════════
 * PAIR MANAGER - Mixed Doubles / Player pairing management
 * ═══════════════════════════════════════════════════════════════════════
 */

class PairManager {
  constructor(eventBus, i18n) {
    this.eventBus = eventBus;
    this.i18n = i18n;
    this.players = []; // All individual players
    this.pairs = [];   // Created pairs
  }

  /**
   * Parse player input with gender indicator
   * Format: "Name/M" or "Name/F" or "Name/М" (Russian) or "Name/Ж"
   * @param {string} text - Raw input text
   * @returns {Array} Array of players with gender
   */
  parsePlayers(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const players = text
      .trim()
      .split(/[\n\r]+/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map((line, idx) => {
        // Try to parse gender from format: "Name/M" or "Name/F"
        const match = line.match(/^(.+?)\s*\/\s*([MFМЖmfмж])$/);

        if (match) {
          const name = match[1].trim();
          const gender = match[2].toUpperCase();
          // Normalize gender: M, m, М -> M; F, f, Ж, ж -> F
          const normalizedGender = (gender === 'F' || gender === 'Ж') ? 'F' : 'M';
          return {
            id: `player_${idx}`,
            name: name,
            gender: normalizedGender,
            level: Math.floor(Math.random() * 5) + 1
          };
        }

        // If no gender specified, return null (to be filtered)
        return null;
      })
      .filter(p => p !== null);

    return players;
  }

  /**
   * Count players by gender
   * @param {Array} players - Players array
   * @returns {Object} {males: number, females: number}
   */
  countByGender(players) {
    return {
      males: players.filter(p => p.gender === 'M').length,
      females: players.filter(p => p.gender === 'F').length
    };
  }

  /**
   * Validate player list
   * @param {Array} players - Players array
   * @returns {Object} {valid: bool, error: string|null}
   */
  validatePlayers(players) {
    if (players.length < 2) {
      return {
        valid: false,
        error: this.i18n.t('pairs.error.tooFew')
      };
    }

    const { males, females } = this.countByGender(players);

    // Need at least one male and one female to make a pair
    if (males === 0 || females === 0) {
      return {
        valid: false,
        error: this.i18n.t('pairs.error.needBoth')
      };
    }

    return { valid: true, error: null };
  }

  /**
   * Create pairs from players (simple random pairing)
   * Pairs males with females
   * @param {Array} players - Players array
   * @param {string} mode - 'balanced' or 'random'
   * @returns {Array} Array of pairs
   */
  createPairsFromPlayers(players, mode = 'balanced') {
    const males = players.filter(p => p.gender === 'M');
    const females = players.filter(p => p.gender === 'F');

    if (males.length === 0 || females.length === 0) {
      return [];
    }

    const pairs = [];
    const maxPairs = Math.max(males.length, females.length);
    const minPlayers = Math.min(males.length, females.length);

    // Create pairs with available players
    for (let i = 0; i < minPlayers; i++) {
      pairs.push({
        id: `pair_${i}`,
        name: `${males[i].name} & ${females[i].name}`,
        players: [males[i], females[i]],
        level: Math.round((males[i].level + females[i].level) / 2),
        wins: 0,
        losses: 0,
        eliminated: false
      });
    }

    // If unbalanced, add remaining players with byes
    if (males.length > minPlayers) {
      const remaining = males.slice(minPlayers);
      remaining.forEach((player, idx) => {
        pairs.push({
          id: `pair_${minPlayers + idx}`,
          name: `${player.name} (need partner)`,
          players: [player],
          level: player.level,
          wins: 0,
          losses: 0,
          eliminated: false,
          bye: true
        });
      });
    } else if (females.length > minPlayers) {
      const remaining = females.slice(minPlayers);
      remaining.forEach((player, idx) => {
        pairs.push({
          id: `pair_${minPlayers + idx}`,
          name: `${player.name} (need partner)`,
          players: [player],
          level: player.level,
          wins: 0,
          losses: 0,
          eliminated: false,
          bye: true
        });
      });
    }

    return pairs;
  }

  /**
   * Add manual pair
   * @param {string} name - Pair name
   * @param {Array} playerIds - Array of two player IDs
   */
  addPair(name, playerIds) {
    if (!playerIds || playerIds.length !== 2) {
      return false;
    }

    const players = playerIds.map(id =>
      this.players.find(p => p.id === id)
    ).filter(p => p);

    if (players.length !== 2) {
      return false;
    }

    const pair = {
      id: `pair_${this.pairs.length}`,
      name: name || `${players[0].name} & ${players[1].name}`,
      players: players,
      level: Math.round((players[0].level + players[1].level) / 2),
      wins: 0,
      losses: 0,
      eliminated: false
    };

    this.pairs.push(pair);
    this.eventBus.emit('pair:added', { pair });
    return true;
  }

  /**
   * Remove pair
   * @param {string} pairId - Pair ID
   */
  removePair(pairId) {
    const idx = this.pairs.findIndex(p => p.id === pairId);
    if (idx !== -1) {
      this.pairs.splice(idx, 1);
      this.eventBus.emit('pair:removed', { pairId });
    }
  }

  /**
   * Get current pairs
   * @returns {Array} Pairs array
   */
  getPairs() {
    return this.pairs;
  }

  /**
   * Get current players
   * @returns {Array} Players array
   */
  getPlayers() {
    return this.players;
  }

  /**
   * Clear all players and pairs
   */
  clear() {
    this.players = [];
    this.pairs = [];
  }

  /**
   * Convert pairs to tournament teams format
   * @returns {Array} Teams in tournament format
   */
  getPairsAsTeams() {
    return this.pairs.map((pair, idx) => ({
      id: pair.id,
      name: pair.name,
      players: pair.players,
      seed: 0,
      bye: pair.bye || false,
      wins: 0,
      losses: 0,
      eliminated: false
    }));
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PairManager };
}
