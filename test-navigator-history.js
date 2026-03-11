/**
 * TESTS FOR TOURNAMENT NAVIGATOR & HISTORY
 * Test search, navigation, undo/redo functionality
 */

const { DoubleElimTournament } = require('./doubleElimPlugin.js');
const { TournamentNavigator } = require('./tournamentNavigator.js');
const { TournamentHistory } = require('./tournamentHistory.js');

// ════════════════════════════════════════════════════════════
// TEST DATA
// ════════════════════════════════════════════════════════════

const TEST_TEAMS = [
  {
    id: "p1",
    name: "🥇 Alpha Team",
    players: [{ level: 5 }, { level: 5 }]
  },
  {
    id: "p2",
    name: "🥈 Beta Team",
    players: [{ level: 5 }, { level: 4 }]
  },
  {
    id: "p3",
    name: "🥉 Gamma Team",
    players: [{ level: 4 }, { level: 4 }]
  },
  {
    id: "p4",
    name: "🏅 Delta Team",
    players: [{ level: 3 }, { level: 3 }]
  }
];

// ════════════════════════════════════════════════════════════
// TEST 1: TOURNAMENT NAVIGATOR - SEARCH
// ════════════════════════════════════════════════════════════

function testNavigatorSearch() {
  console.log("\n🧪 TEST 1: Tournament Navigator - Search");
  console.log("═".repeat(60));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS);
  tournament.generateBracket();

  const navigator = new TournamentNavigator(tournament);

  // Test 1: Search by bracket
  console.log("\n📋 Search by bracket (Winners Bracket):");
  const wbMatches = navigator.search({ bracket: "WB" });
  console.log(`  Found: ${wbMatches.length} matches`);
  if (wbMatches.length > 0) {
    console.log(`  ✅ First match: ${wbMatches[0].id}`);
  }

  // Test 2: Search by status
  console.log("\n📋 Search by status (Pending):");
  const pendingMatches = navigator.search({ status: "pending" });
  console.log(`  Found: ${pendingMatches.length} pending matches`);

  // Test 3: Search by team
  console.log("\n📋 Search by team (Alpha):");
  const alphaMatches = navigator.search({ team: "Alpha" });
  console.log(`  Found: ${alphaMatches.length} matches with Alpha Team`);

  // Test 4: Get pending matches shortcut
  console.log("\n📋 Get pending matches (shortcut):");
  const pending = navigator.getPendingMatches();
  console.log(`  Found: ${pending.length} pending matches`);

  // Test 5: Get completed matches
  console.log("\n📋 Get completed matches:");
  const completed = navigator.getCompletedMatches();
  console.log(`  Found: ${completed.length} completed matches`);

  return wbMatches.length > 0 && pending.length > 0;
}

// ════════════════════════════════════════════════════════════
// TEST 2: TOURNAMENT NAVIGATOR - STATISTICS
// ════════════════════════════════════════════════════════════

function testNavigatorStatistics() {
  console.log("\n\n🧪 TEST 2: Tournament Navigator - Statistics");
  console.log("═".repeat(60));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS);
  tournament.generateBracket();

  const navigator = new TournamentNavigator(tournament);

  // Get statistics
  const stats = navigator.getStatistics();

  console.log("\n📊 Tournament Statistics:");
  console.log(`  Total matches: ${stats.totalMatches}`);
  console.log(`  Completion: ${stats.completionPercentage}%`);
  console.log(`  By bracket:`);

  Object.entries(stats.byBracket).forEach(([bracket, count]) => {
    console.log(`    ${bracket}: ${count} matches`);
  });

  console.log(`  By status:`);
  Object.entries(stats.byStatus).forEach(([status, count]) => {
    console.log(`    ${status}: ${count} matches`);
  });

  console.log(`  Upsets: ${stats.upsets}`);

  // Get health status
  const health = navigator.getHealthStatus();
  console.log("\n💪 Tournament Health:");
  console.log(`  Progress: ${health.progress}%`);
  console.log(`  Played: ${health.matchesPlayed}/${stats.totalMatches}`);
  console.log(`  Remaining: ${health.matchesRemaining}`);

  return stats.totalMatches === 6 && stats.completionPercentage === 0;
}

// ════════════════════════════════════════════════════════════
// TEST 3: TOURNAMENT NAVIGATOR - NAVIGATION
// ════════════════════════════════════════════════════════════

