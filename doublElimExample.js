/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DOUBLE ELIMINATION - USAGE EXAMPLES & UI RENDERING
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ════════════════════════════════════════════════════════════
// EXAMPLE 1: Initialize Tournament & Generate Bracket
// ════════════════════════════════════════════════════════════

const exampleTeams = [
  {
    id: "pair_001",
    name: "Иван & Петр",
    players: [
      { id: "p1", name: "Иван", level: 5 },
      { id: "p2", name: "Петр", level: 4 }
    ]
  },
  {
    id: "pair_002",
    name: "Сергей & Алексей",
    players: [
      { id: "p3", name: "Сергей", level: 5 },
      { id: "p4", name: "Алексей", level: 3 }
    ]
  },
  {
    id: "pair_003",
    name: "Виктор & Павел",
    players: [
      { id: "p5", name: "Виктор", level: 4 },
      { id: "p6", name: "Павел", level: 4 }
    ]
  },
  {
    id: "pair_004",
    name: "Дмитрий & Игорь",
    players: [
      { id: "p7", name: "Дмитрий", level: 3 },
      { id: "p8", name: "Игорь", level: 3 }
    ]
  },
  {
    id: "pair_005",
    name: "Андрей & Констин",
    players: [
      { id: "p9", name: "Андрей", level: 4 },
      { id: "p10", name: "Констин", level: 2 }
    ]
  },
  {
    id: "pair_006",
    name: "Борис & Федор",
    players: [
      { id: "p11", name: "Борис", level: 3 },
      { id: "p12", name: "Федор", level: 3 }
    ]
  }
];

/**
 * Initialize and generate bracket
 */
function initTournament() {
  const tournament = new DoubleElimTournament({
    id: "tournament_2026_03",
    name: "Открытый чемпионат 2026"
  });

  // Step 1: Initialize seeding
  const seedingInfo = tournament.initializeSeeding(exampleTeams);
  console.log("🎯 Seeding Info:", seedingInfo);
  /*
  Output:
  {
    totalTeams: 6,
    bracketSize: 8,
    byesCount: 2,
    teams: [
      { id: 'pair_001', trueSkillIndex: 9, seed: 1, bye: true },
      { id: 'pair_002', trueSkillIndex: 8, seed: 2, bye: true },
      { id: 'pair_003', trueSkillIndex: 8, seed: 3, bye: false },
      ...
    ]
  }
  */

  // Step 2: Generate bracket structure
  const bracket = tournament.generateBracket();
  console.log("📊 Bracket Generated:", bracket);
  /*
  Output:
  {
    winners: [8 matches in winners bracket],
    losers: [6 matches in losers bracket],
    grand_final: {...},
    totalMatches: 15
  }
  */

  return tournament;
}

// ════════════════════════════════════════════════════════════
// EXAMPLE 2: Record Match Result & Track Advancement
// ════════════════════════════════════════════════════════════

function recordMatchResult(tournament, matchId, winnerId) {
  const result = tournament.advanceTeam(matchId, winnerId);

  console.log("✅ Match Result:", {
    match: result.currentMatch,
    winner: result.winner.name,
    loser: result.loser?.name,
    nextRoundWinner: result.nextMatchWinner?.id,
    nextRoundLoser: result.nextMatchLoser?.id,
    upsetAlert: result.currentMatch.upsetAlert
  });

  return result;
}

// ════════════════════════════════════════════════════════════
// EXAMPLE 3: SUPABASE INTEGRATION
// ════════════════════════════════════════════════════════════

/**
 * Save tournament to Supabase
 * Assumes supabase client is available as `window.supabase`
 */
async function saveTournamentToSupabase(tournament) {
  if (!window.supabase) {
    console.error("Supabase client not initialized");
    return;
  }

  const { data, error } = await window.supabase
    .from("tournaments")
    .insert({
      id: tournament.id,
      name: tournament.name,
      format: "DOUBLE_ELIMINATION",
      status: tournament.status,
      data: tournament.toJSON(),
      created_at: tournament.createdAt,
      updated_at: tournament.updatedAt
    });

  if (error) {
    console.error("❌ Error saving tournament:", error);
    return null;
  }

  // Save all matches
  const matches = Object.values(tournament.matches).map(m => ({
    ...m,
    tournament_id: tournament.id
  }));

  const { data: matchData, error: matchError } = await window.supabase
    .from("matches")
    .insert(matches);

  if (matchError) {
    console.error("❌ Error saving matches:", matchError);
    return null;
  }

  console.log("✅ Tournament saved to Supabase");
  return { tournament: data, matches: matchData };
}

/**
 * Listen for real-time match updates from Supabase
 */
