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

/**
 * ═══════════════════════════════════════════════
 * VALIDATED EVENT BUS - EventEmitter with payload validation
 * ═══════════════════════════════════════════════
 */

class ValidatedEventBus extends EventEmitter {
  constructor() {
    super();
    this.eventSchemas = new Map();
    this.registerDefaultSchemas();
    this.validationMode = 'strict'; // 'strict' or 'warn'
  }

  /**
   * Register a schema for an event type
   * @param {string} eventName - Event name
   * @param {object} schema - Schema with required fields and types
   */
  registerSchema(eventName, schema) {
    this.eventSchemas.set(eventName, schema);
  }

  /**
   * Set validation mode
   * @param {string} mode - 'strict' (throws) or 'warn' (logs)
   */
  setValidationMode(mode) {
    if (['strict', 'warn'].includes(mode)) {
      this.validationMode = mode;
    }
  }

  /**
   * Emit event with validation
   * @param {string} eventName - Event identifier
   * @param {*} payload - Event payload
   */
  emit(eventName, payload) {
    if (this.eventSchemas.has(eventName)) {
      const schema = this.eventSchemas.get(eventName);
      const validationError = this.validatePayload(payload, schema);

      if (validationError) {
        const message = `[ValidatedEventBus] Validation failed for '${eventName}': ${validationError}`;

        if (this.validationMode === 'strict') {
          console.error(message);
          throw new Error(validationError);
        } else {
          console.warn(message);
        }
      }
    }

    return super.emit(eventName, payload);
  }

  /**
   * Validate payload against schema
   * @private
   */
  validatePayload(payload, schema) {
    if (!payload || typeof payload !== 'object') {
      return `Payload must be an object, got ${typeof payload}`;
    }

    // Check required fields
    if (schema.required && Array.isArray(schema.required)) {
      for (const field of schema.required) {
        if (!(field in payload)) {
          return `Missing required field: '${field}'`;
        }
      }
    }

    // Check field types
    if (schema.types && typeof schema.types === 'object') {
      for (const [field, expectedType] of Object.entries(schema.types)) {
        if (field in payload) {
          const actualType = typeof payload[field];
          if (actualType !== expectedType) {
            return `Field '${field}' expected ${expectedType}, got ${actualType}`;
          }
        }
      }
    }

    return null;
  }

  /**
   * Register default event schemas
   * @private
   */
  registerDefaultSchemas() {
    // ============ Match Events ============
    this.registerSchema('match:updated', {
      required: ['matchId', 'winnerId', 'timestamp'],
      types: {
        matchId: 'string',
        winnerId: 'string',
        timestamp: 'number'
      }
    });

    this.registerSchema('match:score-locked', {
      required: ['matchId', 'courtId', 'lockToken'],
      types: {
        matchId: 'string',
        courtId: 'string',
        lockToken: 'string'
      }
    });

    this.registerSchema('match:score-released', {
      required: ['matchId', 'courtId'],
      types: {
        matchId: 'string',
        courtId: 'string'
      }
    });

    // ============ Court Lock Events ============
    this.registerSchema('court:lock-acquired', {
      required: ['courtId', 'lockToken', 'lockedBy'],
      types: {
        courtId: 'string',
        lockToken: 'string',
        lockedBy: 'string'
      }
    });

    this.registerSchema('court:lock-released', {
      required: ['courtId', 'matchId'],
      types: {
        courtId: 'string',
        matchId: 'string'
      }
    });

    this.registerSchema('court:lock-force-released', {
      required: ['courtId', 'reason'],
      types: {
        courtId: 'string',
        reason: 'string'
      }
    });

    // ============ Sync Events ============
    this.registerSchema('sync:transaction-queued', {
      required: ['transactionId', 'type', 'timestamp'],
      types: {
        transactionId: 'string',
        type: 'string',
        timestamp: 'number'
      }
    });

    this.registerSchema('sync:success', {
      required: ['transactionId', 'type', 'timestamp'],
      types: {
        transactionId: 'string',
        type: 'string',
        timestamp: 'number'
      }
    });

    this.registerSchema('sync:retry', {
      required: ['transactionId', 'attempt', 'maxAttempts', 'nextRetryIn'],
      types: {
        transactionId: 'string',
        attempt: 'number',
        maxAttempts: 'number',
        nextRetryIn: 'number'
      }
    });

    this.registerSchema('sync:dlq-item-added', {
      required: ['id', 'transactionId', 'type', 'failedAt', 'lastError'],
      types: {
        id: 'string',
        transactionId: 'string',
        type: 'string',
        failedAt: 'number',
        lastError: 'string'
      }
    });

    this.registerSchema('sync:dlq-item-skipped', {
      required: ['dlqItemId', 'transactionId', 'reason'],
      types: {
        dlqItemId: 'string',
        transactionId: 'string',
        reason: 'string'
      }
    });

    this.registerSchema('sync:dlq-item-retried', {
      required: ['dlqItemId', 'transactionId'],
      types: {
        dlqItemId: 'string',
        transactionId: 'string'
      }
    });

    // ============ Room Events ============
    this.registerSchema('room:joined', {
      required: ['roomCode', 'userRole', 'deviceId'],
      types: {
        roomCode: 'string',
        userRole: 'string',
        deviceId: 'string'
      }
    });

    this.registerSchema('room:left', {
      required: ['roomCode', 'deviceId'],
      types: {
        roomCode: 'string',
        deviceId: 'string'
      }
    });

    // ============ Tournament Events ============
    this.registerSchema('tournament:created', {
      required: ['tournamentId', 'teamCount', 'timestamp'],
      types: {
        tournamentId: 'string',
        teamCount: 'number',
        timestamp: 'number'
      }
    });

    this.registerSchema('tournament:completed', {
      required: ['tournamentId', 'winnerId', 'timestamp'],
      types: {
        tournamentId: 'string',
        winnerId: 'string',
        timestamp: 'number'
      }
    });

    // ============ Team Events ============
    this.registerSchema('team:updated', {
      required: ['teamId', 'timestamp'],
      types: {
        teamId: 'string',
        timestamp: 'number'
      }
    });

    // ============ Language/Settings Events ============
    this.registerSchema('language:changed', {
      required: ['language'],
      types: { language: 'string' }
    });

    this.registerSchema('state:saving', {
      required: ['timestamp'],
      types: { timestamp: 'number' }
    });

    this.registerSchema('state:saved', {
      required: ['timestamp'],
      types: { timestamp: 'number' }
    });
  }
}

// Create global event buses
const eventBus = new EventEmitter();
const validatedEventBus = new ValidatedEventBus();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EventEmitter, ValidatedEventBus, eventBus, validatedEventBus };
}
