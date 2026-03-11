# Tournament Bracket Application - Revised Architecture
## Incorporating Gemini AI Security & Stability Review

**Revision Date**: 2026-03-11
**Status**: Incorporating Critical Fixes (Phase 2)

---

## Executive Summary

This document revises the original architecture to address 5 critical vulnerabilities identified by Gemini AI:
1. **Conflict Resolution Strategy** → Court-level locking (not server-wins)
2. **Sync Reliability** → Dead Letter Queue pattern for failed transactions
3. **Database Integrity** → Prerequisite match references & standard bracket terminology
4. **Code Maintainability** → Strict EventBus payload validation
5. **Access Control** → Tiered security (Public QR → Scorer PIN → Organizer Token)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Beach Volleyball App                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │   UI Layer       │  │   Room Manager   │  │   QR Manager   │ │
│  │  (Multiple Views)│  │  (Multi-Device)  │  │ (Access Codes) │ │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬───────┘ │
│           │                     │                      │          │
│           └─────────────┬───────┴──────────────────────┘          │
│                         │                                         │
│                   ┌─────▼─────────────────────┐                  │
│                   │   EventBus (Validated)    │                  │
│                   │  - Event Payload Schema   │                  │
│                   │  - Type Checking          │                  │
│                   └─────┬──────────┬──────────┘                  │
│                         │          │                             │
│        ┌────────────────┼──────────┼─────────────────┐           │
│        │                │          │                 │           │
│   ┌────▼────┐    ┌─────▼───┐ ┌───▼────┐    ┌──────▼──┐         │
│   │Sync Mgr │    │Match Mgr│ │Season  │    │Ranking  │         │
│   │(DLQ)    │    │(Locking)│ │Manager │    │Manager  │         │
│   └────┬────┘    └────┬────┘ └───┬────┘    └─────┬───┘         │
│        │               │          │               │             │
│        └───────────────┼──────────┼───────────────┘             │
│                        │          │                             │
│              ┌─────────▼──────────▼─────────┐                  │
│              │  Persistence Layer           │                  │
│              │  - localStorage (offline)    │                  │
│              │  - Supabase (online sync)    │                  │
│              └──────────────────────────────┘                  │
│                        │                                        │
│              ┌─────────▼──────────────────┐                    │
│              │   Supabase Database        │                    │
│              │  - Real-time subscriptions  │                    │
│              │  - Conflict resolution      │                    │
│              │  - Archive/History          │                    │
│              └────────────────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Critical Fixes

### 1. CONFLICT RESOLUTION: Court-Level Locking

**Problem**: Server-wins strategy can lose data. Judge enters 15 points offline; organizer changes match status online. On reconnect, server version overwrites judge's entry, losing the 15 points.

**Solution**: Court-level locking mechanism prevents concurrent edits.

#### Implementation Strategy

```javascript
// Court Lock Structure (in localStorage + Supabase)
{
  courtId: "court_1",
  matchId: "m_wb_r1_p1",
  lockedBy: "device_uuid_of_scorer",
  lockToken: "unique_token_abc123",
  lockedAt: 1678516800000,
  expiresAt: 1678517400000,  // 10 minute timeout
  lockedData: {
    // Snapshot of match when locked
    teams: [...],
    score: {...}
  }
}
```

#### Lock Acquisition Flow
```
Scorer Device 1 opens Match → Acquire Lock(court_1)
  ↓ (Lock granted, token issued)
  ↓
Scorer enters score → Update with lock token
  ↓
Scorer completes match → Release Lock(court_1)

Meanwhile:
Organizer tries to modify Match → Check for Active Lock(court_1)
  ↓ (Finds lock by Scorer Device 1)
  ↓
Show Warning: "Court 1 is being edited by Scorer Device 1"
  ↓
Option: "Force Release Lock" (with reason logging)
```

#### Lock Persistence
- Locks stored in Supabase: `court_locks` table
- Timestamp-based expiration (10 minutes auto-expire)
- UUID-based device identification
- Audit trail for forced lock releases

#### EventBus Events
```javascript
eventBus.emit('court:lock-acquired', {
  courtId: 'court_1',
  lockToken: 'abc123',
  lockedBy: 'device_uuid'
});

eventBus.emit('court:lock-released', {
  courtId: 'court_1',
  matchId: 'm_wb_r1_p1'
});

eventBus.emit('court:lock-force-released', {
  courtId: 'court_1',
  reason: 'Organizer override',
  auditLog: true
});
```