function subscribeToMatchUpdates(tournament, tournamentId) {
  if (!window.supabase) return;

  const subscription = window.supabase
    .from(`matches:tournament_id=eq.${tournamentId}`)
    .on("*", (payload) => {
      console.log("🔄 Match update received:", payload);

      if (payload.eventType === "UPDATE") {
        const updatedMatch = payload.new;
        const localMatch = tournament.matches[updatedMatch.id];

        if (localMatch) {
          // Update local match
          localMatch.score_a = updatedMatch.score_a;
          localMatch.score_b = updatedMatch.score_b;
          localMatch.status = updatedMatch.status;

          // If completed, advance team
          if (
            updatedMatch.status === "completed" &&
            updatedMatch.winner_id &&
            !localMatch.winner_id
          ) {
            tournament.advanceTeam(
              updatedMatch.id,
              updatedMatch.winner_id
            );

            // Trigger UI update
            rerenderBracket(tournament);
          }
        }
      }
    })
    .subscribe();

  return subscription;
}

// ════════════════════════════════════════════════════════════
// EXAMPLE 4: UI RENDERING - MATCH CARD
// ════════════════════════════════════════════════════════════

/**
 * Render a single match card (organizer view with score input)
 */
function renderMatchCard(match, tournament, isOrganizerMode = false) {
  const teamA = tournament.teams.find(t => t.id === match.team_a_id);
  const teamB = tournament.teams.find(t => t.id === match.team_b_id);

  const upsetClass = match.upsetAlert ? " match-upset" : "";
  const byeClass = match.isBye ? " match-bye" : "";
  const completedClass = match.status === "completed" ? " match-completed" : "";

  const byeContent = match.isBye
    ? `<div class="match-bye-label">🎯 Bye</div>`
    : "";

  const scoreInputs = isOrganizerMode && match.status !== "completed"
    ? `
      <input
        type="number"
        class="score-input score-a"
        data-match-id="${match.id}"
        placeholder="0"
        min="0"
      />
      <span class="score-vs">—</span>
      <input
        type="number"
        class="score-input score-b"
        data-match-id="${match.id}"
        placeholder="0"
        min="0"
      />
      <button class="btn-record-score" data-match-id="${match.id}">✓</button>
    `
    : `
      <div class="score-display">
        ${match.score_a !== undefined ? match.score_a : "—"}
        <span class="score-vs">—</span>
        ${match.score_b !== undefined ? match.score_b : "—"}
      </div>
    `;

  const winnerDisplay = match.winner_id
    ? `<div class="match-winner">🏆 ${
        tournament.teams.find(t => t.id === match.winner_id)?.name
      }</div>`
    : "";

  return `
    <div class="match-card${upsetClass}${byeClass}${completedClass}" data-match-id="${match.id}">
      ${byeContent}
      <div class="match-body">
        <div class="match-team team-a" data-team-id="${match.team_a_id}">
          <div class="team-seed">${teamA?.seed ? "#" + teamA.seed : ""}</div>
          <div class="team-name">${teamA?.name || "TBD"}</div>
          <div class="team-level">${teamA ? `${teamA.trueSkillIndex}` : ""}</div>
        </div>

        <div class="match-score">
          ${scoreInputs}
        </div>

        <div class="match-team team-b" data-team-id="${match.team_b_id}">
          <div class="team-seed">${teamB?.seed ? "#" + teamB.seed : ""}</div>
          <div class="team-name">${teamB?.name || "TBD"}</div>
          <div class="team-level">${teamB ? `${teamB.trueSkillIndex}` : ""}</div>
        </div>
      </div>
      ${winnerDisplay}
    </div>
  `;
}

// ════════════════════════════════════════════════════════════
// EXAMPLE 5: UI RENDERING - FULL BRACKET
// ════════════════════════════════════════════════════════════

/**
 * Render full bracket with tabs (WB, LB, Finals)
 */
function renderBracketTabs(tournament, isOrganizerMode = false) {
  const wbHtml = renderBracketRound(
    tournament.bracket.winners,
    tournament,
    "WB",
    isOrganizerMode
  );

  const lbHtml = renderBracketRound(
    tournament.bracket.losers,
    tournament,
    "LB",
    isOrganizerMode
  );

  const gfTeamA = tournament.teams.find(
    t => t.id === tournament.bracket.grand_final.team_a_id
  );
  const gfTeamB = tournament.teams.find(
    t => t.id === tournament.bracket.grand_final.team_b_id
  );

  const gfHtml = `
    <div class="bracket-section">
      <h3>Финал</h3>
      ${renderMatchCard(tournament.bracket.grand_final, tournament, isOrganizerMode)}
      ${tournament.bracket.super_final
        ? `<div class="super-final-label">⚡ Super Final (LB Winner Advantage)</div>
           ${renderMatchCard(tournament.bracket.super_final, tournament, isOrganizerMode)}`
        : ""}
    </div>
  `;

  return `
    <div class="bracket-container">
      <div class="bracket-tabs">
        <button class="tab-btn active" data-tab="winners-bracket">
          👑 Верхняя сетка (${tournament.bracket.winners.length})
        </button>
        <button class="tab-btn" data-tab="losers-bracket">
          🏃 Нижняя сетка (${tournament.bracket.losers.length})
        </button>
        <button class="tab-btn" data-tab="finals">
          🏆 Финал
        </button>
      </div>

      <div class="tab-content active" id="winners-bracket">
        ${wbHtml}
      </div>

      <div class="tab-content" id="losers-bracket">
        ${lbHtml}
      </div>

      <div class="tab-content" id="finals">
        ${gfHtml}
      </div>
    </div>
  `;
}

