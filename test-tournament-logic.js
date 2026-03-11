/**
 * COMPREHENSIVE TEST SUITE FOR DOUBLE ELIMINATION TOURNAMENT ENGINE
 * Tests seeding, bracket generation, advancement logic, and edge cases
 */

// Mock DoubleElimTournament for testing (in Node.js)
const { DoubleElimTournament } = require('./doubleElimPlugin.js');

// ════════════════════════════════════════════════════════════
// TEST DATA
// ════════════════════════════════════════════════════════════

const TEST_TEAMS_6 = [
  {
    id: "pair_001",
    name: "Team A",
    players: [
      { id: "p1", name: "Player 1", level: 5 },
      { id: "p2", name: "Player 2", level: 4 }
    ]
  },
  {
    id: "pair_002",
    name: "Team B",
    players: [
      { id: "p3", name: "Player 3", level: 5 },
      { id: "p4", name: "Player 4", level: 3 }
    ]
  },
  {
    id: "pair_003",
    name: "Team C",
    players: [
      { id: "p5", name: "Player 5", level: 4 },
      { id: "p6", name: "Player 6", level: 4 }
    ]
  },
  {
    id: "pair_004",
    name: "Team D",
    players: [
      { id: "p7", name: "Player 7", level: 3 },
      { id: "p8", name: "Player 8", level: 3 }
    ]
  },
  {
    id: "pair_005",
    name: "Team E",
    players: [
      { id: "p9", name: "Player 9", level: 4 },
      { id: "p10", name: "Player 10", level: 2 }
    ]
  },
  {
    id: "pair_006",
    name: "Team F",
    players: [
      { id: "p11", name: "Player 11", level: 3 },
      { id: "p12", name: "Player 12", level: 3 }
    ]
  }
];

const TEST_TEAMS_8 = [
  ...TEST_TEAMS_6,
  {
    id: "pair_007",
    name: "Team G",
    players: [
      { id: "p13", name: "Player 13", level: 2 },
      { id: "p14", name: "Player 14", level: 2 }
    ]
  },
  {
    id: "pair_008",
    name: "Team H",
    players: [
      { id: "p15", name: "Player 15", level: 2 },
      { id: "p16", name: "Player 16", level: 1 }
    ]
  }
];

// ════════════════════════════════════════════════════════════
// TEST 1: True Skill Index Calculation
// ════════════════════════════════════════════════════════════

function testTrueSkillIndexCalculation() {
  console.log("\n🧪 TEST 1: True Skill Index Calculation");
  console.log("═".repeat(50));

  const tournament = new DoubleElimTournament();

  const testCases = [
    {
      name: "Simple pair (5+4=9)",
      team: {
        id: "t1",
        name: "Test Pair",
        players: [
          { level: 5 },
          { level: 4 }
        ]
      },
      expected: 9
    },
    {
      name: "Equal skill (4+4=8)",
      team: {
        id: "t2",
        name: "Equal Pair",
        players: [
          { level: 4 },
          { level: 4 }
        ]
      },
      expected: 8
    },
    {
      name: "One player no level (5+1=6)",
      team: {
        id: "t3",
        name: "Unspecified",
        players: [
          { level: 5 },
          {}
        ]
      },
      expected: 6
    },
    {
      name: "Empty team (0)",
      team: {
        id: "t4",
        name: "Empty",
        players: []
      },
      expected: 0
    }
  ];

  let passed = 0;
  testCases.forEach(tc => {
    const result = tournament.calculateTrueSkillIndex(tc.team);
    const success = result === tc.expected;
    passed += success ? 1 : 0;
    console.log(`${success ? "✅" : "❌"} ${tc.name}: got ${result}, expected ${tc.expected}`);
  });

  console.log(`\nResult: ${passed}/${testCases.length} passed`);
  return passed === testCases.length;
}

// ════════════════════════════════════════════════════════════
// TEST 2: Seeding Order Generation
// ════════════════════════════════════════════════════════════