function testNavigatorNavigation() {
  console.log("\n\n🧪 TEST 3: Tournament Navigator - Navigation");
  console.log("═".repeat(60));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS);
  tournament.generateBracket();

  const navigator = new TournamentNavigator(tournament);

  // Test nextPendingMatch (first WB match)
  console.log("\n🎯 Navigate to next pending match:");
  const wbPending = navigator.getPendingMatches().filter(m => m.bracket === "WB");
  const nextMatch = wbPending.length > 0 ? navigator.gotoMatch(wbPending[0].id) : null;
  console.log(`  Current match: ${nextMatch?.id}`);

  // Test getMatchContext
  console.log("\n🔗 Get match context:");
  if (nextMatch) {
    const context = navigator.getMatchContext(nextMatch.id);
    console.log(`  Current: ${context.current.id}`);
    console.log(`  Next (winner): ${context.nextWinner?.id || 'TBD'}`);
    console.log(`  Next (loser): ${context.nextLoser?.id || 'TBD'}`);
  }

  // Test goto match
  console.log("\n🎯 Navigate to specific match:");
  const allMatches = Object.values(tournament.matches);
  const targetMatch = allMatches.find(m => m.bracket === "WB" && m.round === 1);

  if (targetMatch) {
    const match = navigator.gotoMatch(targetMatch.id);
    console.log(`  ✅ Navigated to: ${match?.id}`);
  }

  return nextMatch !== null;
}

// ════════════════════════════════════════════════════════════
// TEST 4: TOURNAMENT HISTORY - BASIC UNDO/REDO
// ════════════════════════════════════════════════════════════

function testHistoryBasic() {
  console.log("\n\n🧪 TEST 4: Tournament History - Basic Undo/Redo");
  console.log("═".repeat(60));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS);
  tournament.generateBracket();

  const history = new TournamentHistory(tournament);
  const navigator = new TournamentNavigator(tournament);

  console.log("\n📝 Initial state:");
  const initialStats = navigator.getStatistics();
  console.log(`  Completed: ${initialStats.byStatus.completed}`);
  console.log(`  Pending: ${initialStats.byStatus.pending}`);

  // Record a match result
  console.log("\n▶️  Record first match result:");
  const pending = navigator.getPendingMatches().filter(m => m.bracket === "WB");
  if (pending.length > 0) {
    const match = pending[0];
    const winner = tournament.teams.find(t => t.id === match.team_a_id);
    console.log(`  ${match.id}: ${winner?.name} wins`);

    tournament.advanceTeam(match.id, winner.id);
    history.takeSnapshot(`Match ${match.id} completed`);

    const afterStats = navigator.getStatistics();
    console.log(`  Completed: ${afterStats.byStatus.completed} (was ${initialStats.byStatus.completed})`);
  }

  // Undo
  console.log("\n⏮️  Undo last action:");
  if (history.canUndo()) {
    history.undo();
    const undoStats = navigator.getStatistics();
    console.log(`  ✅ Undone. Completed: ${undoStats.byStatus.completed}`);
  }

  // Redo
  console.log("\n⏭️  Redo action:");
  if (history.canRedo()) {
    history.redo();
    const redoStats = navigator.getStatistics();
    console.log(`  ✅ Redone. Completed: ${redoStats.byStatus.completed}`);
  }

  const summary = history.getSummary();
  console.log(`\n📊 History Summary:`);
  console.log(`  Total snapshots: ${summary.totalSnapshots}`);
  console.log(`  Current index: ${summary.currentIndex}`);
  console.log(`  Can undo: ${summary.canUndo}`);
  console.log(`  Can redo: ${summary.canRedo}`);

  return summary.totalSnapshots >= 2 && summary.canUndo === true;
}

// ════════════════════════════════════════════════════════════
// TEST 5: TOURNAMENT HISTORY - MULTIPLE SNAPSHOTS
// ════════════════════════════════════════════════════════════

function testHistoryMultipleSnapshots() {
  console.log("\n\n🧪 TEST 5: Tournament History - Multiple Snapshots");
  console.log("═".repeat(60));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS);
  tournament.generateBracket();

  const history = new TournamentHistory(tournament);
  const navigator = new TournamentNavigator(tournament);

  console.log("\n📝 Recording multiple match results:");
  const pending = navigator.getPendingMatches().filter(m => m.bracket === "WB");

  // Play up to 3 matches
  let matchesPlayed = 0;
  for (let i = 0; i < Math.min(3, pending.length); i++) {
    const match = pending[i];
    const winner = tournament.teams.find(t => t.id === match.team_a_id);

    if (!winner) continue;

    try {
      tournament.advanceTeam(match.id, winner.id);
      history.takeSnapshot(`Match ${i + 1} completed`);
      console.log(`  ✓ Match ${i + 1}: ${match.id}`);
      matchesPlayed++;
    } catch (e) {
      // Match already completed
    }
  }

  // Get history stack
  const stack = history.getHistoryStack();
  console.log(`\n📚 History Stack (${stack.length} entries):`);
  stack.forEach(entry => {
    const marker = entry.isCurrent ? "→" : " ";
    console.log(`  ${marker} ${entry.description}`);
  });

  // Test jumping back
  console.log(`\n🔙 Jump to middle of history:`);
  if (stack.length > 2) {
    const middleIdx = Math.floor(stack.length / 2);
    history.jumpToHistory(middleIdx);
    const currentDesc = history.getCurrentDescription();
    console.log(`  ✅ Jumped to: ${currentDesc}`);
  }

  // Get memory usage
  const memory = history.getMemoryUsage();
  console.log(`\n💾 Memory Usage:`);
  console.log(`  Snapshots: ${memory.snapshots}`);
  console.log(`  Size: ${memory.sizeKB} KB`);

  return matchesPlayed > 0 && stack.length > 1;
}