/**
 * Render all matches in a bracket round by round
 */
function renderBracketRound(matches, tournament, bracketType = "WB", isOrganizerMode = false) {
  if (!matches || matches.length === 0) {
    return "<p>Нет матчей</p>";
  }

  const maxRound = Math.max(...matches.map(m => m.round || 0));
  let html = "";

  for (let round = 1; round <= maxRound; round++) {
    const roundMatches = matches.filter(m => m.round === round);
    if (roundMatches.length === 0) continue;

    const roundName = bracketType === "WB"
      ? `Раунд ${round} (${Math.pow(2, Math.ceil(Math.log2(roundMatches.length * 2)))} > ${Math.pow(2, Math.ceil(Math.log2(roundMatches.length)))})`
      : `Раунд ${round}`;

    html += `
      <div class="bracket-round">
        <h4>${roundName}</h4>
        <div class="round-matches">
          ${roundMatches.map(m => renderMatchCard(m, tournament, isOrganizerMode)).join("")}
        </div>
      </div>
    `;
  }

  return html;
}

// ════════════════════════════════════════════════════════════
// EXAMPLE 6: EVENT HANDLERS
// ════════════════════════════════════════════════════════════

/**
 * Handle score submission in organizer mode
 */
function attachScoreHandlers(tournament, container) {
  container.querySelectorAll(".btn-record-score").forEach((btn) => {
    btn.addEventListener("click", function () {
      const matchId = this.dataset.matchId;
      const matchCard = this.closest(".match-card");

      const scoreA = parseInt(
        matchCard.querySelector(".score-a").value || 0
      );
      const scoreB = parseInt(
        matchCard.querySelector(".score-b").value || 0
      );

      if (scoreA === scoreB) {
        alert("⚠️ Ничья невозможна. Укажите победителя.");
        return;
      }

      const winnerId = scoreA > scoreB
        ? tournament.matches[matchId].team_a_id
        : tournament.matches[matchId].team_b_id;

      const result = recordMatchResult(tournament, matchId, winnerId);

      // Update match card
      tournament.matches[matchId].score_a = scoreA;
      tournament.matches[matchId].score_b = scoreB;

      rerenderBracket(tournament);

      // Trigger Supabase update
      if (window.supabase) {
        window.supabase.from("matches").update({
          score_a: scoreA,
          score_b: scoreB,
          winner_id: winnerId,
          status: "completed"
        }).eq("id", matchId);
      }
    });
  });
}

/**
 * Handle tab switching
 */
function attachTabHandlers(container) {
  container.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const tabName = this.dataset.tab;

      // Update button states
      container.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      this.classList.add("active");

      // Update content visibility
      container.querySelectorAll(".tab-content").forEach(tc => tc.classList.remove("active"));
      container.querySelector(`#${tabName}`).classList.add("active");
    });
  });
}

/**
 * Re-render bracket (called after updates)
 */
function rerenderBracket(tournament, container, isOrganizerMode = false) {
  const element = container || document.getElementById("bracket-container");
  if (!element) return;

  element.innerHTML = renderBracketTabs(tournament, isOrganizerMode);

  attachScoreHandlers(tournament, element);
  attachTabHandlers(element);
}

// ════════════════════════════════════════════════════════════
// EXAMPLE 7: MAIN INITIALIZATION
// ════════════════════════════════════════════════════════════

async function initializeDoubleElimTournament(isOrganizerMode = true) {
  // 1. Create and seed tournament
  const tournament = initTournament();
  console.log("Tournament initialized", tournament.getStatus());

  // 2. Save to Supabase
  await saveTournamentToSupabase(tournament);

  // 3. Subscribe to real-time updates
  subscribeToMatchUpdates(tournament, tournament.id);

  // 4. Render bracket in UI
  const container = document.getElementById("bracket-container");
  if (container) {
    rerenderBracket(tournament, container, isOrganizerMode);
  }

  // 5. Log tournament structure
  console.log("Tournament structure:", tournament.toJSON());

  return tournament;
}

// ════════════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════════════

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    initTournament,
    recordMatchResult,
    renderMatchCard,
    renderBracketTabs,
    renderBracketRound,
    attachScoreHandlers,
    attachTabHandlers,
    rerenderBracket,
    initializeDoubleElimTournament,
    exampleTeams
  };
}
