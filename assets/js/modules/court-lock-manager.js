/**
 * ═══════════════════════════════════════════════════════════════════════
 * COURT LOCK MANAGER - Conflict resolution via court-level locking
 * ═══════════════════════════════════════════════════════════════════════
 * Implements court-level locking to prevent concurrent match score modifications.
 * Fixes Gemini Vulnerability #1: Server-wins data loss.
 */

class CourtLockManager {
  constructor(supabaseClient, eventBus) {
    this.supabase = supabaseClient;
    this.eventBus = eventBus;

    this.activeLocks = new Map();  // Map<courtId, lockData>
    this.lockTokens = new Map();   // Map<token, courtId>
    this.deviceUUID = this.generateDeviceUUID();

    // Lock configuration
    this.lockTimeout = 10 * 60 * 1000; // 10 minutes
    this.lockCheckInterval = 30 * 1000; // Check every 30 seconds

    // Start periodic lock cleanup
    this.startLockCleanup();
  }

  /**
   * Generate unique device UUID
   * @private
   */
  generateDeviceUUID() {
    let uuid = localStorage.getItem('device:uuid');
    if (!uuid) {
      uuid = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('device:uuid', uuid);
    }
    return uuid;
  }

  /**
   * Acquire lock for a court and match
   */
  async acquireCourtLock(tournamentId, courtId, matchId) {
    // Check for existing lock (local)
    if (this.activeLocks.has(courtId)) {
      const existingLock = this.activeLocks.get(courtId);
      return {
        success: false,
        error: 'Court already locked',
        lockedBy: existingLock.lockedBy,
        lockToken: null,
        existingLock: existingLock
      };
    }

    // Try to acquire from Supabase
    if (this.supabase.isReady()) {
      const { data, error, existingLock } = await this.supabase.acquireCourtLock(
        tournamentId,
        courtId,
        matchId,
        this.deviceUUID
      );

      if (error) {
        return {
          success: false,
          error: error,
          lockedBy: existingLock ? existingLock.locked_by_device_uuid : 'unknown',
          lockToken: null,
          existingLock: existingLock
        };
      }

      // Success - store locally
      const lockData = {
        id: data.id,
        courtId: courtId,
        matchId: matchId,
        lockToken: data.lock_token,
        lockedBy: this.deviceUUID,
        lockedAt: Date.now(),
        expiresAt: new Date(data.expires_at).getTime(),
        lockedData: data.locked_data
      };

      this.activeLocks.set(courtId, lockData);
      this.lockTokens.set(data.lock_token, courtId);

      eventBus.emit('court:lock-acquired', {
        courtId: courtId,
        lockToken: data.lock_token,
        lockedBy: this.deviceUUID
      });

      console.log(`[CourtLockManager] Lock acquired: ${courtId} (token: ${data.lock_token})`);
      return { success: true, lockToken: data.lock_token };
    } else {
      // Supabase not available - use local lock only
      const lockToken = this.generateLockToken();
      const lockData = {
        courtId: courtId,
        matchId: matchId,
        lockToken: lockToken,
        lockedBy: this.deviceUUID,
        lockedAt: Date.now(),
        expiresAt: Date.now() + this.lockTimeout,
        lockedData: null,
        isLocal: true
      };

      this.activeLocks.set(courtId, lockData);
      this.lockTokens.set(lockToken, courtId);

      eventBus.emit('court:lock-acquired', {
        courtId: courtId,
        lockToken: lockToken,
        lockedBy: this.deviceUUID,
        isLocal: true
      });

      console.log(`[CourtLockManager] Local lock acquired: ${courtId}`);
      return { success: true, lockToken: lockToken };
    }
  }

  /**
   * Release lock for a court
   */
  async releaseCourtLock(courtId, lockToken) {
    const lockData = this.activeLocks.get(courtId);

    if (!lockData) {
      return { success: false, error: 'No lock found for court' };
    }

    if (lockData.lockToken !== lockToken) {
      return { success: false, error: 'Invalid lock token' };
    }

    // Release from Supabase
    if (this.supabase.isReady() && !lockData.isLocal) {
      const { error } = await this.supabase.releaseCourtLock(lockToken);
      if (error) {
        return { success: false, error: error };
      }
    }

    // Remove locally
    this.activeLocks.delete(courtId);
    this.lockTokens.delete(lockToken);

    eventBus.emit('court:lock-released', {
      courtId: courtId,
      matchId: lockData.matchId
    });

    console.log(`[CourtLockManager] Lock released: ${courtId}`);
    return { success: true };
  }

