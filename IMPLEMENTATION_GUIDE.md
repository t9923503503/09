# Implementation Guide - Offline-First Tournament App with Security

**Status**: Phase 1-4 Complete, Ready for Phase 5 Testing
**Last Updated**: 2026-03-11

---

## Overview

This guide explains how to integrate all the new modules to build a production-ready offline-first tournament app with:
- ✅ Court-level locking for conflict resolution
- ✅ Dead Letter Queue for sync reliability
- ✅ Three-tier access control (Spectator/Scorer/Organizer)
- ✅ EventBus payload validation
- ✅ Supabase integration

---

## Module Integration Map

```
┌──────────────────────────────────────────────────────────────────────┐
│                        App Entry Point (app.js)                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Initialize Core Infrastructure                               │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ 1. validatedEventBus = new ValidatedEventBus()              │   │
│  │ 2. supabaseClient = new SupabaseClient(URL, KEY)            │   │
│  │ 3. syncManager = new SyncManager(supabaseClient, eventBus)  │   │
│  │ 4. courtLockManager = new CourtLockManager(...)             │   │
│  │ 5. roomManager = new RoomManager(...)                        │   │
│  │ 6. qrManager = new QRManager()                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ User Joins Tournament                                         │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ Case 1: Scan Spectator QR                                   │   │
│  │  → roomManager.joinAsSpectator(tournamentId, publicQRID)    │   │
│  │  → User sees read-only bracket                              │   │
│  │                                                               │   │
│  │ Case 2: Enter Scorer PIN                                    │   │
│  │  → roomManager.joinAsScorer(tournamentId, pin, courtId)     │   │
│  │  → User can score on assigned court                         │   │
│  │                                                               │   │
│  │ Case 3: Organizer Token                                     │   │
│  │  → roomManager.joinAsOrganizer(tournamentId, token)         │   │
│  │  → User has full admin access                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Recording Match Score (Scorer)                               │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ 1. Scorer opens match on Court 3                            │   │
│  │                                                               │   │
│  │ 2. courtLockManager.acquireCourtLock()                      │   │
│  │    ├─ Check for local locks                                 │   │
│  │    ├─ Try to acquire from Supabase                          │   │
│  │    └─ If successful, emit 'court:lock-acquired'            │   │
│  │                                                               │   │
│  │ 3. Scorer enters score and submits                          │   │
│  │                                                               │   │
│  │ 4. matchManager.recordMatchScore()                          │   │
│  │    ├─ Validate access (scorer has permission)              │   │
│  │    ├─ Create sync transaction                               │   │
│  │    ├─ emit 'match:updated' (validated)                      │   │
│  │    └─ syncManager.queueTransaction()                        │   │
│  │                                                               │   │
│  │ 5. courtLockManager.releaseCourtLock()                      │   │
│  │    ├─ Release from Supabase                                 │   │
│  │    └─ emit 'court:lock-released'                            │   │
│  │                                                               │   │
│  │ 6. syncManager.processQueue()                               │   │
│  │    ├─ Try to sync transaction (max 5 retries)              │   │
│  │    ├─ If success: emit 'sync:success'                      │   │
│  │    └─ If fail: move to DLQ, emit 'sync:dlq-item-added'    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Conflict Resolution (Two Devices, One Court)                 │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ Scenario:                                                    │   │
│  │ - Device A (Scorer): Online, enters 21-19                  │   │
│  │ - Device B (Organizer): Offline, tries to change status    │   │
│  │                                                               │   │
│  │ Flow:                                                        │   │
│  │ 1. Device A: acquireCourtLock(court_3) → Success           │   │
│  │ 2. Device A: recordMatchScore() → queued for sync           │   │
│  │ 3. Device B: tries recordMatchScore()                       │   │
│  │ 4. Supabase: checks court_locks table → Found active lock  │   │
│  │ 5. Device B: Receives error "Court is locked"              │   │
│  │ 6. Device B: Can choose:                                    │   │
│  │    - Wait for Device A to finish                            │   │
│  │    - Request force-release (with audit logging)             │   │
│  │ 7. Device A: completes, releases lock                       │   │
│  │ 8. Device B: Now can acquire lock                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Sync Failure & Dead Letter Queue                             │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ Scenario: Network is completely offline                     │   │
│  │                                                               │   │
│  │ Flow:                                                        │   │
│  │ 1. Scorer records match (offline mode)                      │   │
│  │ 2. syncManager.queueTransaction('match:update')             │   │
│  │ 3. syncManager.processQueue() runs on interval              │   │
│  │ 4. Tries to sync → Network error                            │   │
│  │ 5. Retry 1: Wait 1s → Retry → Fail                         │   │
│  │ 6. Retry 2: Wait 2s → Retry → Fail                         │   │
│  │ 7. Retry 3: Wait 4s → Retry → Fail                         │   │
│  │ 8. Retry 4: Wait 8s → Retry → Fail                         │   │
│  │ 9. Retry 5: Wait 16s → Retry → Fail                        │   │
│  │ 10. Max retries exceeded → Move to Dead Letter Queue        │   │
│  │                                                               │   │
│  │ 11. UI Shows:                                                │   │
│  │    - Orange badge: "Sync Error (1)"                        │   │
│  │    - User can view DLQ items                                │   │
│  │    - Options: "Skip" or "Retry"                             │   │
│  │                                                               │   │
│  │ 12. Network comes back online                               │   │
│  │ 13. User taps "Retry"                                        │   │
│  │ 14. Transaction re-queued with reset retry count            │   │
│  │ 15. Syncs successfully                                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ EventBus Payload Validation                                  │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ All critical events are validated:                           │   │
│  │                                                               │   │
│  │ Match Update Event:                                          │   │
│  │ validatedEventBus.emit('match:updated', {                  │   │
│  │   matchId: 'm_wb_r1_p1',     // Required: string           │   │
│  │   winnerId: 't_5',             // Required: string           │   │
│  │   timestamp: 1678516800000     // Required: number           │   │
│  │ });                                                          │   │
│  │ ✓ Validation passes, event emitted                          │   │
│  │                                                               │   │
│  │ Court Lock Event:                                            │   │
│  │ validatedEventBus.emit('court:lock-acquired', {            │   │
│  │   courtId: 'court_3',          // Required: string           │   │
│  │   lockToken: 'abc123'          // Required: string           │   │
│  │   // Missing 'lockedBy' field                                │   │
│  │ });                                                          │   │
│  │ ✗ Validation fails → Error thrown (strict mode)             │   │
│  │   or Warned (warn mode)                                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Setup

### 1. Create Supabase Project

```bash
# Create project at https://app.supabase.com
# Note: SUPABASE_URL and SUPABASE_KEY
```

### 2. Initialize Database Schema

```sql
-- Copy contents of supabase-migrations-revised.sql
-- Run in Supabase SQL Editor
-- Creates all tables, indices, functions, triggers
```

### 3. Update index.html

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Beach Volleyball Tournament</title>
    <link rel="stylesheet" href="assets/css/base.css">
  </head>
  <body>
    <!-- Main container -->
    <div id="app"></div>

    <!-- Libraries -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

    <!-- Core modules -->
    <script src="assets/js/core/event-emitter.js"></script>

    <!-- Infrastructure modules -->
    <script src="assets/js/modules/supabase-client.js"></script>
    <script src="assets/js/modules/sync-manager.js"></script>
    <script src="assets/js/modules/court-lock-manager.js"></script>
    <script src="assets/js/modules/room-manager.js"></script>

    <!-- Feature modules -->
    <script src="assets/js/modules/qr-manager.js"></script>
    <script src="assets/js/modules/season-manager.js"></script>
    <script src="assets/js/modules/localization.js"></script>
    <script src="assets/js/modules/persistence.js"></script>

    <!-- Application -->
    <script src="assets/js/app.js"></script>
  </body>
</html>
```