---

### 2. SYNC RELIABILITY: Dead Letter Queue (DLQ)

**Problem**: SyncManager can get stuck with corrupted data in queue, blocking all subsequent syncs.

**Solution**: Implement transaction limits and Dead Letter Queue pattern.

#### SyncManager Implementation

```javascript
class SyncManager {
  constructor() {
    this.syncQueue = [];          // Active sync operations
    this.deadLetterQueue = [];    // Failed transactions
    this.maxRetries = 5;
    this.retryDelays = [1000, 2000, 4000, 8000, 16000]; // exponential backoff
  }

  async syncTransaction(transaction) {
    const attempt = transaction.retryCount || 0;

    if (attempt >= this.maxRetries) {
      // Move to DLQ
      this.moveToDeadLetterQueue(transaction);
      eventBus.emit('sync:dlq-item-added', transaction);
      return false;
    }

    try {
      await this.executeSync(transaction);
      this.syncQueue = this.syncQueue.filter(t => t.id !== transaction.id);
      eventBus.emit('sync:success', transaction);
      return true;
    } catch (error) {
      transaction.retryCount = attempt + 1;
      transaction.lastError = error.message;
      transaction.nextRetry = Date.now() + this.retryDelays[attempt];

      // Re-queue for retry
      setTimeout(() => {
        this.syncTransaction(transaction);
      }, this.retryDelays[attempt]);

      return false;
    }
  }

  moveToDeadLetterQueue(transaction) {
    this.deadLetterQueue.push({
      ...transaction,
      failedAt: Date.now(),
      attempts: transaction.retryCount,
      lastError: transaction.lastError
    });

    // Persist to localStorage
    localStorage.setItem(
      'sync:dlq',
      JSON.stringify(this.deadLetterQueue)
    );
  }

  skipDLQItem(transactionId, reason) {
    this.deadLetterQueue = this.deadLetterQueue.filter(
      t => t.id !== transactionId
    );

    eventBus.emit('sync:dlq-item-skipped', {
      transactionId,
      reason,
      skippedAt: Date.now()
    });

    localStorage.setItem(
      'sync:dlq',
      JSON.stringify(this.deadLetterQueue)
    );
  }

  getDLQItems() {
    return this.deadLetterQueue;
  }
}
```

#### UI Integration

- Dashboard shows "Sync Errors" badge with count
- Modal listing DLQ items with details:
  - Transaction ID
  - Failure reason
  - Retry count
  - Last attempt time
  - "Skip & Ignore" button (with reason)
  - "Retry Now" button

#### EventBus Payload Validation

```javascript
// Define schema for each DLQ event
const dlqEventSchemas = {
  'sync:dlq-item-added': {
    required: ['id', 'type', 'data', 'failedAt'],
    types: {
      id: 'string',
      type: 'string',
      data: 'object',
      failedAt: 'number'
    }
  },
  'sync:dlq-item-skipped': {
    required: ['transactionId', 'reason', 'skippedAt'],
    types: {
      transactionId: 'string',
      reason: 'string',
      skippedAt: 'number'
    }
  }
};
```

---

### 3. DATABASE SCHEMA: Bracket Integrity

**Problem**: Missing prerequisite_match_id fields, inconsistent seeding logic, non-standard bracket terminology.

**Solution**: Enhanced schema with explicit match dependencies and standardized stage names.

#### Supabase Schema (supabase-migrations.sql)