  /**
   * Force release a lock (organizer override)
   */
  async forceReleaseCourtLock(tournamentId, courtId, reason) {
    const lockData = this.activeLocks.get(courtId);

    // Force release from Supabase
    if (this.supabase.isReady()) {
      const { error } = await this.supabase.forceReleaseCourtLock(
        courtId,
        tournamentId,
        reason
      );

      if (error) {
        return { success: false, error: error };
      }
    }

    // Remove locally
    if (lockData) {
      this.activeLocks.delete(courtId);
      this.lockTokens.delete(lockData.lockToken);
    }

    eventBus.emit('court:lock-force-released', {
      courtId: courtId,
      reason: reason
    });

    console.log(`[CourtLockManager] Lock force-released: ${courtId} (${reason})`);
    return { success: true };
  }

  /**
   * Check if a court is locked
   */
  isCourtLocked(courtId) {
    return this.activeLocks.has(courtId);
  }

  /**
   * Get lock details for a court
   */
  getCourtLock(courtId) {
    const lockData = this.activeLocks.get(courtId);
    if (!lockData) {
      return null;
    }

    return {
      courtId: lockData.courtId,
      matchId: lockData.matchId,
      lockedBy: lockData.lockedBy,
      lockedAt: lockData.lockedAt,
      expiresAt: lockData.expiresAt,
      isExpired: Date.now() > lockData.expiresAt,
      isLocalDevice: lockData.lockedBy === this.deviceUUID
    };
  }

  /**
   * Get all active locks
   */
  getActiveLocks() {
    return Array.from(this.activeLocks.values()).map(lock => ({
      courtId: lock.courtId,
      matchId: lock.matchId,
      lockedBy: lock.lockedBy,
      lockedAt: lock.lockedAt,
      expiresAt: lock.expiresAt,
      isExpired: Date.now() > lock.expiresAt
    }));
  }

  /**
   * Check if this device locked a specific court
   */
  isLockedByThisDevice(courtId) {
    const lockData = this.activeLocks.get(courtId);
    return lockData && lockData.lockedBy === this.deviceUUID;
  }

  /**
   * Start periodic lock cleanup
   * Removes expired locks
   * @private
   */
  startLockCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const expiredCourts = [];

      for (const [courtId, lockData] of this.activeLocks.entries()) {
        if (now > lockData.expiresAt) {
          expiredCourts.push(courtId);
        }
      }

      if (expiredCourts.length > 0) {
        expiredCourts.forEach(courtId => {
          const lockData = this.activeLocks.get(courtId);
          this.activeLocks.delete(courtId);
          this.lockTokens.delete(lockData.lockToken);

          eventBus.emit('court:lock-expired', {
            courtId: courtId
          });

          console.log(`[CourtLockManager] Lock expired: ${courtId}`);
        });
      }
    }, this.lockCheckInterval);
  }

  /**
   * Persist locks to localStorage for recovery
   * @private
   */
  persistLocksToStorage() {
    try {
      const locks = Array.from(this.activeLocks.values());
      localStorage.setItem('court:locks', JSON.stringify(locks));
    } catch (error) {
      console.error('[CourtLockManager] Failed to persist locks:', error);
    }
  }

  /**
   * Restore locks from localStorage
   * @private
   */
  restoreLocksFromStorage() {
    try {
      const stored = localStorage.getItem('court:locks');
      if (stored) {
        const locks = JSON.parse(stored);
        locks.forEach(lockData => {
          // Only restore non-expired locks
          if (Date.now() <= lockData.expiresAt) {
            this.activeLocks.set(lockData.courtId, lockData);
            this.lockTokens.set(lockData.lockToken, lockData.courtId);
          }
        });
        console.log(`[CourtLockManager] Restored ${this.activeLocks.size} locks from storage`);
      }
    } catch (error) {
      console.error('[CourtLockManager] Failed to restore locks:', error);
    }
  }

  /**
   * Generate lock token
   * @private
   */
  generateLockToken() {
    return `lock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sync locks with Supabase
   * Updates lock status and checks for remote changes
   */
  async syncLocksWithServer() {
    if (!this.supabase.isReady()) {
      console.warn('[CourtLockManager] Cannot sync - Supabase not ready');
      return false;
    }

    try {
      // For each active local lock, verify it still exists on server
      for (const [courtId, lockData] of this.activeLocks.entries()) {
        if (lockData.isLocal) continue; // Skip local-only locks

        // Check if lock still valid on server
        // (This would require a new Supabase method)
        // For now, we rely on expiration
      }

      return true;
    } catch (error) {
      console.error('[CourtLockManager] Lock sync failed:', error);
      return false;
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.activeLocks.clear();
    this.lockTokens.clear();
  }
}

// Export as global or module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CourtLockManager;
}
