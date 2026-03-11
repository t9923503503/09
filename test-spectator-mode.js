/**
 * TESTS FOR SPECTATOR MODE
 * Test large display formatting, color schemes, and keyboard shortcuts
 */

const { DoubleElimTournament } = require('./doubleElimPlugin.js');
const { TournamentNavigator } = require('./tournamentNavigator.js');
const { SpectatorMode } = require('./spectatorMode.js');

// ════════════════════════════════════════════════════════════
// TEST DATA
// ════════════════════════════════════════════════════════════

const TEST_TEAMS = [
  {
    id: "p1",
    name: "Alpha Team",
    players: [{ level: 5 }, { level: 5 }]
  },
  {
    id: "p2",
    name: "Beta Team",
    players: [{ level: 5 }, { level: 4 }]
  },
  {
    id: "p3",
    name: "Gamma Team",
    players: [{ level: 4 }, { level: 4 }]
  },
  {
    id: "p4",
    name: "Delta Team",
    players: [{ level: 3 }, { level: 3 }]
  }
];

// ════════════════════════════════════════════════════════════
// TEST 1: SPECTATOR MODE INITIALIZATION
// ════════════════════════════════════════════════════════════

function testInitialization() {
  console.log("\n🧪 TEST 1: Spectator Mode Initialization");
  console.log("═".repeat(60));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS);
  tournament.generateBracket();

  // Without navigator
  const spectator1 = new SpectatorMode(tournament);
  console.log("\n✅ Created spectator mode without navigator");

  // With navigator
  const navigator = new TournamentNavigator(tournament);
  const spectator2 = new SpectatorMode(tournament, navigator);
  console.log("✅ Created spectator mode with navigator");

  // Check default settings
  console.log("\n📋 Default Settings:");
  console.log(`  Font size multiplier: ${spectator1.settings.fontSize}x`);
  console.log(`  Line height: ${spectator1.settings.lineHeight}`);
  console.log(`  Contrast mode: ${spectator1.settings.contrastMode}`);
  console.log(`  Color mode: ${spectator1.settings.colorMode}`);
  console.log(`  Layout: ${spectator1.settings.layout}`);

  return spectator1 && spectator2;
}

// ════════════════════════════════════════════════════════════
// TEST 2: MATCH FORMATTING
// ════════════════════════════════════════════════════════════

function testMatchFormatting() {
  console.log("\n\n🧪 TEST 2: Match Formatting");
  console.log("═".repeat(60));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS);
  tournament.generateBracket();

  const spectator = new SpectatorMode(tournament);

  // Get first match
  const firstMatch = Object.values(tournament.matches)
    .filter(m => m.bracket === "WB" && m.round === 1)[0];

  if (!firstMatch) {
    console.log("No match found");
    return false;
  }

  const formatted = spectator.formatMatch(firstMatch);

  console.log("\n📊 Formatted Match:");
  console.log(`  ID: ${formatted.id}`);
  console.log(`  Bracket: ${formatted.bracket}`);
  console.log(`  Round: ${formatted.round}`);
  console.log(`  Team A: ${formatted.teamA?.name} (Seed #${formatted.teamA?.seed})`);
  console.log(`  Team B: ${formatted.teamB?.name} (Seed #${formatted.teamB?.seed})`);
  console.log(`  Status: ${formatted.status}`);
  console.log(`  Upset: ${formatted.upset}`);
  console.log(`  CSS Class: ${formatted.cssClass}`);
  console.log(`  Size Multiplier: ${formatted.sizeMultiplier}x`);

  return formatted.teamA && formatted.teamB;
}

// ════════════════════════════════════════════════════════════
// TEST 3: CURRENT & UPCOMING MATCHES
// ════════════════════════════════════════════════════════════

function testCurrentUpcoming() {
  console.log("\n\n🧪 TEST 3: Current & Upcoming Matches");
  console.log("═".repeat(60));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS);
  tournament.generateBracket();

  const navigator = new TournamentNavigator(tournament);
  const spectator = new SpectatorMode(tournament, navigator);

  // Current match
  const current = spectator.getCurrentMatch();
  console.log("\n🎯 Current Match:");
  console.log(`  Match: ${current?.id}`);
  console.log(`  ${current?.teamA?.name} vs ${current?.teamB?.name}`);

  // Upcoming matches
  const upcoming = spectator.getUpcomingMatches(3);
  console.log(`\n📋 Upcoming Matches (${upcoming.length}):`);
  upcoming.forEach((match, idx) => {
    console.log(`  ${idx + 1}. ${match.id}: ${match.teamA?.name} vs ${match.teamB?.name}`);
  });

  return current && upcoming.length > 0;
}

// ════════════════════════════════════════════════════════════
// TEST 4: BRACKET DISPLAY
// ════════════════════════════════════════════════════════════

function testBracketDisplay() {
  console.log("\n\n🧪 TEST 4: Bracket Display");
  console.log("═".repeat(60));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS);
  tournament.generateBracket();

  const spectator = new SpectatorMode(tournament);

  // Get WB display
  const wbDisplay = spectator.getBracketDisplay("WB");

  console.log("\n📊 Winners Bracket Display:");
  console.log(`  Bracket: ${wbDisplay.bracket}`);
  console.log(`  Total rounds: ${wbDisplay.totalRounds}`);
  console.log(`  Total matches: ${wbDisplay.totalMatches}`);

  Object.entries(wbDisplay.rounds).forEach(([round, matches]) => {
    console.log(`  Round ${round}: ${matches.length} matches`);
  });

  return wbDisplay.bracket === "WB" && wbDisplay.totalRounds > 0;
}