```sql
-- Matches table with bracket progression
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL,
  match_number INT NOT NULL,
  round_name VARCHAR(50) NOT NULL,  -- "Group Stage", "Quarterfinals", "Semifinals", "Grand Final"
  bracket_side VARCHAR(20) NOT NULL, -- "winners" | "losers" | "grand_final"
  court_id INT,

  -- Prerequisite matches (bracket progression)
  prerequisite_match_1_id UUID REFERENCES matches(id),
  prerequisite_match_2_id UUID REFERENCES matches(id),

  team_1_id UUID REFERENCES tournament_teams(id),
  team_2_id UUID REFERENCES tournament_teams(id),
  winner_id UUID REFERENCES tournament_teams(id),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_prerequisites CHECK (
    (prerequisite_match_1_id IS NULL AND prerequisite_match_2_id IS NULL) OR
    (prerequisite_match_1_id IS NOT NULL AND prerequisite_match_2_id IS NOT NULL)
  )
);

-- Court locks (conflict resolution)
CREATE TABLE court_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL,
  court_id INT NOT NULL,
  match_id UUID NOT NULL,
  locked_by_device_uuid VARCHAR(255) NOT NULL,
  lock_token VARCHAR(255) NOT NULL,
  locked_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '10 minutes',
  locked_data JSONB,

  CONSTRAINT lock_expiry CHECK (expires_at > locked_at)
);

-- Sync Dead Letter Queue
CREATE TABLE sync_dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL,
  transaction_id VARCHAR(255) NOT NULL,
  transaction_type VARCHAR(50) NOT NULL,
  transaction_data JSONB NOT NULL,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  failed_at TIMESTAMP DEFAULT NOW(),
  skipped_at TIMESTAMP,
  skip_reason VARCHAR(255)
);

-- Indices for performance
CREATE INDEX idx_matches_tournament_id ON matches(tournament_id);
CREATE INDEX idx_matches_bracket_side ON matches(bracket_side);
CREATE INDEX idx_court_locks_expires_at ON court_locks(expires_at);
CREATE INDEX idx_sync_dlq_tournament_id ON sync_dead_letter_queue(tournament_id);
```

#### Match Progression Logic

```javascript
// Bracket progression rules
const bracketRules = {
  'winners_bracket_r1': {
    stageName: 'Round 1',
    prerequisiteMatches: [], // Initial round, no prerequisites
    nextStageIfWin: 'winners_bracket_r2',
    nextStageIfLoss: 'losers_bracket_r1'
  },
  'winners_bracket_r2': {
    stageName: 'Quarterfinals',
    prerequisiteMatches: ['winners_bracket_r1'],
    nextStageIfWin: 'winners_bracket_r3',
    nextStageIfLoss: 'losers_bracket_r2'
  },
  'grand_final': {
    stageName: 'Grand Final',
    prerequisiteMatches: ['winners_bracket_final', 'losers_bracket_final'],
    nextStageIfWin: null, // Tournament end
    nextStageIfLoss: 'grand_final_reset' // If LB winner wins, reset required
  }
};
```

#### Seeding Logic (True Skill Index Order)

```javascript
// Seeding: Level 1 = Strongest, Level N = Weakest
function seedTeams(teams) {
  // Sort by TSI descending (highest skill first)
  const sortedTeams = teams.sort((a, b) => b.trueSkillIndex - a.trueSkillIndex);

  // Assign seeds (1, 2, 3, 4, ...)
  return sortedTeams.map((team, index) => ({
    ...team,
    seed: index + 1,
    seedLevel: calculateSeedLevel(index, teams.length)
  }));
}
```

---

### 4. CODE QUALITY: EventBus Payload Validation

**Problem**: ~2000 new lines of vanilla JS with event bus pattern difficult to debug without TypeScript.

**Solution**: Strict payload schema validation before persistence.

#### EventBus Enhanced Implementation

