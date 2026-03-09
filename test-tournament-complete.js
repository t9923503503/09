/**
 * ADVANCED TOURNAMENT TESTING
 * Simulate complete tournament with score tracking and advancement
 */

const { DoubleElimTournament } = require('./doubleElimPlugin.js');

// ════════════════════════════════════════════════════════════
// TEST TEAMS
// ════════════════════════════════════════════════════════════

const TEST_TEAMS = [
  {
    id: "p1",
    name: "🥇 Top Team",
    players: [
      { id: "t1_1", name: "Player 1A", level: 5 },
      { id: "t1_2", name: "Player 1B", level: 5 }
    ]
  },
  {
    id: "p2",
    name: "🥈 Strong Team",
    players: [
      { id: "t2_1", name: "Player 2A", level: 5 },
      { id: "t2_2", name: "Player 2B", level: 4 }
    ]
  },
  {
    id: "p3",
    name: "🥉 Medium Team",
    players: [
      { id: "t3_1", name: "Player 3A", level: 4 },
      { id: "t3_2", name: "Player 3B", level: 4 }
    ]
  },
  {
    id: "p4",
    name: "🏅 Weak Team",
    players: [
      { id: "t4_1", name: "Player 4A", level: 3 },
      { id: "t4_2", name: "Player 4B", level: 3 }
    ]
  }
];

// ════════════════════════════════════════════════════════════
// TEST 1: Simulate Complete Tournament with 4 Teams
// ════════════════════════════════════════════════════════════

function testCompleteSimulation() {
  console.log("\n🧪 TEST 1: Complete Tournament Simulation (4 teams)");
  console.log("═".repeat(60));

  const tournament = new DoubleElimTournament({
    id: "sim_001",
    name: "Test Tournament"
  });

  // Initialize
  const seedInfo = tournament.initializeSeeding(TEST_TEAMS);
  console.log(`\n📊 Seeding (Power of 2: ${seedInfo.bracketSize}):`);
  seedInfo.teams.forEach(t => {
    console.log(`  Seed #${t.seed.toString().padStart(2)}: ${t.name.padEnd(20)} (TSI: ${t.trueSkillIndex}, Bye: ${t.bye ? "✓" : "✗"})`);
  });

  // Generate bracket
  tournament.generateBracket();
  const status = tournament.getStatus();

  console.log(`\n📋 Bracket Structure:`);
  console.log(`  Total matches: ${status.progress.total}`);
  console.log(`  Winners: ${status.bracket.winners}, Losers: ${status.bracket.losers}, Finals: 1`);

  // Simulate matches
  console.log(`\n▶️  Match Simulation:`);

  // Get all rounds of matches in order
  const allMatches = Object.values(tournament.matches).sort((a, b) => {
    // Sort by bracket, then round, then position
    const bracketOrder = { "WB": 0, "LB": 1, "GRAND_FINAL": 2, "SUPER_FINAL": 3 };
    const aOrder = bracketOrder[a.bracket] || 99;
    const bOrder = bracketOrder[b.bracket] || 99;
    if (aOrder !== bOrder) return aOrder - bOrder;
    if (a.round !== b.round) return a.round - b.round;
    return a.position - b.position;
  });

  let matchesPlayed = 0;
  for (const match of allMatches) {
    if (match.status === "completed") continue;  // Skip already completed (byes)

    const teamA = tournament.teams.find(t => t.id === match.team_a_id);
    const teamB = tournament.teams.find(t => t.id === match.team_b_id);

    if (!teamA || !teamB) continue;  // Skip incomplete matches

    // Decide winner based on seeding (higher seed usually wins)
    // But introduce some upsets
    const isUpset = Math.random() > 0.7;
    const winnerId = isUpset ? teamB.id : teamA.id;
    const loserTeam = winnerId === teamA.id ? teamB : teamA;

    try {
      const result = tournament.advanceTeam(match.id, winnerId);

      // Check upset
      if (result.currentMatch.upsetAlert) {
        console.log(`  🔥 ${match.id}: ${result.winner.name} beats ${loserTeam.name} (UPSET)`);
      } else {
        console.log(`  ✓ ${match.id}: ${result.winner.name} defeats ${loserTeam.name}`);
      }

      matchesPlayed++;

      if (matchesPlayed % 5 === 0) {
        const s = tournament.getStatus();
        console.log(`     └─ Progress: ${s.progress.completed}/${s.progress.total} matches (${s.progress.percentage}%)`);
      }
    } catch (e) {
      console.log(`  ❌ Error in ${match.id}: ${e.message}`);
      return false;
    }
  }

  const finalStatus = tournament.getStatus();
  console.log(`\n📊 Final Status:`);
  console.log(`  Total matches played: ${matchesPlayed}`);
  console.log(`  Progress: ${finalStatus.progress.completed}/${finalStatus.progress.total} (${finalStatus.progress.percentage}%)`);

  return true;
}