// ════════════════════════════════════════════════════════════
// TEST 5: TOURNAMENT STANDINGS
// ════════════════════════════════════════════════════════════

function testStandings() {
  console.log("\n\n🧪 TEST 5: Tournament Standings");
  console.log("═".repeat(60));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS);
  tournament.generateBracket();

  const spectator = new SpectatorMode(tournament);

  // Play some matches
  const pending = Object.values(tournament.matches)
    .filter(m => m.status === "pending" && m.bracket === "WB")
    .slice(0, 2);

  pending.forEach(match => {
    if (match.team_a_id) {
      tournament.advanceTeam(match.id, match.team_a_id);
    }
  });

  // Get standings
  const standings = spectator.getStandings();

  console.log("\n📊 Tournament Standings:");
  console.log(`\nLeaders (0 losses):`);
  standings.leaders.forEach(team => {
    console.log(`  ${team.name}: ${team.wins} wins (${team.winRate})`);
  });

  console.log(`\nActive (1 loss):`);
  standings.active.forEach(team => {
    console.log(`  ${team.name}: ${team.wins} wins (${team.winRate})`);
  });

  console.log(`\nEliminated (2+ losses):`);
  standings.eliminated.forEach(team => {
    console.log(`  ${team.name}: ${team.wins} wins (${team.winRate})`);
  });

  return standings.leaders.length > 0;
}

// ════════════════════════════════════════════════════════════
// TEST 6: DISPLAY SETTINGS
// ════════════════════════════════════════════════════════════

function testDisplaySettings() {
  console.log("\n\n🧪 TEST 6: Display Settings");
  console.log("═".repeat(60));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS);
  tournament.generateBracket();

  const spectator = new SpectatorMode(tournament);

  // Test default settings
  let settings = spectator.getDisplaySettings();
  console.log("\n📋 Default Display Settings:");
  console.log(`  Font size multiplier: ${settings.root["--font-size-multiplier"]}x`);
  console.log(`  Body font size: ${settings.body.fontSize}`);
  console.log(`  Line height: ${settings.body.lineHeight}`);

  // Test custom settings
  spectator.updateSettings({
    fontSize: 2.0,
    contrastMode: true,
    colorMode: "dark"
  });

  settings = spectator.getDisplaySettings();
  console.log("\n📋 Updated Display Settings:");
  console.log(`  Font size multiplier: ${settings.root["--font-size-multiplier"]}x`);
  console.log(`  Body font size: ${settings.body.fontSize}`);
  console.log(`  Contrast mode: ${settings.root["--contrast-mode"]}`);

  // Color scheme
  const colors = spectator.getColorScheme();
  console.log("\n🎨 Color Scheme:");
  console.log(`  Background: ${colors.background}`);
  console.log(`  Foreground: ${colors.foreground}`);
  console.log(`  Pending: ${colors.pending}`);
  console.log(`  Active: ${colors.active}`);
  console.log(`  Completed: ${colors.completed}`);
  console.log(`  Upset: ${colors.upset}`);

  return settings && colors;
}

// ════════════════════════════════════════════════════════════
// TEST 7: TEXT EXPORT
// ════════════════════════════════════════════════════════════

function testTextExport() {
  console.log("\n\n🧪 TEST 7: Text Export");
  console.log("═".repeat(60));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS);
  tournament.generateBracket();

  const navigator = new TournamentNavigator(tournament);
  const spectator = new SpectatorMode(tournament, navigator);

  const textDisplay = spectator.exportAsText();

  console.log("\n📄 Exported Text Display:");
  console.log(textDisplay);

  return textDisplay.includes("SPECTATOR VIEW");
}

// ════════════════════════════════════════════════════════════
// TEST 8: KEYBOARD SHORTCUTS
// ════════════════════════════════════════════════════════════

function testShortcuts() {
  console.log("\n\n🧪 TEST 8: Keyboard Shortcuts");
  console.log("═".repeat(60));

  const tournament = new DoubleElimTournament();
  tournament.initializeSeeding(TEST_TEAMS);
  tournament.generateBracket();

  const spectator = new SpectatorMode(tournament);
  const shortcuts = spectator.getShortcuts();

  console.log("\n⌨️  Spectator Mode Shortcuts:");
  Object.entries(shortcuts).forEach(([key, action]) => {
    console.log(`  ${key.padEnd(10)} → ${action}`);
  });

  return Object.keys(shortcuts).length > 0;
}

// ════════════════════════════════════════════════════════════
// RUNNER
// ════════════════════════════════════════════════════════════

function runAllTests() {
  console.log("\n");
  console.log("╔" + "═".repeat(58) + "╗");
  console.log("║" + " Spectator Mode Tests ".padEnd(59) + "║");
  console.log("╚" + "═".repeat(58) + "╝");

  const tests = [
    { name: "Initialization", fn: testInitialization },
    { name: "Match Formatting", fn: testMatchFormatting },
    { name: "Current & Upcoming", fn: testCurrentUpcoming },
    { name: "Bracket Display", fn: testBracketDisplay },
    { name: "Tournament Standings", fn: testStandings },
    { name: "Display Settings", fn: testDisplaySettings },
    { name: "Text Export", fn: testTextExport },
    { name: "Keyboard Shortcuts", fn: testShortcuts }
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