```javascript
class ValidatedEventBus extends EventEmitter {
  constructor() {
    super();
    this.eventSchemas = new Map();
    this.registerDefaultSchemas();
  }

  registerSchema(eventName, schema) {
    this.eventSchemas.set(eventName, schema);
  }

  emit(eventName, payload) {
    if (!this.eventSchemas.has(eventName)) {
      console.warn(`[EventBus] No schema registered for event: ${eventName}`);
      return super.emit(eventName, payload);
    }

    const schema = this.eventSchemas.get(eventName);
    const validationError = this.validatePayload(payload, schema);

    if (validationError) {
      console.error(`[EventBus] Validation failed for ${eventName}: ${validationError}`);
      throw new Error(validationError);
    }

    return super.emit(eventName, payload);
  }

  validatePayload(payload, schema) {
    // Check required fields
    for (const field of schema.required) {
      if (!(field in payload)) {
        return `Missing required field: ${field}`;
      }
    }

    // Check field types
    for (const [field, expectedType] of Object.entries(schema.types)) {
      if (field in payload) {
        const actualType = typeof payload[field];
        if (actualType !== expectedType) {
          return `Field "${field}" expected ${expectedType}, got ${actualType}`;
        }
      }
    }

    return null;
  }

  registerDefaultSchemas() {
    // Match-related events
    this.registerSchema('match:updated', {
      required: ['matchId', 'winnerId', 'timestamp'],
      types: { matchId: 'string', winnerId: 'string', timestamp: 'number' }
    });

    this.registerSchema('match:score-locked', {
      required: ['matchId', 'courtId', 'lockToken'],
      types: { matchId: 'string', courtId: 'string', lockToken: 'string' }
    });

    // Sync-related events
    this.registerSchema('sync:success', {
      required: ['transactionId', 'type', 'timestamp'],
      types: { transactionId: 'string', type: 'string', timestamp: 'number' }
    });

    this.registerSchema('sync:dlq-item-added', {
      required: ['id', 'type', 'failedAt', 'lastError'],
      types: { id: 'string', type: 'string', failedAt: 'number', lastError: 'string' }
    });

    // Room-related events
    this.registerSchema('room:joined', {
      required: ['roomCode', 'userRole', 'deviceId'],
      types: { roomCode: 'string', userRole: 'string', deviceId: 'string' }
    });

    // Court lock events
    this.registerSchema('court:lock-acquired', {
      required: ['courtId', 'lockToken', 'lockedBy'],
      types: { courtId: 'string', lockToken: 'string', lockedBy: 'string' }
    });
  }
}
```

#### Event Documentation Template

```javascript
/**
 * Event: match:updated
 *
 * Fired when a match result is recorded
 *
 * Payload Schema:
 * {
 *   matchId: string (required) - UUID of the match
 *   winnerId: string (required) - UUID of winning team
 *   timestamp: number (required) - Unix timestamp of update
 *   courtId: string (optional) - Court where match was played
 *   matchData: object (optional) - Full match state snapshot
 * }
 *
 * Listeners:
 * - MatchManager.handleMatchUpdate()
 * - SyncManager.queueForSync()
 * - SeasonManager.updatePlayerStats()
 *
 * Example:
 * eventBus.emit('match:updated', {
 *   matchId: 'm_wb_r1_p1',
 *   winnerId: 't_5',
 *   timestamp: Date.now(),
 *   courtId: 'court_3'
 * });
 */
```

---

### 5. ACCESS CONTROL: Tiered Security

**Problem**: Single room PIN allows spectators who learn the PIN to modify scores.

**Solution**: Three-tier access control with separate tokens.

#### Access Model

```javascript
class AccessControl {
  /**
   * Tier 1: Public QR Code ID
   * - Visible on public QR code (can be scanned)
   * - Read-only access to tournament bracket
   * - Use case: Spectators viewing live bracket
   *
   * Tier 2: Scorer PIN (4-6 digits per court)
   * - Entered manually at scoring device
   * - Write access to specific court only
   * - Can record match scores on their court
   * - Cannot modify other courts or tournament settings
   *
   * Tier 3: Organizer Token (Complex password/JWT)
   * - Issued to tournament organizer
   * - Write access to entire tournament
   * - Can modify teams, schedule, seeding
   * - Can force-release court locks
   * - Can archive/complete tournament
   */

  static generatePublicQRID() {
    // Format: XXX-XXX-XXX (shorter, easier to remember)
    return `${randomHex(3)}-${randomHex(3)}-${randomHex(3)}`;
  }

  static generateScorerPIN() {
    // Format: 4-6 digit PIN
    return Math.floor(100000 + Math.random() * 900000).toString().substring(0, 6);
  }

  static generateOrganizerToken() {
    // JWT or complex token
    return require('crypto').randomBytes(32).toString('hex');
  }

  static validateAccess(token, requiredTier, courtId) {
    switch (requiredTier) {
      case 'spectator':
        return validatePublicQRID(token);
      case 'scorer':
        return validateScorerPIN(token, courtId);
      case 'organizer':
        return validateOrganizerToken(token);
      default:
        return false;
    }
  }
}
```

#### Access Control Table

| Action | Public QR | Scorer PIN | Organizer Token |
|--------|-----------|-----------|-----------------|
| View Bracket | ✓ | ✓ | ✓ |
| View Leaderboard | ✓ | ✓ | ✓ |
| Record Score | ✗ | ✓* | ✓ |
| Lock Court | ✗ | ✓ | ✓ |
| Force Release Lock | ✗ | ✗ | ✓ |
| Modify Teams | ✗ | ✗ | ✓ |
| Modify Seeding | ✗ | ✗ | ✓ |
| Complete Tournament | ✗ | ✗ | ✓ |
| Access Archive | ✗ | ✗ | ✓ |