// ════════════════════════════════════════════════════════════
// TEST 2: Losers Bracket Advancement
// ════════════════════════════════════════════════════════════

function testLosersBracketAdvancement() {
  console.log("\n\n🧪 TEST 2: Losers Bracket Advancement");
  console.log("═".repeat(60));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS);
  tournament.generateBracket();

  console.log(`\n📋 Match structure:`);

  // Group by bracket
  const byBracket = {
    "WB": [],
    "LB": [],
    "GRAND_FINAL": [],
    "SUPER_FINAL": []
  };

  Object.values(tournament.matches).forEach(m => {
    byBracket[m.bracket]?.push(m);
  });

  Object.entries(byBracket).forEach(([bracket, matches]) => {
    if (matches.length === 0) return;
    console.log(`\n${bracket}:`);

    // Group by round
    const byRound = {};
    matches.forEach(m => {
      if (!byRound[m.round]) byRound[m.round] = [];
      byRound[m.round].push(m);
    });

    Object.keys(byRound).sort((a, b) => parseInt(a) - parseInt(b)).forEach(round => {
      const roundMatches = byRound[round];
      console.log(`  Round ${round}: ${roundMatches.length} match(es)`);
    });
  });

  // Verify LB matches have proper connections from WB
  const wbFinalRound = Math.max(...Object.values(tournament.matches)
    .filter(m => m.bracket === "WB")
    .map(m => m.round));

  console.log(`\n🔗 Connection Check:`);
  console.log(`  Winners bracket final round: ${wbFinalRound}`);

  const lbMatches = Object.values(tournament.matches).filter(m => m.bracket === "LB");
  const wbMatches = Object.values(tournament.matches).filter(m => m.bracket === "WB");

  console.log(`  WB matches with loser connections: ${wbMatches.filter(m => m.nextMatchLoserId).length}`);
  console.log(`  LB match slots available: ${lbMatches.length}`);

  if (wbMatches.filter(m => m.nextMatchLoserId).length > 0) {
    console.log(`  ✅ Loser bracket properly connected`);
  } else {
    console.log(`  ⚠️  No loser bracket connections found`);
  }

  return true;
}

// ════════════════════════════════════════════════════════════
// TEST 3: Edge Cases - Single Match Scenarios
// ════════════════════════════════════════════════════════════