### 4. Initialize in app.js

```javascript
// Initialize infrastructure (early in app startup)
const validatedEventBus = new ValidatedEventBus();

// Supabase initialization
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_KEY = 'your-anon-key';
const supabaseClient = new SupabaseClient(SUPABASE_URL, SUPABASE_KEY);

// Create managers
const syncManager = new SyncManager(supabaseClient, validatedEventBus);
const courtLockManager = new CourtLockManager(supabaseClient, validatedEventBus);
const roomManager = new RoomManager(supabaseClient, validatedEventBus);
const qrManager = new QRManager();

// Set up periodic sync
setInterval(() => {
  syncManager.processQueue();
}, 5000); // Every 5 seconds

// Listen for sync errors
validatedEventBus.on('sync:dlq-item-added', (event) => {
  console.warn('Sync failed:', event);
  // Update UI to show sync error badge
  updateSyncErrorBadge(syncManager.getDeadLetterQueueSize());
});
```

---

## Key Workflows

### Workflow A: Create Tournament (Organizer)

```javascript
// Step 1: Create tournament
const tournamentData = {
  name: 'Beach Volleyball 2026',
  sport: 'beach_volleyball',
  format: 'double_elimination',
  max_teams: 16,
  status: 'planning'
};

const { data: tournament } = await supabaseClient.createTournament(tournamentData);
const tournamentId = tournament.id;

// Step 2: Generate access codes
const publicQRID = RoomManager.generatePublicQRID();
const scorerPINs = Array.from({length: 4}, () => RoomManager.generateScorerPIN());
const organizerToken = RoomManager.generateOrganizerToken();

// Step 3: Update tournament with codes
await supabaseClient.updateTournament(tournamentId, {
  public_qr_id: publicQRID,
  organizer_token: organizerToken
});

// Step 4: Generate QR codes for display
qrManager.generateMultiTierQRCodes(
  tournamentId,
  publicQRID,
  scorerPINs,
  organizerToken,
  document.getElementById('spectator-qr'),
  {
    court_1: document.getElementById('scorer-qr-1'),
    court_2: document.getElementById('scorer-qr-2'),
    court_3: document.getElementById('scorer-qr-3'),
    court_4: document.getElementById('scorer-qr-4')
  },
  document.getElementById('organizer-qr')
);
```

