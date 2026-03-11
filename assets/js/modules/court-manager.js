/**
 * ═══════════════════════════════════════════════════════════════════════
 * COURT MANAGER - Match scheduling across multiple courts
 * ═══════════════════════════════════════════════════════════════════════
 */

class CourtManager {
  constructor(eventBus, i18n) {
    this.eventBus = eventBus;
    this.i18n = i18n;
    this.courts = [];        // Array of court schedules
    this.matches = [];       // All scheduled matches with court/time info
    this.schedule = [];      // Timeline of scheduled matches
  }

  /**
   * Initialize courts
   * @param {number} courtCount - Number of courts (1-4)
   */
  initializeCourts(courtCount = 1) {
    if (courtCount < 1 || courtCount > 4) {
      console.warn('Court count must be between 1 and 4');
      return false;
    }

    this.courts = [];
    for (let i = 0; i < courtCount; i++) {
      this.courts.push({
        id: `court_${i}`,
        number: i + 1,
        matches: [],
        status: 'available'
      });
    }

    return true;
  }

  /**
   * Schedule a match to a specific court and time
   * @param {string} matchId - Match ID
   * @param {number} courtNumber - Court number (1-4)
   * @param {number} timeSlot - Time slot index (0, 1, 2, etc.)
   * @param {Object} matchData - Match object with team info
   * @returns {boolean} Success
   */
  scheduleMatch(matchId, courtNumber, timeSlot, matchData) {
    if (courtNumber < 1 || courtNumber > this.courts.length) {
      return false;
    }

    const court = this.courts[courtNumber - 1];

    // Check for conflicts
    const conflict = court.matches.find(m => m.timeSlot === timeSlot);
    if (conflict) {
      return false; // Time slot already occupied
    }

    const scheduled = {
      id: matchId,
      matchData: matchData,
      courtNumber: courtNumber,
      timeSlot: timeSlot,
      status: 'scheduled',
      startTime: this.calculateStartTime(timeSlot),
      duration: 30, // minutes
      completed: false
    };

    court.matches.push(scheduled);
    this.matches.push(scheduled);
    this.buildSchedule();

    this.eventBus.emit('match:scheduled', { matchId, courtNumber, timeSlot });
    return true;
  }

  /**
   * Calculate start time for a time slot
   * @param {number} timeSlot - Time slot index
   * @returns {string} Time in HH:MM format
   */
  calculateStartTime(timeSlot) {
    const startHour = 9; // 9:00 AM
    const minutes = timeSlot * 30; // 30 minutes per match
    const hour = startHour + Math.floor(minutes / 60);
    const min = minutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  /**
   * Auto-schedule all matches across available courts
   * Distributes matches to minimize conflicts
   * @param {Array} matches - Matches to schedule
   * @returns {boolean} Success
   */
  autoScheduleMatches(matches) {
    if (this.courts.length === 0) {
      return false;
    }

    let timeSlot = 0;
    let currentCourtIdx = 0;

    matches.forEach((match, idx) => {
      const court = this.courts[currentCourtIdx];

      // Schedule on current court
      this.scheduleMatch(match.id, court.number, timeSlot, match);

      // Rotate to next court
      currentCourtIdx = (currentCourtIdx + 1) % this.courts.length;

      // Increment time slot when all courts are used
      if (currentCourtIdx === 0) {
        timeSlot++;
      }
    });

    return true;
  }

  /**
   * Build schedule timeline
   */
  buildSchedule() {
    const scheduled = [...this.matches].sort((a, b) => {
      if (a.timeSlot !== b.timeSlot) {
        return a.timeSlot - b.timeSlot;
      }
      return a.courtNumber - b.courtNumber;
    });

    this.schedule = scheduled;
  }

  /**
   * Get schedule for display
   * @returns {Array} Grouped by time slot
   */
  getSchedule() {
    const grouped = {};

    this.schedule.forEach(match => {
      const timeSlot = match.timeSlot;
      if (!grouped[timeSlot]) {
        grouped[timeSlot] = {
          timeSlot: timeSlot,
          startTime: match.startTime,
          matches: []
        };
      }
      grouped[timeSlot].matches.push(match);
    });

    return Object.values(grouped);
  }

  /**
   * Get court schedule
   * @param {number} courtNumber - Court number
   * @returns {Array} Matches on that court
   */
  getCourtSchedule(courtNumber) {
    const court = this.courts.find(c => c.number === courtNumber);
    return court ? court.matches : [];
  }

  /**
   * Mark match as completed
   * @param {string} matchId - Match ID
   * @returns {boolean} Success
   */
  completeMatch(matchId) {
    const match = this.matches.find(m => m.id === matchId);
    if (match) {
      match.completed = true;
      match.status = 'completed';
      this.eventBus.emit('match:completed', { matchId });
      return true;
    }
    return false;
  }

  /**
   * Get upcoming matches
   * @returns {Array} Matches not yet completed
   */
  getUpcomingMatches() {
    return this.matches.filter(m => !m.completed);
  }

  /**
   * Get courts
   * @returns {Array} Courts array
   */
  getCourts() {
    return this.courts;
  }

  /**
   * Get court utilization percentage
   * @returns {number} Percentage (0-100)
   */
  getUtilization() {
    if (this.matches.length === 0) {
      return 0;
    }
    const completed = this.matches.filter(m => m.completed).length;
    return Math.round((completed / this.matches.length) * 100);
  }

  /**
   * Reschedule a match
   * @param {string} matchId - Match ID
   * @param {number} newCourtNumber - New court number
   * @param {number} newTimeSlot - New time slot
   * @returns {boolean} Success
   */
  rescheduleMatch(matchId, newCourtNumber, newTimeSlot) {
    const match = this.matches.find(m => m.id === matchId);
    if (!match) return false;

    // Remove from old court
    const oldCourt = this.courts[match.courtNumber - 1];
    oldCourt.matches = oldCourt.matches.filter(m => m.id !== matchId);

    // Add to new court
    const newCourt = this.courts[newCourtNumber - 1];
    match.courtNumber = newCourtNumber;
    match.timeSlot = newTimeSlot;
    match.startTime = this.calculateStartTime(newTimeSlot);

    newCourt.matches.push(match);
    this.buildSchedule();

    this.eventBus.emit('match:rescheduled', { matchId, newCourtNumber, newTimeSlot });
    return true;
  }

  /**
   * Clear all schedules
   */
  clear() {
    this.courts = [];
    this.matches = [];
    this.schedule = [];
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CourtManager };
}