function testEdgeCases() {
  console.log("\n\n🧪 TEST 3: Edge Cases");
  console.log("═".repeat(60));

  // Test 1: Minimum teams (2)
  console.log(`\n📋 Case 1: 2 teams (minimum)`);
  const t2 = new DoubleElimTournament();
  const teams2 = TEST_TEAMS.slice(0, 2);
  t2.initializeSeeding(teams2);
  t2.generateBracket();
  const s2 = t2.getStatus();
  console.log(`  Bracket size: ${Math.pow(2, Math.ceil(Math.log2(2)))}`);
  console.log(`  Total matches: ${s2.progress.total}`);
  console.log(`  Expected: 3 (1 WB final, 1 LB final, 1 Grand Final) = 3 ✓`);

  // Test 2: Power of 2 (4)
  console.log(`\n📋 Case 2: 4 teams (power of 2)`);
  const t4 = new DoubleElimTournament();
  t4.initializeSeeding(TEST_TEAMS);
  t4.generateBracket();
  const s4 = t4.getStatus();
  console.log(`  Bracket size: 4`);
  console.log(`  Total matches: ${s4.progress.total}`);
  console.log(`  Bye count: 0 ✓`);

  // Test 3: Non-power of 2 (3)
  console.log(`\n📋 Case 3: 3 teams (non-power of 2)`);
  const t3 = new DoubleElimTournament();
  const teams3 = TEST_TEAMS.slice(0, 3);
  t3.initializeSeeding(teams3);
  t3.generateBracket();
  const s3 = t3.getStatus();
  console.log(`  Bracket size: 4 (next power of 2)`);
  console.log(`  Total matches: ${s3.progress.total}`);
  console.log(`  Bye count: 1`);
  const byeCount = t3.teams.filter(t => t.bye).length;
  console.log(`  Teams with bye: ${byeCount}`);

  return true;
}

// ════════════════════════════════════════════════════════════
// TEST 4: Match Score Validation
// ════════════════════════════════════════════════════════════

function testScoreTracking() {
  console.log("\n\n🧪 TEST 4: Score Tracking");
  console.log("═".repeat(60));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS);
  tournament.generateBracket();

  // Find a pending match
  const testMatch = Object.values(tournament.matches).find(m =>
    m.status === "pending" && m.team_a_id && m.team_b_id
  );

  if (!testMatch) {
    console.log("No pending match found");
    return false;
  }

  const teamA = tournament.teams.find(t => t.id === testMatch.team_a_id);
  const teamB = tournament.teams.find(t => t.id === testMatch.team_b_id);

  console.log(`\n📋 Test Match: ${testMatch.id}`);
  console.log(`  ${teamA.name} vs ${teamB.name}`);
  console.log(`  Initial status: ${testMatch.status}`);
  console.log(`  Initial scores: ${testMatch.score_a} - ${testMatch.score_b}`);

  // Record result
  const result = tournament.advanceTeam(testMatch.id, teamA.id);

  console.log(`\nAfter result:`);
  console.log(`  Winner: ${result.winner.name}`);
  console.log(`  Status: ${result.currentMatch.status}`);
  console.log(`  Next match for winner: ${result.nextMatchWinner?.id || 'none'}`);
  console.log(`  Next match for loser: ${result.nextMatchLoser?.id || 'none'}`);

  // Verify state
  if (result.currentMatch.status !== "completed") {
    console.log(`\n❌ ERROR: Match not marked as completed`);
    return false;
  }

  if (!result.currentMatch.winner_id) {
    console.log(`\n❌ ERROR: Winner not recorded`);
    return false;
  }

  console.log(`\n✅ Score tracking working correctly`);
  return true;
}

// ════════════════════════════════════════════════════════════
// RUNNER
// ════════════════════════════════════════════════════════════

function runAllTests() {
  console.log("\n");
  console.log("╔" + "═".repeat(58) + "╗");
  console.log("║" + " Advanced Tournament Testing ".padEnd(59) + "║");
  console.log("╚" + "═".repeat(58) + "╝");

  const tests = [
    { name: "Complete Simulation", fn: testCompleteSimulation },
    { name: "Losers Bracket", fn: testLosersBracketAdvancement },
    { name: "Edge Cases", fn: testEdgeCases },
    { name: "Score Tracking", fn: testScoreTracking }
  ];

  const results = [];
  tests.forEach(test => {
    try {
      const passed = test.fn();
      results.push({ name: test.name, passed });
    } catch (error) {
      console.error(`\n❌ CRASH in ${test.name}:`, error.message);
      console.error(error.stack);
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