### Workflow B: Join as Spectator

```javascript
// User scans Spectator QR code
const qrData = JSON.parse(qrCodeContent);

if (qrData.type === 'spectator') {
  const result = await roomManager.joinAsSpectator(
    qrData.tournamentId,
    qrData.publicQRID
  );

  if (result.success) {
    // Show read-only bracket view
    displayBracket(tournament, readOnly=true);
  }
}
```

### Workflow C: Record Match Score (Scorer)

```javascript
async function recordMatchScore(matchId, winnerId, courtId) {
  // Step 1: Validate access
  const accessCheck = roomManager.validateAccess('scorer', courtId);
  if (!accessCheck.allowed) {
    showError(accessCheck.reason);
    return;
  }

  // Step 2: Acquire court lock
  const lockResult = await courtLockManager.acquireCourtLock(
    roomManager.currentTournamentId,
    courtId,
    matchId
  );

  if (!lockResult.success) {
    showError(lockResult.error);
    if (lockResult.existingLock) {
      showWarning(`Court locked by ${lockResult.lockedBy}`);
    }
    return;
  }

  try {
    // Step 3: Record the match
    const matchData = {
      winner_id: winnerId,
      match_status: 'completed'
    };

    // Create sync transaction
    const txId = syncManager.queueTransaction({
      type: 'match:update',
      data: {
        tournamentId: roomManager.currentTournamentId,
        matchId: matchId,
        updates: matchData
      }
    });

    // Emit validated event
    validatedEventBus.emit('match:updated', {
      matchId: matchId,
      winnerId: winnerId,
      timestamp: Date.now()
    });

    showSuccess('Score recorded');
  } finally {
    // Step 4: Release court lock
    await courtLockManager.releaseCourtLock(courtId, lockResult.lockToken);
  }
}
```

---

## Error Handling

### Network Error Scenarios

```javascript
// Scenario 1: Network temporarily unavailable
// → Offline mode: Record locally to localStorage
// → Sync queued automatically
// → When online: Retry syncing

// Scenario 2: Court is locked
try {
  const lock = await courtLockManager.acquireCourtLock(...);
} catch (error) {
  if (error === 'Court already locked') {
    // Offer options:
    // 1. Wait (lock expires in 10 minutes)
    // 2. Request override (if organizer)
  }
}

// Scenario 3: Transaction fails after 5 retries
// → Moved to Dead Letter Queue
// → Show UI badge: "Sync Error (1)"
// → User can:
//   - Skip this transaction (data loss acknowledged)
//   - Retry (when network improves)
//   - Export logs for debugging
```

---

## Testing Scenarios

### Test 1: Offline Score Entry

```javascript
// 1. Disconnect from network
// 2. Scorer enters match result
// 3. Score saved locally (orange indicator)
// 4. Reconnect to network
// 5. Score syncs automatically
// 6. Indicator turns green
```

### Test 2: Concurrent Court Access

