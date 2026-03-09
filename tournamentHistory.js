/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TOURNAMENT HISTORY & UNDO/REDO MODULE
 * Track tournament changes and allow full undo/redo capability
 * ═══════════════════════════════════════════════════════════════════════════════
 */

class TournamentHistory {
  constructor(tournament) {
    this.tournament = tournament;
    this.history = [];
    this.currentStateIndex = -1;
    this.maxHistorySize = 100;  // Limit memory usage

    // Take initial snapshot
    this.takeSnapshot("Tournament initialized");
  }

  /**
   * Take snapshot of current tournament state
   * @param {string} description - What changed
   */
  takeSnapshot(description = "Tournament modified") {
    // Remove any redo history if we're not at the end
    if (this.currentStateIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentStateIndex + 1);
    }

    // Create snapshot
    const snapshot = {
      timestamp: new Date().toISOString(),
      description,
      tournament: JSON.parse(JSON.stringify(this.tournament.toJSON())),
      tourState: JSON.parse(JSON.stringify({
        id: this.tournament.id,
        name: this.tournament.name,
        status: this.tournament.status
      }))
    };

    this.history.push(snapshot);
    this.currentStateIndex = this.history.length - 1;

    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
      this.currentStateIndex--;
    }

    return snapshot;
  }

  /**
   * Undo last action
   * @returns {boolean} Success status
   */
  undo() {
    if (this.currentStateIndex <= 0) {
      console.warn("⚠️  No more history to undo");
      return false;
    }

    this.currentStateIndex--;
    return this._restoreSnapshot(this.currentStateIndex);
  }

  /**
   * Redo last undone action
   * @returns {boolean} Success status
   */
  redo() {
    if (this.currentStateIndex >= this.history.length - 1) {
      console.warn("⚠️  No more history to redo");
      return false;
    }

    this.currentStateIndex++;
    return this._restoreSnapshot(this.currentStateIndex);
  }

  /**
   * Restore tournament to specific snapshot
   * @private
   */
  _restoreSnapshot(index) {
    if (index < 0 || index >= this.history.length) {
      return false;
    }

    const snapshot = this.history[index];

    try {
      // Restore teams
      this.tournament.teams = JSON.parse(JSON.stringify(snapshot.tournament.teams));

      // Restore matches
      this.tournament.matches = {};
      snapshot.tournament.matches.forEach(m => {
        this.tournament.matches[m.id] = m;
      });

      // Rebuild bracket structure
      this._rebuildBracket(snapshot.tournament);

      // Restore tournament state
      this.tournament.status = snapshot.tourState.status;
      this.tournament.updatedAt = new Date().toISOString();

      console.log(`✅ Restored to: ${snapshot.description}`);
      return true;
    } catch (error) {
      console.error("❌ Failed to restore snapshot:", error);
      return false;
    }
  }

  /**
   * Rebuild bracket structure from snapshot
   * @private
   */
  _rebuildBracket(snapshotData) {
    this.tournament.bracket = {
      winners: snapshotData.matches.filter(m => m.bracket === "WB"),
      losers: snapshotData.matches.filter(m => m.bracket === "LB"),
      grand_final: snapshotData.matches.find(m => m.bracket === "GRAND_FINAL"),
      super_final: snapshotData.matches.find(m => m.bracket === "SUPER_FINAL")
    };
  }

  /**
   * Check if can undo
   * @returns {boolean}
   */
  canUndo() {
    return this.currentStateIndex > 0;
  }

  /**
   * Check if can redo
   * @returns {boolean}
   */
  canRedo() {
    return this.currentStateIndex < this.history.length - 1;
  }

  /**
   * Get current state description
   * @returns {string}
   */
  getCurrentDescription() {
    if (this.currentStateIndex < 0) return "No state";
    return this.history[this.currentStateIndex].description;
  }

  /**
   * Get undo/redo stack for UI display
   * @returns {Array} History entries
   */
  getHistoryStack() {
    return this.history.map((snap, idx) => ({
      index: idx,
      description: snap.description,
      timestamp: snap.timestamp,
      isCurrent: idx === this.currentStateIndex,
      canRestore: true
    }));
  }

  /**
   * Jump to specific history point
   * @param {number} index - History index
   * @returns {boolean} Success status
   */
  jumpToHistory(index) {
    if (index < 0 || index >= this.history.length) {
      return false;
    }

    this.currentStateIndex = index;
    return this._restoreSnapshot(index);
  }

  /**
   * Get changes between two snapshots
   * @param {number} fromIndex - Start index
   * @param {number} toIndex - End index
   * @returns {Object} Changes summary
   */
  getChanges(fromIndex, toIndex) {
    if (fromIndex < 0 || toIndex >= this.history.length) return null;

    const fromSnap = this.history[fromIndex];
    const toSnap = this.history[toIndex];

    const fromMatches = new Map(
      fromSnap.tournament.matches.map(m => [m.id, m])
    );
    const toMatches = new Map(
      toSnap.tournament.matches.map(m => [m.id, m])
    );

    const changes = {
      description: `Changes from "${fromSnap.description}" to "${toSnap.description}"`,
      matchesUpdated: [],
      matchesCompleted: 0,
      matchesUndo: 0
    };

    // Find updated matches
    toMatches.forEach((toMatch, id) => {
      const fromMatch = fromMatches.get(id);

      if (!fromMatch) return;  // New match

      if (fromMatch.status !== toMatch.status) {
        changes.matchesUpdated.push({
          id,
          from: fromMatch.status,
          to: toMatch.status
        });

        if (toMatch.status === "completed" && fromMatch.status !== "completed") {
          changes.matchesCompleted++;
        } else if (fromMatch.status === "completed" && toMatch.status !== "completed") {
          changes.matchesUndo++;
        }
      }
    });

    return changes;
  }

  /**
   * Get history summary
   * @returns {Object} Summary statistics
   */
  getSummary() {
    return {
      totalSnapshots: this.history.length,
      currentIndex: this.currentStateIndex,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      currentDescription: this.getCurrentDescription(),
      upToDate: this.currentStateIndex === this.history.length - 1
    };
  }

  /**
   * Clear history (for cleanup)
   */
  clearHistory() {
    this.history = [];
    this.currentStateIndex = -1;
    this.takeSnapshot("History cleared");
  }

  /**
   * Export history as JSON
   * @returns {string} JSON string
   */
  exportHistory() {
    return JSON.stringify({
      exported: new Date().toISOString(),
      count: this.history.length,
      currentIndex: this.currentStateIndex,
      snapshots: this.history
    }, null, 2);
  }

  /**
   * Get memory usage estimate
   * @returns {Object} Memory stats
   */
  getMemoryUsage() {
    const sizeInBytes = JSON.stringify(this.history).length;

    return {
      snapshots: this.history.length,
      sizeBytes: sizeInBytes,
      sizeKB: (sizeInBytes / 1024).toFixed(2),
      sizeMB: (sizeInBytes / 1024 / 1024).toFixed(3)
    };
  }
}

// ════════════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════════════

if (typeof module !== "undefined" && module.exports) {
  module.exports = { TournamentHistory };
}
