/**
 * ═══════════════════════════════════════════════
 * EVENT EMITTER - Simple pub/sub event bus
 * ═══════════════════════════════════════════════
 */

class EventEmitter {
  constructor() {
    this.events = {};
  }

  /**
   * Subscribe to an event
   * @param {string} eventName - Event identifier
   * @param {Function} callback - Handler function
   * @returns {Function} Unsubscribe function
   */
  on(eventName, callback) {
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push(callback);

    // Return unsubscribe function
    return () => this.off(eventName, callback);
  }

  /**
   * Subscribe to event once
   * @param {string} eventName - Event identifier
   * @param {Function} callback - Handler function
   */
  once(eventName, callback) {
    const wrapper = (data) => {
      callback(data);
      this.off(eventName, wrapper);
    };
    this.on(eventName, wrapper);
  }

  /**
   * Unsubscribe from an event
   * @param {string} eventName - Event identifier
   * @param {Function} callback - Handler function
   */
  off(eventName, callback) {
    if (!this.events[eventName]) return;
    this.events[eventName] = this.events[eventName].filter(cb => cb !== callback);
  }

  /**
   * Emit an event
   * @param {string} eventName - Event identifier
   * @param {*} data - Event data
   */
  emit(eventName, data) {
    if (!this.events[eventName]) return;
    this.events[eventName].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event handler for ${eventName}:`, error);
      }
    });
  }

  /**
   * Clear all listeners for an event
   * @param {string} eventName - Event identifier
   */
  clear(eventName) {
    if (eventName) {
      delete this.events[eventName];
    } else {
      this.events = {};
    }
  }

  /**
   * Get number of listeners for an event
   * @param {string} eventName - Event identifier
   */
  listenerCount(eventName) {
    return this.events[eventName] ? this.events[eventName].length : 0;
  }
}

// Create global event bus
const eventBus = new EventEmitter();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EventEmitter, eventBus };
}