```javascript
// 1. Device A (Scorer): Open Court 3
// 2. Device B (Organizer): Try to modify Court 3
// 3. Device B receives: "Court is locked by Device A"
// 4. Device B can:
//    - Wait for lock to expire (10 min)
//    - Force release (logged with reason)
// 5. Device A completes, releases lock
// 6. Device B can now acquire lock
```

### Test 3: Multi-Tier Access Control

```javascript
// 1. Spectator tries to record score
//    → Error: "Insufficient permissions"
// 2. Scorer tries to access other court
//    → Error: "Not assigned to this court"
// 3. Organizer accesses any court
//    → Success
```

---

## Production Checklist

- [ ] Supabase project created and configured
- [ ] Database migrations applied
- [ ] Environment variables set (SUPABASE_URL, SUPABASE_KEY)
- [ ] All modules imported in correct order
- [ ] EventBus validation enabled (strict mode)
- [ ] Court lock cleanup job running
- [ ] Sync queue processing every 5 seconds
- [ ] DLQ monitoring enabled
- [ ] QR code generation tested
- [ ] Offline mode tested
- [ ] Multi-device sync tested
- [ ] Access control tested
- [ ] Error boundaries in place
- [ ] Error logging configured
- [ ] Performance tested (load test with 100+ teams)

---

## Debugging Tips

### Check Module Initialization

```javascript
console.log('EventBus ready:', validatedEventBus instanceof ValidatedEventBus);
console.log('Supabase ready:', supabaseClient.isReady());
console.log('Sync queue:', syncManager.getQueueStatus());
console.log('Active locks:', courtLockManager.getActiveLocks());
console.log('User:', roomManager.getCurrentUser());
```

### Monitor Sync Status

```javascript
// Dashboard widget
function updateSyncStatus() {
  const status = syncManager.getQueueStatus();
  console.log('Sync Status:', {
    active: status.activeQueue,
    dlq: status.deadLetterQueue,
    syncing: status.isSyncing,
    lastSync: new Date(status.lastSyncTime)
  });
}

setInterval(updateSyncStatus, 10000); // Every 10 seconds
```

### View Dead Letter Queue Items

```javascript
// Get DLQ items
const dlqItems = syncManager.getDeadLetterQueueItems();

// Skip a failed transaction
syncManager.skipDLQItem(dlqItems[0].id, 'User acknowledged data loss');

// Retry a transaction
syncManager.retryDLQItem(dlqItems[1].id);
```

---

## FAQ

**Q: What happens if both devices try to score on the same court simultaneously?**
A: The first device to acquire the lock succeeds. The second device receives "Court is locked" error. The lock expires after 10 minutes automatically, or can be force-released by organizer.

**Q: Can a spectator become a scorer?**
A: No. Access roles are determined at room join time. To change roles, user must leave and re-join with different access code.

**Q: What if network is permanently offline?**
A: Transactions remain in queue/DLQ indefinitely. Users can manually skip items, or they expire after 30 days (configurable).

**Q: How do I migrate to a new Supabase project?**
A: Export tournament data from old project (via Season Archive table), create new schema in new project, import data using import tools.

**Q: Can I run this without Supabase?**
A: Yes, local-only mode works, but no multi-device sync. All data stays in localStorage.

---

## Architecture Decision Records (ADRs)

### ADR-001: Court-Level Locking vs Server-Wins

**Decision**: Implement court-level locking instead of server-wins conflict resolution.

**Rationale**:
- Server-wins causes data loss (judge's score overwritten)
- Court locking ensures data integrity
- Timeout-based expiration prevents deadlocks
- Audit trail for forced releases

**Implementation**: `CourtLockManager` with Supabase `court_locks` table.

### ADR-002: Dead Letter Queue vs Silently Drop

**Decision**: Implement Dead Letter Queue for failed transactions.

**Rationale**:
- Silently dropping data = data loss
- Retrying indefinitely = stalled UI
- DLQ + manual intervention = balance between reliability and UX

**Implementation**: `SyncManager` with localStorage persistence.

### ADR-003: Three-Tier Access vs Single PIN

**Decision**: Implement three-tier access control (Spectator/Scorer/Organizer).

**Rationale**:
- Single PIN allows anyone to modify scores
- Three-tier provides defense-in-depth
- Scorer PIN per-court limits blast radius
- Spectator QR safe to share publicly

**Implementation**: `RoomManager` with separate token validation.

---

**Next Step**: Phase 5 - Comprehensive testing and stabilization of all offline conflict scenarios.
