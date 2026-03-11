/**
 * ═══════════════════════════════════════════════════════════════════════
 * POOL MANAGER - Group stage management for beach volleyball
 * ═══════════════════════════════════════════════════════════════════════
 */

class PoolManager {
  constructor(eventBus, i18n) {
    this.eventBus = eventBus;
    this.i18n = i18n;
    this.pools = [];      // Array of pool groups
    this.matches = [];    // All pool stage matches
  }

  /**
   * Calculate number of pools for given pair count
   * Beach volleyball: groups of 4 pairs
   * @param {number} pairCount - Total number of pairs
   * @returns {number} Number of pools needed
   */
  calculatePoolCount(pairCount) {
    return Math.ceil(pairCount / 4);
  }

  /**
   * Calculate matches per pool (round-robin)
   * For 4 teams: 6 matches (each plays 3 matches)
   * Formula: n * (n-1) / 2
   * @param {number} poolSize - Number of teams in pool
   * @returns {number} Total matches
   */
  calculateMatchesPerPool(poolSize) {
    return poolSize * (poolSize - 1) / 2;
  }

  /**
   * Distribute pairs into balanced pools
   * Uses seed-based distribution for balanced pools
   * @param {Array} pairs - Array of pairs/teams
   * @param {number} poolSize - Size of each pool (default 4)
   * @returns {Array} Array of pools with pairs
   */
  distributePairs(pairs, poolSize = 4) {
    if (!pairs || pairs.length === 0) {
      return [];
    }

    // Calculate number of pools needed
    const numPools = Math.ceil(pairs.length / poolSize);

    // Create empty pools
    const pools = [];
    for (let i = 0; i < numPools; i++) {
      pools.push({
        id: `pool_${i}`,
        name: this.i18n ? this.i18n.t('pools.poolLabel', { number: i + 1 }) : `Pool ${i + 1}`,
        pairs: [],
        matches: []
      });
    }

    // Sort pairs by seed (strongest first) for balanced distribution
    const sortedPairs = [...pairs].sort((a, b) => {
      const seedA = a.seed || 999;
      const seedB = b.seed || 999;
      return seedA - seedB;
    });

    // Distribute pairs in snake order for better balance
    sortedPairs.forEach((pair, idx) => {
      const poolIdx = idx % numPools;
      pools[poolIdx].pairs.push(pair);
    });

    // Generate round-robin matches for each pool
    pools.forEach(pool => {
      pool.matches = this.generatePoolMatches(pool.pairs);
    });

    this.pools = pools;
    return pools;
  }