function testSeedingOrder() {
  console.log("\n🧪 TEST 2: Seeding Order & Bye Allocation");
  console.log("═".repeat(50));

  const tournament = new DoubleElimTournament();
  const seedInfo = tournament.initializeSeeding(TEST_TEAMS_6);

  console.log("✓ Teams sorted by True Skill Index:");
  tournament.teams.forEach(t => {
    console.log(`  Seed #${t.seed.toString().padStart(2)}: ${t.name.padEnd(15)} (TSI: ${t.trueSkillIndex}, Bye: ${t.bye})`);
  });

  console.log(`\n✓ Seeding order (standard 1 vs N algorithm):`);
  seedInfo.teams.forEach((_, i) => {
    console.log(`  Position ${i + 1}: ${seedInfo.teams[i].name}`);
  });

  console.log(`\n✓ Bracket size: ${seedInfo.bracketSize} (next power of 2)`);
  console.log(`✓ Bye count: ${seedInfo.byesCount}`);

  // ISSUE CHECK: Are byes allocated to top seeds? They should NOT be
  const byeTeams = seedInfo.teams.filter(t => t.bye);
  console.log(`\n⚠️  ISSUE CHECK: Bye allocation`);
  console.log(`   Teams with bye: ${byeTeams.map(t => `Seed #${t.seed} (TSI: ${t.trueSkillIndex})`).join(", ")}`);

  if (byeTeams.length > 0 && byeTeams[0].seed === 1) {
    console.log("   ❌ BUG: Top seeds have bye (should be bottom seeds for more matches)");
    return false;
  } else {
    console.log("   ✅ Bye allocation looks correct");
  }

  return true;
}

// ════════════════════════════════════════════════════════════
// TEST 3: Bracket Generation for 6 Teams
// ════════════════════════════════════════════════════════════

function testBracketGeneration6Teams() {
  console.log("\n🧪 TEST 3: Bracket Generation (6 teams → 8 bracket size)");
  console.log("═".repeat(50));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS_6);
  const bracket = tournament.generateBracket();

  console.log(`✓ Winners Bracket:`);
  console.log(`  Matches: ${bracket.winners}`);
  console.log(`  Rounds: ${Math.log2(8)}`);

  // Group by rounds
  const wbByRound = {};
  Object.values(tournament.matches)
    .filter(m => m.bracket === "WB")
    .forEach(m => {
      if (!wbByRound[m.round]) wbByRound[m.round] = [];
      wbByRound[m.round].push(m);
    });

  Object.keys(wbByRound).sort((a, b) => a - b).forEach(round => {
    const matches = wbByRound[round];
    console.log(`  Round ${round}: ${matches.length} matches`);
    matches.forEach(m => {
      const teamA = tournament.teams.find(t => t.id === m.team_a_id);
      const teamB = tournament.teams.find(t => t.id === m.team_b_id);
      console.log(`    ${m.id}: ${teamA?.name || "(bye)"} vs ${teamB?.name || "(bye)"}`);
    });
  });

  console.log(`\n✓ Losers Bracket:`);
  const lbByRound = {};
  Object.values(tournament.matches)
    .filter(m => m.bracket === "LB")
    .forEach(m => {
      if (!lbByRound[m.round]) lbByRound[m.round] = [];
      lbByRound[m.round].push(m);
    });

  Object.keys(lbByRound).sort((a, b) => a - b).forEach(round => {
    const matches = lbByRound[round];
    console.log(`  Round ${round}: ${matches.length} matches`);
  });

  console.log(`\n✓ Grand Final: ${tournament.bracket.grand_final.id}`);
  console.log(`✓ Total matches: ${Object.keys(tournament.matches).length}`);

  // Validation: For 6 teams (8 bracket):
  // WB: 4 + 2 + 1 = 7 matches
  // LB: 3 + 2 + 1 = 6? (simplified, but depends on structure)
  // GF: 1
  const wbCount = Object.values(tournament.matches).filter(m => m.bracket === "WB").length;
  const lbCount = Object.values(tournament.matches).filter(m => m.bracket === "LB").length;
  const gfCount = 1;

  console.log(`\n📊 Match Distribution:`);
  console.log(`  WB: ${wbCount} matches`);
  console.log(`  LB: ${lbCount} matches`);
  console.log(`  GF: ${gfCount} match`);
  console.log(`  Total: ${wbCount + lbCount + gfCount} matches`);

  return true;
}

// ════════════════════════════════════════════════════════════
// TEST 4: Match Advancement Logic
// ════════════════════════════════════════════════════════════

function testMatchAdvancement() {
  console.log("\n🧪 TEST 4: Match Advancement & Upset Detection");
  console.log("═".repeat(50));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS_6);
  tournament.generateBracket();

  // Find first match
  const firstMatch = Object.values(tournament.matches).find(m => m.bracket === "WB" && m.round === 1);

  if (!firstMatch) {
    console.log("❌ No first round match found");
    return false;
  }

  console.log(`\n✓ Testing match: ${firstMatch.id}`);
  const teamA = tournament.teams.find(t => t.id === firstMatch.team_a_id);
  const teamB = tournament.teams.find(t => t.id === firstMatch.team_b_id);

  console.log(`  Team A: ${teamA?.name} (Seed #${teamA?.seed}, TSI: ${teamA?.trueSkillIndex})`);
  console.log(`  Team B: ${teamB?.name} (Seed #${teamB?.seed}, TSI: ${teamB?.trueSkillIndex})`);

  if (!teamA || !teamB) {
    console.log("❌ Teams not properly assigned");
    return false;
  }

  // Simulate an upset: lower seed wins
  const isUpset = teamB.seed > teamA.seed;
  const winnerId = isUpset ? teamB.id : teamA.id;
  const loserSeed = isUpset ? teamA.seed : teamB.seed;

  console.log(`\n  Recording win for: ${tournament.teams.find(t => t.id === winnerId)?.name}`);

  const result = tournament.advanceTeam(firstMatch.id, winnerId);

  console.log(`\n✓ Match completed:`);
  console.log(`  Winner: ${result.winner.name} (Seed #${result.winner.seed})`);
  console.log(`  Loser: ${result.loser?.name} (Seed #${result.loser?.seed})`);
  console.log(`  Upset Alert: ${result.currentMatch.upsetAlert ? "🔥 YES (upset!)" : "No (expected result)"}`);

  if (isUpset && !result.currentMatch.upsetAlert) {
    console.log(`\n❌ ISSUE: Upset not detected (lower seed should have alert)`);
    return false;
  }

  console.log(`\n✓ Next matches assigned:`);
  console.log(`  Winner advances to: ${result.nextMatchWinner?.id || "none"}`);
  console.log(`  Loser drops to: ${result.nextMatchLoser?.id || "none"}`);

  return true;
}

