/**
 * Sync Manager Module
 * Handles offline-first synchronization with Supabase
 * Implements Dead Letter Queue (DLQ) pattern for failed transactions
 */

class SyncManager {
  constructor(supabaseClient, eventBus) {
    this.supabase = supabaseClient;
    this.eventBus = eventBus;

    this.syncQueue = [];              // Active/pending syncs
    this.deadLetterQueue = [];        // Failed transactions
    this.maxRetries = 5;
    this.retryDelays = [
      1000,   // 1s
      2000,   // 2s
      4000,   // 4s
      8000,   // 8s
      16000   // 16s
    ];

    this.isSyncing = false;
    this.lastSyncTime = null;

    // Load DLQ from localStorage on init
    this.restoreDeadLetterQueue();
  }

  /**
   * Queue a transaction for synchronization
   */
  queueTransaction(transaction) {
    if (!transaction.id) {
      transaction.id = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    transaction.status = 'pending';
    transaction.retryCount = 0;
    transaction.queuedAt = Date.now();

    this.syncQueue.push(transaction);

    eventBus.emit('sync:transaction-queued', {
      transactionId: transaction.id,
      type: transaction.type,
      timestamp: Date.now()
    });

    console.log(`[SyncManager] Transaction queued: ${transaction.id} (${transaction.type})`);
    return transaction.id;
  }

  /**
   * Process sync queue
   */
  async processQueue() {
    if (this.isSyncing || !this.supabase.isReady()) {
      return;
    }

    this.isSyncing = true;

    try {
      while (this.syncQueue.length > 0) {
        const transaction = this.syncQueue[0];
        const success = await this.syncTransaction(transaction);

        if (!success) {
          // Transaction failed, will be retried by retry logic
          break;
        }

        // Remove from queue on success
        this.syncQueue.shift();
      }
    } finally {
      this.isSyncing = false;
      this.lastSyncTime = Date.now();
    }
  }

  /**
   * Sync a single transaction
   */
  async syncTransaction(transaction) {
    const attempt = transaction.retryCount || 0;

    if (attempt >= this.maxRetries) {
      // Max retries exceeded, move to DLQ
      this.moveToDeadLetterQueue(transaction);
      return false;
    }

    try {
      transaction.status = 'syncing';

      // Execute the appropriate sync operation
      await this.executeSyncOperation(transaction);

      transaction.status = 'synced';
      transaction.syncedAt = Date.now();

      eventBus.emit('sync:success', {
        transactionId: transaction.id,
        type: transaction.type,
        timestamp: Date.now()
      });

      console.log(`[SyncManager] Transaction synced: ${transaction.id}`);
      return true;
    } catch (error) {
      transaction.retryCount = attempt + 1;
      transaction.lastError = error.message;
      transaction.lastErrorAt = Date.now();

      const nextRetryDelay = this.retryDelays[attempt];

      eventBus.emit('sync:retry', {
        transactionId: transaction.id,
        attempt: transaction.retryCount,
        maxAttempts: this.maxRetries,
        nextRetryIn: nextRetryDelay,
        error: error.message
      });

      // Schedule retry
      setTimeout(() => {
        this.syncTransaction(transaction);
      }, nextRetryDelay);

      return false;
    }
  }

  /**
   * Execute the actual sync operation based on transaction type
   */
  async executeSyncOperation(transaction) {
    switch (transaction.type) {
      case 'match:update':
        return await this.syncMatchUpdate(transaction);

      case 'court:lock':
        return await this.syncCourtLock(transaction);

      case 'tournament:update':
        return await this.syncTournamentUpdate(transaction);

      case 'team:update':
        return await this.syncTeamUpdate(transaction);

      default:
        throw new Error(`Unknown transaction type: ${transaction.type}`);
    }
  }

  /**
   * Sync match update
   */
  async syncMatchUpdate(transaction) {
    const { tournamentId, matchId, updates } = transaction.data;

    const { data, error } = await this.supabase.updateMatch(matchId, updates);

    if (error) {
      throw new Error(`Match update failed: ${error}`);
    }

    return data;
  }

  /**
   * Sync court lock acquisition
   */
  async syncCourtLock(transaction) {
    const { tournamentId, courtId, matchId, deviceUUID } = transaction.data;

    const { data, error } = await this.supabase.acquireCourtLock(
      tournamentId,
      courtId,
      matchId,
      deviceUUID
    );

    if (error) {
      throw new Error(`Court lock failed: ${error}`);
    }

    return data;
  }

  /**
   * Sync tournament update
   */
  async syncTournamentUpdate(transaction) {
    const { tournamentId, updates } = transaction.data;

    const { data, error } = await this.supabase.updateTournament(tournamentId, updates);

    if (error) {
      throw new Error(`Tournament update failed: ${error}`);
    }

    return data;
  }

  /**
   * Sync team update
   */
  async syncTeamUpdate(transaction) {
    const { teamId, updates } = transaction.data;

    // Assuming updateTeam exists in SupabaseClient
    const { data, error } = await this.supabase.updateTeam(teamId, updates);

    if (error) {
      throw new Error(`Team update failed: ${error}`);
    }

    return data;
  }

  /**
   * Move transaction to Dead Letter Queue
   */
  moveToDeadLetterQueue(transaction) {
    const dlqItem = {
      id: `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      transactionId: transaction.id,
      type: transaction.type,
      data: transaction.data,
      error: transaction.lastError,
      retryCount: transaction.retryCount,
      failedAt: Date.now(),
      status: 'failed'
    };

    this.deadLetterQueue.push(dlqItem);
    this.persistDeadLetterQueue();

    eventBus.emit('sync:dlq-item-added', {
      id: dlqItem.id,
      transactionId: transaction.id,
      type: transaction.type,
      failedAt: dlqItem.failedAt,
      lastError: dlqItem.error,
      retryCount: dlqItem.retryCount
    });

    console.warn(`[SyncManager] Transaction moved to DLQ: ${transaction.id}`);
  }

  /**
   * Skip a DLQ item (user chose to ignore it)
   */
  skipDLQItem(dlqItemId, reason) {
    const itemIndex = this.deadLetterQueue.findIndex(item => item.id === dlqItemId);

    if (itemIndex === -1) {
      console.warn(`[SyncManager] DLQ item not found: ${dlqItemId}`);
      return false;
    }

    const item = this.deadLetterQueue[itemIndex];
    item.status = 'skipped';
    item.skippedAt = Date.now();
    item.skipReason = reason;

    this.deadLetterQueue.splice(itemIndex, 1);
    this.persistDeadLetterQueue();

    eventBus.emit('sync:dlq-item-skipped', {
      dlqItemId,
      transactionId: item.transactionId,
      reason,
      skippedAt: item.skippedAt
    });

    console.log(`[SyncManager] DLQ item skipped: ${dlqItemId} (${reason})`);
    return true;
  }

  /**
   * Retry a DLQ item
   */
  retryDLQItem(dlqItemId) {
    const itemIndex = this.deadLetterQueue.findIndex(item => item.id === dlqItemId);

    if (itemIndex === -1) {
      console.warn(`[SyncManager] DLQ item not found: ${dlqItemId}`);
      return false;
    }

    const dlqItem = this.deadLetterQueue[itemIndex];

    // Convert DLQ item back to transaction
    const transaction = {
      id: dlqItem.transactionId,
      type: dlqItem.type,
      data: dlqItem.data,
      retryCount: 0  // Reset retry count
    };

    // Remove from DLQ
    this.deadLetterQueue.splice(itemIndex, 1);
    this.persistDeadLetterQueue();

    // Re-queue for sync
    this.queueTransaction(transaction);

    eventBus.emit('sync:dlq-item-retried', {
      dlqItemId,
      transactionId: dlqItem.transactionId
    });

    console.log(`[SyncManager] DLQ item re-queued: ${dlqItemId}`);
    return true;
  }

  /**
   * Get Dead Letter Queue items
   */
  getDeadLetterQueueItems() {
    return [...this.deadLetterQueue];
  }

  /**
   * Get Dead Letter Queue size
   */
  getDeadLetterQueueSize() {
    return this.deadLetterQueue.length;
  }

  /**
   * Persist DLQ to localStorage
   */
  persistDeadLetterQueue() {
    try {
      localStorage.setItem(
        'sync:dlq',
        JSON.stringify(this.deadLetterQueue)
      );
    } catch (error) {
      console.error('[SyncManager] Failed to persist DLQ:', error);
    }
  }

  /**
   * Restore DLQ from localStorage
   */
  restoreDeadLetterQueue() {
    try {
      const stored = localStorage.getItem('sync:dlq');
      if (stored) {
        this.deadLetterQueue = JSON.parse(stored);
        console.log(`[SyncManager] Restored ${this.deadLetterQueue.length} DLQ items`);
      }
    } catch (error) {
      console.error('[SyncManager] Failed to restore DLQ:', error);
      this.deadLetterQueue = [];
    }
  }

  /**
   * Clear all DLQ items
   */
  clearDeadLetterQueue() {
    this.deadLetterQueue = [];
    localStorage.removeItem('sync:dlq');
    console.log('[SyncManager] DLQ cleared');
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return {
      activeQueue: this.syncQueue.length,
      deadLetterQueue: this.deadLetterQueue.length,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      totalTransactions: this.syncQueue.length + this.deadLetterQueue.length
    };
  }

  /**
   * Cleanup
   */
  destroy() {
    this.syncQueue = [];
    this.deadLetterQueue = [];
  }
}

// Export as global or module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SyncManager;
}