  /**
   * Generate round-robin matches for a pool
   * @param {Array} pairs - Pairs in the pool
   * @returns {Array} Array of match objects
   */
  generatePoolMatches(pairs) {
    const matches = [];

    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        matches.push({
          id: `match_${pairs[i].id}_${pairs[j].id}`,
          pairA: pairs[i],
          pairB: pairs[j],
          setsA: [],
          setsB: [],
          winner: null,
          completed: false
        });
      }
    }

    return matches;
  }

  /**
   * Record match result
   * @param {string} matchId - Match ID
   * @param {Array} setsA - Set scores for pair A
   * @param {Array} setsB - Set scores for pair B
   * @returns {boolean} Success
   */
  recordMatchResult(matchId, setsA, setsB) {
    // Find match in all pools
    for (const pool of this.pools) {
      const match = pool.matches.find(m => m.id === matchId);
      if (match) {
        match.setsA = setsA;
        match.setsB = setsB;

        // Determine winner (best of 3 sets usually)
        const winsA = setsA.filter((s, idx) => s > setsB[idx]).length;
        const winsB = setsB.filter((s, idx) => s > setsA[idx]).length;

        match.winner = winsA > winsB ? match.pairA.id : match.pairB.id;
        match.completed = true;

        this.eventBus.emit('pool:matchRecorded', { matchId, match });
        return true;
      }
    }
    return false;
  }

  /**
   * Calculate pool standings
   * Scoring: Win = 2 points, Loss = 1 point
   * Tiebreaker: Points → Set Ratio → Ball Ratio
   * @param {string} poolId - Pool ID
   * @returns {Array} Sorted standings
   */
  calculateStandings(poolId) {
    const pool = this.pools.find(p => p.id === poolId);
    if (!pool) return [];

    // Initialize standings for all pairs
    const standings = pool.pairs.map(pair => ({
      pairId: pair.id,
      pairName: pair.name,
      seed: pair.seed || '—',
      wins: 0,
      losses: 0,
      points: 0,
      setsFor: 0,
      setsAgainst: 0,
      ballsFor: 0,
      ballsAgainst: 0
    }));

    // Process completed matches
    pool.matches.forEach(match => {
      if (!match.completed) return;

      const standingA = standings.find(s => s.pairId === match.pairA.id);
      const standingB = standings.find(s => s.pairId === match.pairB.id);

      // Count set wins
      const setsWonA = match.setsA.filter((s, idx) => s > match.setsB[idx]).length;
      const setsWonB = match.setsB.filter((s, idx) => s > match.setsA[idx]).length;

      // Count total balls (points)
      const ballsA = match.setsA.reduce((sum, s) => sum + s, 0);
      const ballsB = match.setsB.reduce((sum, s) => sum + s, 0);

      // Update standings for A
      if (setsWonA > setsWonB) {
        standingA.wins++;
        standingA.points += 2;
        standingB.losses++;
        standingB.points += 1;
      } else {
        standingB.wins++;
        standingB.points += 2;
        standingA.losses++;
        standingA.points += 1;
      }

      standingA.setsFor += setsWonA;
      standingA.setsAgainst += setsWonB;
      standingA.ballsFor += ballsA;
      standingA.ballsAgainst += ballsB;

      standingB.setsFor += setsWonB;
      standingB.setsAgainst += setsWonA;
      standingB.ballsFor += ballsB;
      standingB.ballsAgainst += ballsA;
    });

    // Calculate set ratio and ball ratio
    standings.forEach(s => {
      s.setRatio = s.setsAgainst > 0 ? (s.setsFor / s.setsAgainst).toFixed(2) : 0;
      s.ballRatio = s.ballsAgainst > 0 ? (s.ballsFor / s.ballsAgainst).toFixed(2) : 0;
    });

    // Sort by tiebreaker rules
    standings.sort((a, b) => {
      // First: Points
      if (b.points !== a.points) return b.points - a.points;
      // Second: Set Ratio
      if (parseFloat(b.setRatio) !== parseFloat(a.setRatio)) {
        return parseFloat(b.setRatio) - parseFloat(a.setRatio);
      }
      // Third: Ball Ratio
      return parseFloat(b.ballRatio) - parseFloat(a.ballRatio);
    });

    return standings;
  }

  /**
   * Get top pairs from each pool (usually top 2)
   * @param {number} perPool - Number of top pairs per pool
   * @returns {Array} Array of advancing pairs
   */
  getAdvancingPairs(perPool = 2) {
    const advancing = [];

    this.pools.forEach(pool => {
      const standings = this.calculateStandings(pool.id);
      const topPairs = standings.slice(0, perPool).map(s =>
        pool.pairs.find(p => p.id === s.pairId)
      );
      advancing.push(...topPairs);
    });

    return advancing;
  }

  /**
   * Get all pools
   * @returns {Array} Pools array
   */
  getPools() {
    return this.pools;
  }

  /**
   * Get specific pool
   * @param {string} poolId - Pool ID
   * @returns {Object|null} Pool object or null
   */
  getPool(poolId) {
    return this.pools.find(p => p.id === poolId) || null;
  }

  /**
   * Get all matches for a pool
   * @param {string} poolId - Pool ID
   * @returns {Array} Matches array
   */
  getPoolMatches(poolId) {
    const pool = this.getPool(poolId);
    return pool ? pool.matches : [];
  }

  /**
   * Clear all pools
   */
  clear() {
    this.pools = [];
    this.matches = [];
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PoolManager };
}
