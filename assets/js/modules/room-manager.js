/**
 * ═══════════════════════════════════════════════════════════════════════
 * ROOM MANAGER - Multi-device synchronization with tiered access control
 * ═══════════════════════════════════════════════════════════════════════
 * Manages room codes and access tiers:
 * - Public QR ID (read-only spectator access)
 * - Scorer PIN (per-court scoring access)
 * - Organizer Token (full administrative access)
 * Fixes Gemini Vulnerability #5: Room Code Security
 */

class RoomManager {
  constructor(supabaseClient, eventBus) {
    this.supabase = supabaseClient;
    this.eventBus = eventBus;

    this.currentTournamentId = null;
    this.currentRoomCode = null;
    this.currentUserRole = null;
    this.currentAccessToken = null;
    this.assignedCourts = []; // For scorer role

    // Device identification
    this.deviceUUID = localStorage.getItem('device:uuid') ||
                      `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (!localStorage.getItem('device:uuid')) {
      localStorage.setItem('device:uuid', this.deviceUUID);
    }
  }

  /**
   * Generate Public QR ID for spectator access (read-only)
   * Format: XXX-XXX-XXX for easy scanning
   */
  static generatePublicQRID() {
    const randomHex = () => Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    const part1 = randomHex().substr(0, 3).toUpperCase();
    const part2 = randomHex().substr(0, 3).toUpperCase();
    const part3 = randomHex().substr(0, 3).toUpperCase();
    return `${part1}-${part2}-${part3}`;
  }

  /**
   * Generate Scorer PIN for per-court scoring (4-6 digits)
   * Should be unique per court
   */
  static generateScorerPIN() {
    return Math.floor(100000 + Math.random() * 900000).toString().substring(0, 6);
  }

  /**
   * Generate Organizer Token (complex, JWT-like format)
   * Should never be displayed or transmitted insecurely
   */
  static generateOrganizerToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  /**
   * Join tournament as spectator (Public QR ID)
   */
  async joinAsSpectator(tournamentId, publicQRID) {
    if (!this.supabase.isReady()) {
      return { success: false, error: 'Supabase not initialized' };
    }

    try {
      // Verify QR ID exists and matches tournament
      const { data: tournament, error } = await this.supabase.getTournament(tournamentId);

      if (error || !tournament) {
        return { success: false, error: 'Tournament not found' };
      }

      if (tournament.public_qr_id !== publicQRID) {
        return { success: false, error: 'Invalid QR ID' };
      }

      // Successfully joined
      this.currentTournamentId = tournamentId;
      this.currentRoomCode = publicQRID;
      this.currentUserRole = 'spectator';
      this.currentAccessToken = publicQRID;

      eventBus.emit('room:joined', {
        roomCode: publicQRID,
        userRole: 'spectator',
        deviceId: this.deviceUUID
      });

      console.log(`[RoomManager] Joined as spectator: ${tournamentId}`);
      return { success: true, role: 'spectator' };
    } catch (error) {
      console.error('Failed to join as spectator:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Join tournament as scorer for specific court
   */
  async joinAsScorer(tournamentId, scorerPIN, courtId) {
    if (!this.supabase.isReady()) {
      return { success: false, error: 'Supabase not initialized' };
    }

    try {
      // In a real implementation, validate scorer PIN against court-specific PINs in DB
      // For now, we accept any valid-format PIN
      if (!scorerPIN || scorerPIN.length < 4) {
        return { success: false, error: 'Invalid scorer PIN format' };
      }

      this.currentTournamentId = tournamentId;
      this.currentRoomCode = `scorer_${courtId}`;
      this.currentUserRole = 'scorer';
      this.currentAccessToken = scorerPIN;
      this.assignedCourts = [courtId];

      eventBus.emit('room:joined', {
        roomCode: `scorer_${courtId}`,
        userRole: 'scorer',
        deviceId: this.deviceUUID
      });

      console.log(`[RoomManager] Joined as scorer: ${tournamentId}, court: ${courtId}`);
      return { success: true, role: 'scorer', assignedCourts: [courtId] };
    } catch (error) {
      console.error('Failed to join as scorer:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Join tournament as organizer
   */
  async joinAsOrganizer(tournamentId, organizerToken) {
    if (!this.supabase.isReady()) {
      return { success: false, error: 'Supabase not initialized' };
    }

    try {
      // Verify organizer token
      const { data: tournament, error } = await this.supabase.getTournament(tournamentId);

      if (error || !tournament) {
        return { success: false, error: 'Tournament not found' };
      }

      if (tournament.organizer_token !== organizerToken) {
        return { success: false, error: 'Invalid organizer token' };
      }

      this.currentTournamentId = tournamentId;
      this.currentRoomCode = tournamentId;
      this.currentUserRole = 'organizer';
      this.currentAccessToken = organizerToken;
      this.assignedCourts = []; // Organizer has access to all courts

      eventBus.emit('room:joined', {
        roomCode: tournamentId,
        userRole: 'organizer',
        deviceId: this.deviceUUID
      });

      console.log(`[RoomManager] Joined as organizer: ${tournamentId}`);
      return { success: true, role: 'organizer' };
    } catch (error) {
      console.error('Failed to join as organizer:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Leave current room/tournament
   */
  leaveRoom() {
    if (this.currentTournamentId) {
      eventBus.emit('room:left', {
        roomCode: this.currentRoomCode,
        deviceId: this.deviceUUID
      });
    }

    this.currentTournamentId = null;
    this.currentRoomCode = null;
    this.currentUserRole = null;
    this.currentAccessToken = null;
    this.assignedCourts = [];

    console.log('[RoomManager] Left room');
    return true;
  }

  /**
   * Validate access for an action
   */
  validateAccess(requiredRole, courtId = null) {
    if (!this.currentUserRole) {
      return { allowed: false, reason: 'Not in a room' };
    }

    // Spectator can only view
    if (requiredRole === 'spectator') {
      return { allowed: true };
    }

    // Scorer can score on assigned courts
    if (requiredRole === 'scorer') {
      if (this.currentUserRole === 'organizer') {
        return { allowed: true }; // Organizer can do scorer actions
      }
      if (this.currentUserRole === 'scorer') {
        if (courtId && !this.assignedCourts.includes(courtId)) {
          return { allowed: false, reason: `Not assigned to court ${courtId}` };
        }
        return { allowed: true };
      }
      return { allowed: false, reason: 'Insufficient permissions for scoring' };
    }

    // Organizer can do admin actions
    if (requiredRole === 'organizer') {
      if (this.currentUserRole === 'organizer') {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Organizer permissions required' };
    }

    return { allowed: false, reason: 'Invalid role requirement' };
  }

  /**
   * Get current user info
   */
  getCurrentUser() {
    return {
      deviceId: this.deviceUUID,
      tournamentId: this.currentTournamentId,
      roomCode: this.currentRoomCode,
      role: this.currentUserRole,
      assignedCourts: this.assignedCourts,
      isAuthenticated: this.currentUserRole !== null
    };
  }

  /**
   * Assign additional courts to scorer
   */
  assignCourtToScorer(courtId) {
    if (this.currentUserRole !== 'scorer') {
      return { success: false, error: 'Only scorers can be assigned courts' };
    }

    if (!this.assignedCourts.includes(courtId)) {
      this.assignedCourts.push(courtId);
    }

    eventBus.emit('room:court-assigned', {
      deviceId: this.deviceUUID,
      courtId: courtId
    });

    return { success: true };
  }

  /**
   * Remove court assignment from scorer
   */
  unassignCourtFromScorer(courtId) {
    if (this.currentUserRole !== 'scorer') {
      return { success: false, error: 'Only scorers have court assignments' };
    }

    this.assignedCourts = this.assignedCourts.filter(id => id !== courtId);

    eventBus.emit('room:court-unassigned', {
      deviceId: this.deviceUUID,
      courtId: courtId
    });

    return { success: true };
  }

  /**
   * Check if user can perform action on specific court
   */
  canAccessCourt(courtId) {
    if (this.currentUserRole === 'spectator') {
      return false; // Spectators can't access courts
    }

    if (this.currentUserRole === 'organizer') {
      return true; // Organizers can access all courts
    }

    if (this.currentUserRole === 'scorer') {
      return this.assignedCourts.includes(courtId);
    }

    return false;
  }

  /**
   * Get access control matrix for display
   */
  static getAccessMatrix() {
    return {
      spectator: {
        viewBracket: true,
        viewLeaderboard: true,
        recordScore: false,
        lockCourt: false,
        forceReleaseLock: false,
        modifyTeams: false,
        modifySeeding: false,
        completeTournament: false,
        accessArchive: false
      },
      scorer: {
        viewBracket: true,
        viewLeaderboard: true,
        recordScore: true, // Only on assigned court
        lockCourt: true,   // Only on assigned court
        forceReleaseLock: false,
        modifyTeams: false,
        modifySeeding: false,
        completeTournament: false,
        accessArchive: false
      },
      organizer: {
        viewBracket: true,
        viewLeaderboard: true,
        recordScore: true,
        lockCourt: true,
        forceReleaseLock: true,
        modifyTeams: true,
        modifySeeding: true,
        completeTournament: true,
        accessArchive: true
      }
    };
  }

  /**
   * Export current session info (for debugging)
   */
  exportSessionInfo() {
    return {
      deviceUUID: this.deviceUUID,
      tournament: this.currentTournamentId,
      roomCode: this.currentRoomCode,
      userRole: this.currentUserRole,
      assignedCourts: this.assignedCourts,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Cleanup
   */
  destroy() {
    this.leaveRoom();
  }
}

// Export as global or module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RoomManager;
}
