/**
 * Supabase Client Module
 * Centralized connection, CRUD operations, and real-time subscriptions
 * Handles offline-first architecture with sync queue
 */

class SupabaseClient {
  constructor(supabaseUrl, supabaseKey) {
    if (!supabaseUrl || !supabaseKey) {
      console.warn('SupabaseClient: Missing credentials. Operating in offline-only mode.');
      this.initialized = false;
      return;
    }

    try {
      // Initialize Supabase client (assumes supabase-js library loaded)
      if (typeof supabase === 'undefined') {
        throw new Error('supabase-js library not loaded');
      }

      this.client = supabase.createClient(supabaseUrl, supabaseKey);
      this.initialized = true;
      this.subscriptions = new Map();
    } catch (error) {
      console.error('SupabaseClient: Initialization failed', error);
      this.initialized = false;
    }
  }

  /**
   * Check if Supabase is connected and ready
   */
  isReady() {
    return this.initialized && this.client !== undefined;
  }

  /**
   * Tournament CRUD Operations
   */

  async createTournament(tournamentData) {
    if (!this.isReady()) {
      return { error: 'Supabase not initialized', data: null };
    }

    try {
      const { data, error } = await this.client
        .from('tournaments')
        .insert([tournamentData])
        .select();

      if (error) throw error;
      return { data: data[0], error: null };
    } catch (error) {
      console.error('Failed to create tournament:', error);
      return { data: null, error: error.message };
    }
  }

  async getTournament(tournamentId) {
    if (!this.isReady()) {
      return { error: 'Supabase not initialized', data: null };
    }

    try {
      const { data, error } = await this.client
        .from('tournaments')
        .select('*')
        .eq('id', tournamentId)
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Failed to fetch tournament:', error);
      return { data: null, error: error.message };
    }
  }

  async updateTournament(tournamentId, updates) {
    if (!this.isReady()) {
      return { error: 'Supabase not initialized', data: null };
    }

    try {
      const { data, error } = await this.client
        .from('tournaments')
        .update(updates)
        .eq('id', tournamentId)
        .select();

      if (error) throw error;
      return { data: data[0], error: null };
    } catch (error) {
      console.error('Failed to update tournament:', error);
      return { data: null, error: error.message };
    }
  }

  /**
   * Match Operations
   */

  async createMatch(matchData) {
    if (!this.isReady()) {
      return { error: 'Supabase not initialized', data: null };
    }

    try {
      const { data, error } = await this.client
        .from('matches')
        .insert([matchData])
        .select();

      if (error) throw error;
      return { data: data[0], error: null };
    } catch (error) {
      console.error('Failed to create match:', error);
      return { data: null, error: error.message };
    }
  }

  async getMatches(tournamentId) {
    if (!this.isReady()) {
      return { error: 'Supabase not initialized', data: [] };
    }

    try {
      const { data, error } = await this.client
        .from('matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('match_number', { ascending: true });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Failed to fetch matches:', error);
      return { data: [], error: error.message };
    }
  }

  async updateMatch(matchId, updates) {
    if (!this.isReady()) {
      return { error: 'Supabase not initialized', data: null };
    }

    try {
      const { data, error } = await this.client
        .from('matches')
        .update(updates)
        .eq('id', matchId)
        .select();

      if (error) throw error;
      return { data: data[0], error: null };
    } catch (error) {
      console.error('Failed to update match:', error);
      return { data: null, error: error.message };
    }
  }

  /**
   * Court Lock Operations (Conflict Resolution)
   */

  async acquireCourtLock(tournamentId, courtId, matchId, deviceUUID) {
    if (!this.isReady()) {
      return { error: 'Supabase not initialized', data: null };
    }

    try {
      const lockToken = this.generateLockToken();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

      // Check for existing active locks
      const { data: existingLocks, error: checkError } = await this.client
        .from('court_locks')
        .select('*')
        .eq('court_id', courtId)
        .eq('tournament_id', tournamentId)
        .gt('expires_at', now.toISOString());

      if (checkError) throw checkError;

      if (existingLocks && existingLocks.length > 0) {
        return {
          data: null,
          error: `Court is locked by ${existingLocks[0].locked_by_device_uuid}`,
          existingLock: existingLocks[0]
        };
      }

      // Create new lock
      const { data, error } = await this.client
        .from('court_locks')
        .insert([{
          tournament_id: tournamentId,
          court_id: courtId,
          match_id: matchId,
          locked_by_device_uuid: deviceUUID,
          lock_token: lockToken,
          expires_at: expiresAt.toISOString()
        }])
        .select();

      if (error) throw error;
      return { data: data[0], error: null };
    } catch (error) {
      console.error('Failed to acquire court lock:', error);
      return { data: null, error: error.message };
    }
  }

  async releaseCourtLock(lockToken) {
    if (!this.isReady()) {
      return { error: 'Supabase not initialized', data: null };
    }

    try {
      const { data, error } = await this.client
        .from('court_locks')
        .delete()
        .eq('lock_token', lockToken);

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Failed to release court lock:', error);
      return { data: null, error: error.message };
    }
  }