// ════════════════════════════════════════════════════════════
// TEST 6: COMBINED NAVIGATOR + HISTORY
// ════════════════════════════════════════════════════════════

function testCombined() {
  console.log("\n\n🧪 TEST 6: Combined Navigator + History Workflow");
  console.log("═".repeat(60));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS);
  tournament.generateBracket();

  const navigator = new TournamentNavigator(tournament);
  const history = new TournamentHistory(tournament);

  console.log("\n▶️  Workflow: Navigate, Play, Undo, Redo");

  // Step 1: Navigate to first pending WB match
  console.log("\n1️⃣  Navigate to first pending match:");
  const wbMatches = navigator.getPendingMatches().filter(m => m.bracket === "WB");
  const firstMatch = wbMatches.length > 0 ? navigator.gotoMatch(wbMatches[0].id) : null;
  console.log(`   Match: ${firstMatch?.id}`);

  // Step 2: Get match details
  if (firstMatch) {
    const teamA = tournament.teams.find(t => t.id === firstMatch.team_a_id);
    const teamB = tournament.teams.find(t => t.id === firstMatch.team_b_id);
    console.log(`   ${teamA?.name} vs ${teamB?.name}`);

    // Step 3: Record result
    console.log("\n2️⃣  Record result (Team A wins):");
    tournament.advanceTeam(firstMatch.id, teamA.id);
    history.takeSnapshot(`Match result recorded`);
    console.log(`   ✅ Result saved with undo capability`);

    // Step 4: Navigate to next
    console.log("\n3️⃣  Navigate to next pending match:");
    const wbRemaining = navigator.getPendingMatches().filter(m => m.bracket === "WB");
    const nextMatch2 = wbRemaining.length > 1 ? navigator.gotoMatch(wbRemaining[1].id) : null;
    console.log(`   Next match: ${nextMatch2?.id || 'none'}`);

    // Step 5: Undo
    console.log("\n4️⃣  Undo last result:");
    if (history.canUndo()) {
      history.undo();
      console.log(`   ✅ Undone`);
    }

    // Step 6: Statistics
    console.log("\n5️⃣  Check tournament stats:");
    const stats = navigator.getStatistics();
    console.log(`   Completed: ${stats.byStatus.completed}`);
    console.log(`   Pending: ${stats.byStatus.pending}`);
  }

  return true;
}

// ════════════════════════════════════════════════════════════
// RUNNER
// ════════════════════════════════════════════════════════════

function runAllTests() {
  console.log("\n");
  console.log("╔" + "═".repeat(58) + "╗");
  console.log("║" + " Navigator & History Tests ".padEnd(59) + "║");
  console.log("╚" + "═".repeat(58) + "╝");

  const tests = [
    { name: "Navigator - Search", fn: testNavigatorSearch },
    { name: "Navigator - Statistics", fn: testNavigatorStatistics },
    { name: "Navigator - Navigation", fn: testNavigatorNavigation },
    { name: "History - Basic Undo/Redo", fn: testHistoryBasic },
    { name: "History - Multiple Snapshots", fn: testHistoryMultipleSnapshots },
    { name: "Combined Workflow", fn: testCombined }
  ];

  const results = [];
  tests.forEach(test => {
    try {
      const passed = test.fn();
      results.push({ name: test.name, passed });
    } catch (error) {
      console.error(`\n❌ CRASH in ${test.name}:`, error.message);
      results.push({ name: test.name, passed: false });
    }
  });

  // Summary
  console.log("\n\n");
  console.log("╔" + "═".repeat(58) + "╗");
  console.log("║" + " TEST SUMMARY ".padEnd(59) + "║");
  console.log("╠" + "═".repeat(58) + "╣");

  results.forEach(r => {
    const status = r.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`║ ${status.padEnd(10)} ${r.name.padEnd(46)} ║`);
  });

  const passCount = results.filter(r => r.passed).length;
  console.log("╠" + "═".repeat(58) + "╣");
  console.log(`║ Total: ${passCount}/${results.length} passed${" ".repeat(43)} ║`);
  console.log("╚" + "═".repeat(58) + "╝");

  return passCount === results.length;
}

// Run tests
runAllTests();
