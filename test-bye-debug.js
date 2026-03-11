const { DoubleElimTournament } = require('./doubleElimPlugin.js');

const TEAMS = [
  {
    id: "pair_001",
    name: "Team A",
    players: [{ level: 5 }, { level: 4 }]
  },
  {
    id: "pair_002",
    name: "Team B",
    players: [{ level: 5 }, { level: 3 }]
  },
  {
    id: "pair_003",
    name: "Team C",
    players: [{ level: 4 }, { level: 4 }]
  },
  {
    id: "pair_004",
    name: "Team D",
    players: [{ level: 3 }, { level: 3 }]
  },
  {
    id: "pair_005",
    name: "Team E",
    players: [{ level: 4 }, { level: 2 }]
  },
  {
    id: "pair_006",
    name: "Team F",
    players: [{ level: 3 }, { level: 3 }]
  }
];

const tournament = new DoubleElimTournament();
tournament.initializeSeeding(TEAMS);
tournament.generateBracket();

console.log("🔍 BYE ANALYSIS:\n");
console.log("Teams with bye:");
tournament.teams.forEach(t => {
  if (t.bye) console.log(`  - Seed #${t.seed}: ${t.name}`);
});

console.log("\nWinners Bracket Round 1 matches:");
const r1 = Object.values(tournament.matches).filter(m => m.bracket === "WB" && m.round === 1);
r1.forEach(m => {
  const a = tournament.teams.find(t => t.id === m.team_a_id);
  const b = tournament.teams.find(t => t.id === m.team_b_id);
  console.log(`\n${m.id}:`);
  console.log(`  Team A: ${a?.name} (bye: ${a?.bye})`);
  console.log(`  Team B: ${b?.name} (bye: ${b?.bye})`);
  console.log(`  isBye: ${m.isBye}`);
  console.log(`  winner_id: ${m.winner_id}`);
  console.log(`  status: ${m.status}`);
});

console.log("\n\n🎯 ISSUE: How should bye work?");
console.log("Option 1: Each team with bye gets 1 auto-win match");
console.log("Option 2: Bye teams start in round 2");
console.log("\nCurrent implementation: bye flag on team, but not handled properly in bracket");