  async forceReleaseCourtLock(courtId, tournamentId, reason) {
    if (!this.isReady()) {
      return { error: 'Supabase not initialized', data: null };
    }

    try {
      const { data: locks, error: fetchError } = await this.client
        .from('court_locks')
        .select('*')
        .eq('court_id', courtId)
        .eq('tournament_id', tournamentId);

      if (fetchError) throw fetchError;

      if (!locks || locks.length === 0) {
        return { data: null, error: 'No active lock found' };
      }

      // Log audit event
      await this.logAuditEvent({
        type: 'lock_force_released',
        court_id: courtId,
        tournament_id: tournamentId,
        reason: reason
      });

      // Delete lock
      const { error: deleteError } = await this.client
        .from('court_locks')
        .delete()
        .eq('id', locks[0].id);

      if (deleteError) throw deleteError;
      return { data: locks[0], error: null };
    } catch (error) {
      console.error('Failed to force release court lock:', error);
      return { data: null, error: error.message };
    }
  }

  /**
   * Dead Letter Queue Operations (Sync Failures)
   */

  async addToDeadLetterQueue(dlqItem) {
    if (!this.isReady()) {
      return { error: 'Supabase not initialized', data: null };
    }

    try {
      const { data, error } = await this.client
        .from('sync_dead_letter_queue')
        .insert([dlqItem])
        .select();

      if (error) throw error;
      return { data: data[0], error: null };
    } catch (error) {
      console.error('Failed to add to DLQ:', error);
      return { data: null, error: error.message };
    }
  }

  async getDeadLetterQueueItems(tournamentId) {
    if (!this.isReady()) {
      return { error: 'Supabase not initialized', data: [] };
    }

    try {
      const { data, error } = await this.client
        .from('sync_dead_letter_queue')
        .select('*')
        .eq('tournament_id', tournamentId)
        .is('skipped_at', null)
        .order('failed_at', { ascending: false });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Failed to fetch DLQ items:', error);
      return { data: [], error: error.message };
    }
  }

  async skipDLQItem(dlqItemId, reason) {
    if (!this.isReady()) {
      return { error: 'Supabase not initialized', data: null };
    }

    try {
      const { data, error } = await this.client
        .from('sync_dead_letter_queue')
        .update({
          skipped_at: new Date().toISOString(),
          skip_reason: reason
        })
        .eq('id', dlqItemId)
        .select();

      if (error) throw error;
      return { data: data[0], error: null };
    } catch (error) {
      console.error('Failed to skip DLQ item:', error);
      return { data: null, error: error.message };
    }
  }

  /**
   * Real-Time Subscriptions
   */

  subscribeToMatches(tournamentId, callback) {
    if (!this.isReady()) {
      console.warn('SupabaseClient: Cannot subscribe - not initialized');
      return null;
    }

    try {
      const subscription = this.client
        .from(`matches:tournament_id=eq.${tournamentId}`)
        .on('*', payload => {
          callback(payload);
        })
        .subscribe();

      const subKey = `matches:${tournamentId}`;
      this.subscriptions.set(subKey, subscription);
      return subKey;
    } catch (error) {
      console.error('Failed to subscribe to matches:', error);
      return null;
    }
  }

  subscribeToCourtLocks(tournamentId, callback) {
    if (!this.isReady()) {
      console.warn('SupabaseClient: Cannot subscribe - not initialized');
      return null;
    }

    try {
      const subscription = this.client
        .from(`court_locks:tournament_id=eq.${tournamentId}`)
        .on('*', payload => {
          callback(payload);
        })
        .subscribe();

      const subKey = `locks:${tournamentId}`;
      this.subscriptions.set(subKey, subscription);
      return subKey;
    } catch (error) {
      console.error('Failed to subscribe to court locks:', error);
      return null;
    }
  }

  unsubscribe(subscriptionKey) {
    if (!this.subscriptions.has(subscriptionKey)) {
      console.warn(`Subscription not found: ${subscriptionKey}`);
      return false;
    }

    try {
      const subscription = this.subscriptions.get(subscriptionKey);
      subscription.unsubscribe();
      this.subscriptions.delete(subscriptionKey);
      return true;
    } catch (error) {
      console.error('Failed to unsubscribe:', error);
      return false;
    }
  }

  /**
   * Audit Logging
   */

  async logAuditEvent(event) {
    if (!this.isReady()) {
      console.warn('SupabaseClient: Audit logging disabled - not initialized');
      return false;
    }

    try {
      await this.client
        .from('audit_logs')
        .insert([{
          ...event,
          timestamp: new Date().toISOString()
        }]);
      return true;
    } catch (error) {
      console.error('Failed to log audit event:', error);
      return false;
    }
  }

  /**
   * Utility Functions
   */

  generateLockToken() {
    return `lock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Health Check
   */

  async healthCheck() {
    if (!this.isReady()) {
      return { healthy: false, message: 'Supabase not initialized' };
    }

    try {
      // Simple query to verify connection
      const { error } = await this.client
        .from('tournaments')
        .select('id')
        .limit(1);

      if (error) throw error;
      return { healthy: true, message: 'Connected' };
    } catch (error) {
      return { healthy: false, message: error.message };
    }
  }

  /**
   * Cleanup
   */

  destroy() {
    // Unsubscribe from all subscriptions
    for (const [key, subscription] of this.subscriptions.entries()) {
      try {
        subscription.unsubscribe();
      } catch (error) {
        console.warn(`Failed to unsubscribe from ${key}:`, error);
      }
    }

    this.subscriptions.clear();
    this.client = null;
    this.initialized = false;
  }
}

// Export as global or module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SupabaseClient;
}