*Scorer PIN only grants access to their assigned court

#### Implementation

```javascript
// In MatchManager
recordMatchScore(matchId, score, accessToken) {
  // Validate organizer access
  if (!validateOrganizerToken(accessToken)) {
    throw new Error('Insufficient permissions');
  }

  // Validate court lock exists
  const lock = this.acquireCourtLock(matchId);
  if (!lock) {
    throw new Error('Cannot acquire court lock');
  }

  // Record score
  const result = this.updateMatchScore(matchId, score);

  // Emit validated event
  eventBus.emit('match:updated', {
    matchId,
    winnerId: result.winnerId,
    timestamp: Date.now(),
    accessLevel: 'organizer'
  });

  return result;
}
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Create `supabase-client.js` with connection & CRUD ops
- [ ] Implement `court-locks` table and lock management
- [ ] Create `sync-manager.js` with DLQ support
- [ ] Enhance EventBus with ValidatedEventBus
- [ ] Register all event schemas

### Phase 2: Conflict Resolution (Week 1-2)
- [ ] Implement court-level locking mechanism
- [ ] Add lock acquisition/release UI
- [ ] Implement force-release with audit logging
- [ ] Test lock expiration and cleanup

### Phase 3: Data Integrity (Week 2)
- [ ] Update database schema with prerequisite_match_id
- [ ] Implement bracket progression logic
- [ ] Fix seeding (TSI descending order)
- [ ] Add stage naming standardization

### Phase 4: Access Control (Week 2-3)
- [ ] Implement tiered token system
- [ ] Update QRManager for three-tier codes
- [ ] Add access validation middleware
- [ ] Update RoomManager with tier checks

### Phase 5: Testing & Stabilization (Week 3-4)
- [ ] Integration tests for DLQ flow
- [ ] Conflict scenario testing (offline edits)
- [ ] Multi-device synchronization tests
- [ ] Performance testing with large brackets

---

## Module Dependencies

```
app.js
├── ValidatedEventBus (enhanced)
├── SupabaseClient
├── SyncManager (with DLQ)
├── MatchManager (with court locking)
├── RoomManager (with access control)
├── QRManager (three-tier codes)
├── SeasonManager
├── RankingManager
└── Localization
```

---

## Error Handling Strategy

```javascript
// Centralized error handler with retry logic
class ErrorHandler {
  static async handleSyncError(error, transaction) {
    if (error.code === 'NETWORK_TIMEOUT') {
      // Retry with exponential backoff
      return 'RETRY';
    } else if (error.code === 'CONFLICT') {
      // Court is locked, notify user
      return 'LOCKED';
    } else if (error.code === 'UNAUTHORIZED') {
      // Invalid access token
      return 'UNAUTHORIZED';
    } else {
      // Move to DLQ
      return 'DLQ';
    }
  }
}
```

---

## Testing Scenarios

### Scenario 1: Offline Court Locking
1. Scorer A locks Court 1 (offline)
2. Organizer attempts modification (online)
3. Organizer sees lock warning
4. Organizer can choose: Wait or Force Release
5. On reconnect, conflict is resolved via lock

### Scenario 2: DLQ Recovery
1. Network fails during sync
2. Transaction added to DLQ after 5 retries
3. UI shows sync error badge
4. User views DLQ items
5. User can "Skip" or "Retry" each item
6. Sync continues for other items

### Scenario 3: Spectator vs Scorer
1. User scans public QR (read-only access)
2. Separate Scorer PIN issued for each court
3. Scorer PIN holders can only edit their court
4. Organizer can modify entire tournament
5. Attempt to use QR code for scoring → Access Denied

---

## Deployment Checklist

- [ ] Supabase project configured
- [ ] Database migrations applied
- [ ] Environment variables set (Supabase URL, key)
- [ ] GitHub Actions updated for new modules
- [ ] DLQ UI implemented
- [ ] Court lock visualization
- [ ] Tier 1-3 access control active
- [ ] Offline sync with conflict resolution tested
- [ ] Load testing (100+ teams, 50+ concurrent devices)

---

**Next Step**: Begin Phase 1 implementation with SupabaseClient and court-lock infrastructure.
