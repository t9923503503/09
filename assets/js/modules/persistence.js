/**
 * ═══════════════════════════════════════════════
 * PERSISTENCE MODULE - localStorage management
 * ═══════════════════════════════════════════════
 */

class PersistenceManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.version = '1.0';
    this.saveQueue = null;
    this.saveDebounceDuration = 500; // ms

    // Storage keys
    this.keys = {
      tournament: 'tournament:state',
      roster: 'roster:teams',
      settings: 'app:settings',
      version: 'app:version',
      archive: 'app:archive',
      playerStats: 'app:playerStats'
    };

    // Listen to save events
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for auto-save
   */
  setupEventListeners() {
    // Auto-save on tournament changes (debounced)
    this.eventBus.on('match:updated', () => this.debouncedSave('tournament'));
    this.eventBus.on('tournament:created', () => this.save('tournament'));
    this.eventBus.on('roster:loaded', () => this.save('roster'));
  }

  /**
   * Debounced save function
   * @param {string} target - What to save (tournament, roster, all)
   */
  debouncedSave(target = 'all') {
    clearTimeout(this.saveQueue);
    this.saveQueue = setTimeout(() => {
      this.save(target);
    }, this.saveDebounceDuration);
  }

  /**
   * Save tournament state to localStorage
   * @param {string} target - What to save
   */
  save(target = 'all') {
    try {
      // Check storage availability
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);

      // Save version
      localStorage.setItem(this.keys.version, this.version);

      // Emit saving event
      this.eventBus.emit('state:saving', { target });

      // Save based on target
      if (target === 'tournament' || target === 'all') {
        const tournament = window.currentTournament;
        if (tournament) {
          const data = {
            id: tournament.id,
            name: tournament.name,
            status: tournament.status,
            teams: tournament.teams,
            matches: Object.values(tournament.matches),
            bracket: tournament.bracket,
            seeding: tournament.seeding,
            createdAt: tournament.createdAt,
            updatedAt: new Date().toISOString()
          };
          localStorage.setItem(this.keys.tournament, JSON.stringify(data));
        }
      }

      if (target === 'roster' || target === 'all') {
        const roster = window.currentRoster;
        if (roster && Array.isArray(roster)) {
          localStorage.setItem(this.keys.roster, JSON.stringify(roster));
        }
      }

      if (target === 'settings' || target === 'all') {
        const settings = window.appSettings || {};
        localStorage.setItem(this.keys.settings, JSON.stringify(settings));
      }

      this.eventBus.emit('state:saved', { target });
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.error('localStorage quota exceeded');
        this.eventBus.emit('error:storage', { message: 'Storage quota exceeded' });
      } else {
        console.error('Failed to save state:', error);
      }
    }
  }

  /**
   * Restore tournament state from localStorage
   * @returns {Object|null} Tournament data or null
   */
  restoreTournament() {
    try {
      const stored = localStorage.getItem(this.keys.tournament);
      if (stored) {
        const data = JSON.parse(stored);
        // Reconstruct matches map
        const matches = {};
        if (Array.isArray(data.matches)) {
          data.matches.forEach(m => {
            matches[m.id] = m;
          });
        }
        data.matches = matches;
        return data;
      }
      return null;
    } catch (error) {
      console.error('Failed to restore tournament:', error);
      return null;
    }
  }

  /**
   * Restore roster from localStorage
   * @returns {Array|null} Roster data or null
   */
  restoreRoster() {
    try {
      const stored = localStorage.getItem(this.keys.roster);
      if (stored) {
        return JSON.parse(stored);
      }
      return null;
    } catch (error) {
      console.error('Failed to restore roster:', error);
      return null;
    }
  }

  /**
   * Restore app settings
   * @returns {Object} Settings object
   */
  restoreSettings() {
    try {
      const stored = localStorage.getItem(this.keys.settings);
      if (stored) {
        return JSON.parse(stored);
      }
      return {};
    } catch (error) {
      console.error('Failed to restore settings:', error);
      return {};
    }
  }

  /**
   * Check if there's saved tournament data
   * @returns {boolean}
   */
  hasSavedTournament() {
    return localStorage.getItem(this.keys.tournament) !== null;
  }

  /**
   * Clear all saved data
   * @param {boolean} confirm - Require confirmation
   */
  clearAll(confirm = true) {
    if (confirm && !window.confirm('This will delete all tournament data. Continue?')) {
      return;
    }

    try {
      Object.values(this.keys).forEach(key => {
        localStorage.removeItem(key);
      });
      this.eventBus.emit('state:cleared');
      console.log('All data cleared');
    } catch (error) {
      console.error('Failed to clear data:', error);
    }
  }

  /**
   * Clear specific data
   * @param {string} target - What to clear (tournament, roster, settings)
   */
  clear(target) {
    try {
      if (target === 'tournament') {
        localStorage.removeItem(this.keys.tournament);
      } else if (target === 'roster') {
        localStorage.removeItem(this.keys.roster);
      } else if (target === 'settings') {
        localStorage.removeItem(this.keys.settings);
      }
      this.eventBus.emit('state:cleared', { target });
    } catch (error) {
      console.error(`Failed to clear ${target}:`, error);
    }
  }

  /**
   * Get storage usage info
   * @returns {Object} {used: bytes, available: bytes, percent: number}
   */
  getStorageInfo() {
    let totalSize = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalSize += localStorage[key].length + key.length;
      }
    }
    return {
      used: totalSize,
      available: 5 * 1024 * 1024, // ~5MB typical quota
      percent: Math.round((totalSize / (5 * 1024 * 1024)) * 100)
    };
  }

  /**
   * Export all data as JSON
   * @returns {string} JSON string
   */
  exportJSON() {
    return JSON.stringify({
      version: this.version,
      exportedAt: new Date().toISOString(),
      tournament: JSON.parse(localStorage.getItem(this.keys.tournament) || 'null'),
      roster: JSON.parse(localStorage.getItem(this.keys.roster) || 'null'),
      settings: JSON.parse(localStorage.getItem(this.keys.settings) || '{}')
    }, null, 2);
  }

  /**
   * Import data from JSON
   * @param {string} jsonString - JSON data
   */
  importJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.tournament) {
        localStorage.setItem(this.keys.tournament, JSON.stringify(data.tournament));
      }
      if (data.roster) {
        localStorage.setItem(this.keys.roster, JSON.stringify(data.roster));
      }
      if (data.settings) {
        localStorage.setItem(this.keys.settings, JSON.stringify(data.settings));
      }
      this.eventBus.emit('state:imported');
      return true;
    } catch (error) {
      console.error('Failed to import data:', error);
      return false;
    }
  }

  /**
   * Save tournament archive to localStorage
   * @param {Array} archive - Array of completed tournaments
   */
  saveArchive(archive) {
    try {
      localStorage.setItem(this.keys.archive, JSON.stringify(archive));
      this.eventBus.emit('archive:saved');
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.error('Archive save failed: storage quota exceeded');
        this.eventBus.emit('storage:quotaExceeded');
      }
    }
  }

  /**
   * Restore tournament archive from localStorage
   * @returns {Array} Archive array
   */
  restoreArchive() {
    try {
      const stored = localStorage.getItem(this.keys.archive);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to restore archive:', error);
      return [];
    }
  }

  /**
   * Save player statistics to localStorage
   * @param {Map} playerStatsMap - Map of player name → stats
   */
  savePlayerStats(playerStatsMap) {
    try {
      const data = Object.fromEntries(playerStatsMap);
      localStorage.setItem(this.keys.playerStats, JSON.stringify(data));
      this.eventBus.emit('playerStats:saved');
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.error('Player stats save failed: storage quota exceeded');
        this.eventBus.emit('storage:quotaExceeded');
      }
    }
  }

  /**
   * Restore player statistics from localStorage
   * @returns {Map} Player stats map
   */
  restorePlayerStats() {
    try {
      const stored = localStorage.getItem(this.keys.playerStats);
      if (stored) {
        const data = JSON.parse(stored);
        return new Map(Object.entries(data));
      }
      return new Map();
    } catch (error) {
      console.error('Failed to restore player stats:', error);
      return new Map();
    }
  }

  /**
   * Export tournament data as JSON file
   * @param {Object} tournamentData - Full tournament state
   * @returns {void} Downloads JSON file
   */
  exportTournamentJSON(tournamentData) {
    const json = JSON.stringify(tournamentData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tournament_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Import tournament data from JSON file
   * @param {File} file - JSON file to import
   * @returns {Promise} Resolves with imported data
   */
  importTournamentJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          resolve(data);
        } catch (error) {
          reject(new Error('Invalid JSON file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
}

// Create global instance
let persistence = null;

function initPersistence(eventBus) {
  persistence = new PersistenceManager(eventBus);
  return persistence;
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PersistenceManager, initPersistence };
}