// ════════════════════════════════════════════════════════════
// TEST 5: Bye Handling
// ════════════════════════════════════════════════════════════

function testByeHandling() {
  console.log("\n🧪 TEST 5: Bye Match Handling");
  console.log("═".repeat(50));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS_6);
  tournament.generateBracket();

  // Find a bye match
  const byeMatches = Object.values(tournament.matches).filter(m => m.isBye);

  console.log(`✓ Bye matches found: ${byeMatches.length}`);

  if (byeMatches.length === 0) {
    console.log("⚠️  No bye matches found (expected for 6 teams with 2 byes)");
    return false;
  }

  byeMatches.forEach(m => {
    const team = tournament.teams.find(t => t.id === m.team_a_id || t.id === m.team_b_id);
    console.log(`\n  ${m.id}:`);
    console.log(`    Team: ${team?.name}`);
    console.log(`    Status: ${m.status}`);
    console.log(`    Winner: ${m.winner_id ? "already set" : "not set"}`);
    console.log(`    Is completed: ${m.status === "completed"}`);

    if (m.status !== "completed" || !m.winner_id) {
      console.log(`    ❌ BUG: Bye match not properly completed`);
      return false;
    }
  });

  return true;
}

// ════════════════════════════════════════════════════════════
// TEST 6: Tournament Status Tracking
// ════════════════════════════════════════════════════════════

function testTournamentStatus() {
  console.log("\n🧪 TEST 6: Tournament Status & Progress");
  console.log("═".repeat(50));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS_6);
  tournament.generateBracket();

  const status = tournament.getStatus();

  console.log(`✓ Tournament ID: ${status.tournamentId}`);
  console.log(`✓ Status: ${status.status}`);
  console.log(`✓ Teams: ${status.teams}`);
  console.log(`\n✓ Progress:`);
  console.log(`  Completed: ${status.progress.completed}/${status.progress.total}`);
  console.log(`  Percentage: ${status.progress.percentage}%`);
  console.log(`\n✓ Bracket structure:`);
  console.log(`  Winners matches: ${status.bracket.winners}`);
  console.log(`  Losers matches: ${status.bracket.losers}`);
  console.log(`  Grand final: ${status.bracket.grand_final ? "yes" : "no"}`);

  return true;
}

// ════════════════════════════════════════════════════════════
// RUNNER
// ════════════════════════════════════════════════════════════

function runAllTests() {
  console.log("\n");
  console.log("╔" + "═".repeat(48) + "╗");
  console.log("║" + " Double Elimination Tournament Engine Tests ".padEnd(49) + "║");
  console.log("╚" + "═".repeat(48) + "╝");

  const tests = [
    { name: "True Skill Index", fn: testTrueSkillIndexCalculation },
    { name: "Seeding Order", fn: testSeedingOrder },
    { name: "Bracket Generation (6 teams)", fn: testBracketGeneration6Teams },
    { name: "Match Advancement", fn: testMatchAdvancement },
    { name: "Bye Handling", fn: testByeHandling },
    { name: "Tournament Status", fn: testTournamentStatus }
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
  console.log("╔" + "═".repeat(48) + "╗");
  console.log("║" + " TEST SUMMARY ".padEnd(49) + "║");
  console.log("╠" + "═".repeat(48) + "╣");

  results.forEach(r => {
    const status = r.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`║ ${status.padEnd(8)} ${r.name.padEnd(38)} ║`);
  });

  const passCount = results.filter(r => r.passed).length;
  console.log("╠" + "═".repeat(48) + "╣");
  console.log(`║ Total: ${passCount}/${results.length} passed${" ".repeat(31)} ║`);
  console.log("╚" + "═".repeat(48) + "╝");

  return passCount === results.length;
}

// Run tests
runAllTests();
