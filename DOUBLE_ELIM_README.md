# Double Elimination Tournament Engine 🏐

**Полная реализация турнирной сетки Double Elimination с True Skill Seeding для пляжного волейбола.**

---

## 📋 Содержание

1. [Архитектура](#архитектура)
2. [JSON Схемы](#json-схемы)
3. [API Функции](#api-функции)
4. [Примеры использования](#примеры-использования)
5. [Supabase Integration](#supabase-integration)
6. [UI Компоненты](#ui-компоненты)
7. [Real-time Updates](#real-time-updates)

---

## Архитектура

### Компоненты системы

```
┌─────────────────────────────────────────┐
│     Double Elimination Tournament        │
├─────────────────────────────────────────┤
│  doubleElimPlugin.js (Логическое ядро)  │
├─────────────────────────────────────────┤
│  ├── DoubleElimTournament (class)       │
│  ├── True Skill Seeding                 │
│  ├── Bracket Generation                 │
│  └── Team Advancement Logic             │
├─────────────────────────────────────────┤
│  doublElimExample.js (Примеры & UI)    │
├─────────────────────────────────────────┤
│  ├── renderMatchCard()                  │
│  ├── renderBracketTabs()                │
│  ├── Supabase Integration               │
│  └── Real-time Subscriptions            │
├─────────────────────────────────────────┤
│  doublElimStyles.css (Стили)            │
├─────────────────────────────────────────┤
│  Database (Supabase)                    │
└─────────────────────────────────────────┘
```

### Поток данных

```
Teams (Input)
    ↓
True Skill Index Calculation (player levels sum)
    ↓
Seeding (Sort by skill)
    ↓
Bye Allocation (if teams < power of 2)
    ↓
Bracket Generation (WB + LB + Finals)
    ↓
Match Object Creation
    ↓
Supabase Storage
    ↓
Real-time UI Updates
```

---

## JSON Схемы

### 1. Tournament Object

```javascript
{
  id: "t_1709926400000",
  name: "Открытый чемпионат 2026",
  format: "DOUBLE_ELIMINATION",
  status: "running",           // seeding | running | completed

  teams: [
    {
      id: "pair_001",
      name: "Иван & Петр",
      players: [
        { id: "p1", name: "Иван", level: 4 },
        { id: "p2", name: "Петр", level: 3 }
      ],
      trueSkillIndex: 7,       // Автоматически рассчитано
      seed: 1,                 // 1 = топ-сид
      bye: false
    },
    // ... другие пары
  ],

  seeding: {
    method: "standard",        // standard | snaking
    byesCount: 2,
    seedOrder: ["pair_001", "pair_006", "pair_002", ...]
  },

  bracket: {
    winners: [Match, Match, ...],      // Winners bracket matches
    losers: [Match, Match, ...],       // Losers bracket matches
    grand_final: Match,                 // Финал: WB Winner vs LB Winner
    super_final: Match | null           // Если LB Winner выигрывает
  },

  matches: {
    "m_wb_r1_p1": Match,
    "m_wb_r1_p2": Match,
    "m_lb_r1_p1": Match,
    // ... быстрый поиск по ID
  },

  createdAt: "2026-03-09T12:00:00Z",
  updatedAt: "2026-03-09T12:30:00Z"
}
```

### 2. Match Object

```javascript
{
  id: "m_wb_r1_p1",                    // Format: m_[bracket]_r[round]_p[pos]
  bracket: "WB",                        // WB | LB | GRAND_FINAL | SUPER_FINAL
  round: 1,                             // 1-indexed
  position: 1,                          // Position in round

  // Teams
  team_a_id: "pair_001",
  team_b_id: "pair_002",

  // Score
  score_a: 25,
  score_b: 23,
  status: "completed",                  // pending | in_progress | completed
  winner_id: "pair_001",

  // Double elimination logic
  isBye: false,                         // True если техническая победа
  nextMatchWinnerId: "m_wb_r2_p1:a",   // Format: matchId:slot (a/b)
  nextMatchLoserId: "m_lb_r1_p1:b",    // куда падает проигравший

  // UI
  upsetAlert: false,                    // Highlight if lower seed wins

  createdAt: "2026-03-09T12:00:00Z",
  updatedAt: "2026-03-09T12:05:00Z"
}
```

### 3. Team/Pair Object

```javascript
{
  id: "pair_001",
  name: "Иван & Петр",
  players: [
    {
      id: "p1",
      name: "Иван",
      level: 4,              // 1-5 scale
      avatar?: "https://..."
    },
    {
      id: "p2",
      name: "Петр",
      level: 3
    }
  ],
  trueSkillIndex: 7,         // Sum of levels (4 + 3)
  seed: 1,                   // Position in seeding
  bye: false                 // First round bye?
}
```

---

## API Функции

### DoubleElimTournament class

#### Constructor

```javascript
const tournament = new DoubleElimTournament({
  id: "t_123",
  name: "Tournament Name",
  seedingMethod: "standard"  // "standard" | "snaking"
});
```

#### initializeSeeding(teams)

Инициализирует сидинг для массива команд.

**Input:**
```javascript
const teams = [
  {
    id: "pair_001",
    name: "Team A",
    players: [
      { id: "p1", name: "Player 1", level: 4 },
      { id: "p2", name: "Player 2", level: 3 }
    ]
  },
  // ...
];

const seedingInfo = tournament.initializeSeeding(teams);
```

**Output:**
```javascript
{
  totalTeams: 6,
  bracketSize: 8,            // Nearest power of 2
  byesCount: 2,              // Teams that get bye
  teams: [
    {
      id: "pair_001",
      trueSkillIndex: 7,
      seed: 1,
      bye: true
    },
    // ...
  ]
}
```

#### generateBracket()

Генерирует полную структуру сетки.

**Output:**
```javascript
{
  winners: [],      // Winners bracket matches
  losers: [],       // Losers bracket matches
  grand_final: {},  // Grand final match
  totalMatches: 15
}
```

**Алгоритм:**
1. Генерирует Winners Bracket (стандартная однопадающая сетка)
2. Генерирует Losers Bracket (куда падают проигравшие)
3. Создаёт Grand Final матч
4. Связывает матчи между собой (path to victory/defeat)

#### advanceTeam(matchId, winnerId)

Записывает результат матча и автоматически переводит команду в следующий матч.

**Input:**
```javascript
const result = tournament.advanceTeam(
  "m_wb_r1_p1",  // Match ID
  "pair_001"     // Winner Team ID
);
```

**Output:**
```javascript
{
  currentMatch: {
    id: "m_wb_r1_p1",
    winner_id: "pair_001",
    score_a: 25,
    score_b: 23,
    status: "completed",
    upsetAlert: false,
    // ...
  },
  winner: { /* Team object */ },
  loser: { /* Team object */ },

  nextMatchWinner: {
    // Match object where winner goes
    id: "m_wb_r2_p1",
    team_a_id: "pair_001",  // ← Updated!
    status: "pending"
  },

  nextMatchLoser: {
    // Match object where loser goes (LB)
    id: "m_lb_r1_p1",
    team_b_id: "pair_002",  // ← Updated!
    status: "pending"
  }
}
```

#### getStatus()

Получить текущий статус турнира.

```javascript
tournament.getStatus();
// {
//   tournamentId: "t_123",
//   status: "running",
//   progress: {
//     completed: 3,
//     total: 15,
//     percentage: 20
//   },
//   teams: 6,
//   bracket: {
//     winners: 7,
//     losers: 6,
//     grand_final: 1
//   }
// }
```

#### toJSON()

Экспортировать турнир для сохранения в БД.

```javascript
const data = tournament.toJSON();
// {
//   id, name, format, status,
//   teams, matches, seeding,
//   createdAt, updatedAt
// }
```

---

## Примеры использования

### Пример 1: Базовая инициализация

```javascript
// 1. Создать турнир
const tournament = new DoubleElimTournament({
  id: "t_beach_2026",
  name: "Чемпионат пляжного волейбола 2026"
});

// 2. Инициализировать сидинг
const seedingInfo = tournament.initializeSeeding(exampleTeams);
console.log(`Топ ${seedingInfo.byesCount} пар получают bye в первом раунде`);

// 3. Сгенерировать сетку
const bracket = tournament.generateBracket();
console.log(`Создано ${bracket.totalMatches} матчей`);

// 4. Сохранить в БД
await saveTournamentToSupabase(tournament);
```

### Пример 2: Запись результата матча

```javascript
// Пользователь вводит счёт
const matchId = "m_wb_r1_p1";
const scoreA = 25;
const scoreB = 23;

// Определить победителя
const winnerId = scoreA > scoreB
  ? tournament.matches[matchId].team_a_id
  : tournament.matches[matchId].team_b_id;

// Продвинуть команду
const result = tournament.advanceTeam(matchId, winnerId);

// Обновить счёт в матче
tournament.matches[matchId].score_a = scoreA;
tournament.matches[matchId].score_b = scoreB;

// Отправить в Supabase
await updateMatchInDatabase(tournament.matches[matchId]);

// Перерисовать UI
rerenderBracket(tournament);
```

### Пример 3: Определение расстроенности (upset)

```javascript
// Если нижний сид выигрывает у топа
const match = tournament.matches["m_wb_r1_p1"];

if (match.upsetAlert) {
  console.log("🔥 РАССТРОЙКА! Команда с низким посевом выиграла!");
  // Подсветить карточку матча красным
  highlightMatch(matchId, "upset");
}
```

### Пример 4: Отслеживание прогресса

```javascript
setInterval(() => {
  const status = tournament.getStatus();

  // Обновить progress bar
  updateProgressBar({
    completed: status.progress.completed,
    total: status.progress.total,
    percentage: status.progress.percentage
  });

  // Проверить если турнир закончился
  if (status.progress.percentage === 100) {
    finalizeTournament(tournament);
  }
}, 5000);
```

---

## Supabase Integration

### Database Schema

```sql
-- Таблица турниров
CREATE TABLE tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  format TEXT DEFAULT 'DOUBLE_ELIMINATION',
  status TEXT DEFAULT 'seeding',  -- seeding | running | completed
  data JSONB,                     -- Full tournament object
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица матчей (для real-time updates)
CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT REFERENCES tournaments(id),
  bracket TEXT,                   -- WB | LB | GRAND_FINAL | SUPER_FINAL
  round INT,
  position INT,

  team_a_id TEXT,
  team_b_id TEXT,

  score_a INT DEFAULT 0,
  score_b INT DEFAULT 0,
  status TEXT DEFAULT 'pending',  -- pending | in_progress | completed
  winner_id TEXT,

  is_bye BOOLEAN DEFAULT FALSE,
  upset_alert BOOLEAN DEFAULT FALSE,

  next_match_winner_id TEXT,
  next_match_loser_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица команд/пар
CREATE TABLE tournament_teams (
  id TEXT PRIMARY KEY,
  tournament_id TEXT REFERENCES tournaments(id),
  name TEXT NOT NULL,
  true_skill_index INT,
  seed INT,
  has_bye BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица игроков
CREATE TABLE tournament_players (
  id TEXT PRIMARY KEY,
  team_id TEXT REFERENCES tournament_teams(id),
  name TEXT NOT NULL,
  level INT CHECK (level >= 1 AND level <= 5),

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Saving Tournament

```javascript
async function saveTournamentToSupabase(tournament) {
  const { data: tournamentData, error: tErr } = await supabase
    .from('tournaments')
    .insert({
      id: tournament.id,
      name: tournament.name,
      format: 'DOUBLE_ELIMINATION',
      status: tournament.status,
      data: tournament.toJSON(),
      created_at: tournament.createdAt
    });

  if (tErr) throw tErr;

  // Save teams
  for (const team of tournament.teams) {
    const { error: teamErr } = await supabase
      .from('tournament_teams')
      .insert({
        id: team.id,
        tournament_id: tournament.id,
        name: team.name,
        true_skill_index: team.trueSkillIndex,
        seed: team.seed,
        has_bye: team.bye
      });

    // Save players in team
    for (const player of team.players) {
      await supabase
        .from('tournament_players')
        .insert({
          id: player.id,
          team_id: team.id,
          name: player.name,
          level: player.level
        });
    }
  }

  // Save matches
  const matches = Object.values(tournament.matches);
  const { error: matchErr } = await supabase
    .from('matches')
    .insert(matches.map(m => ({
      id: m.id,
      tournament_id: tournament.id,
      bracket: m.bracket,
      round: m.round,
      position: m.position,
      team_a_id: m.team_a_id,
      team_b_id: m.team_b_id,
      score_a: m.score_a,
      score_b: m.score_b,
      status: m.status,
      winner_id: m.winner_id,
      is_bye: m.isBye,
      upset_alert: m.upsetAlert,
      next_match_winner_id: m.nextMatchWinnerId,
      next_match_loser_id: m.nextMatchLoserId
    })));

  if (matchErr) throw matchErr;

  return { tournamentData };
}
```

### Real-time Updates

```javascript
function subscribeToTournamentUpdates(tournament, tournamentId) {
  const subscription = supabase
    .from(`matches:tournament_id=eq.${tournamentId}`)
    .on('*', (payload) => {
      const updatedMatch = payload.new;
      const localMatch = tournament.matches[updatedMatch.id];

      if (localMatch && payload.eventType === 'UPDATE') {
        // Update local state
        localMatch.score_a = updatedMatch.score_a;
        localMatch.score_b = updatedMatch.score_b;
        localMatch.status = updatedMatch.status;
        localMatch.winner_id = updatedMatch.winner_id;

        // Advance if completed
        if (updatedMatch.winner_id && !localMatch.winner_id) {
          tournament.advanceTeam(
            updatedMatch.id,
            updatedMatch.winner_id
          );
        }

        // Animate UI
        rerenderBracket(tournament);
      }
    })
    .subscribe();

  return subscription;
}
```

---

## UI Компоненты

### Match Card (Основной компонент)

Отображает один матч с информацией о командах и счётом.

**Props:**
- `match: Match` — объект матча
- `tournament: Tournament` — ссылка на турнир
- `isOrganizerMode: boolean` — показывать ли инпуты для ввода счёта

**Features:**
- 🎯 Отображение посева и силы команды (True Skill Index)
- 📊 Счёт (читаемый или редактируемый)
- 🔥 Upset Alert — подсветка если нижний сид выигрывает
- 👑 Winner Badge — показать победителя

**Usage:**
```javascript
const html = renderMatchCard(match, tournament, true);
container.innerHTML = html;
```

### Bracket Tabs (Сетка)

Отображает всю сетку с табами для каждого раунда.

**Features:**
- 📑 Табы: Верхняя сетка, Нижняя сетка, Финал
- 📱 Адаптивный grid layout
- 🔄 Горизонтальный скролл на мобилах
- ⚡ Анимированный переход между табами

**Usage:**
```javascript
const html = renderBracketTabs(tournament, isOrganizerMode);
document.getElementById('bracket-container').innerHTML = html;

rerenderBracket(tournament, container, isOrganizerMode);
```

### Organizer Mode vs Jumbotron Mode

```javascript
// Organizer Mode: Drag-drop, score input, full controls
const organizerHtml = renderBracketTabs(tournament, isOrganizerMode = true);

// Jumbotron Mode: Read-only, large fonts, projection
const jumbotronHtml = renderBracketTabs(tournament, isOrganizerMode = false);
```

---

## Real-time Updates

### Flow Diagram

```
┌──────────────────┐
│  Organizer Input │
└────────┬─────────┘
         │
         ▼
    ┌────────────────────────────────────┐
    │  Match Card Score Input            │
    │  "Record Score" Button             │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │  advanceTeam(matchId, winnerId)    │
    │  - Updates local match             │
    │  - Advances winner to next match   │
    │  - Loser drops to LB               │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │  Save to Supabase (HTTP)           │
    │  POST /matches/{id}                │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │  Real-time Broadcast               │
    │  supabase.realtime subscription    │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │  All Connected Clients             │
    │  (Organizer, Jumbotron, ...)       │
    │  Receive UPDATE event              │
    └────────┬───────────────────────────┘
             │
             ▼
    ┌────────────────────────────────────┐
    │  rerenderBracket(tournament)       │
    │  - Smooth animation                │
    │  - Update match card               │
    │  - Highlight winner                │
    └────────────────────────────────────┘
```

### Animation Example

```css
/* Match card completion animation */
.match-card.match-completed {
  animation: matchComplete 0.6s ease-out forwards;
}

@keyframes matchComplete {
  0% {
    opacity: 0.8;
    transform: scale(0.98);
  }
  50% {
    opacity: 1;
    transform: scale(1.02);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

/* Upset alert pulse */
.match-card.match-upset {
  animation: upsetPulse 1s ease infinite;
}

@keyframes upsetPulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(255, 107, 107, 0);
  }
}
```

---

## Integration Checklist

- [ ] Include `doubleElimPlugin.js` in main HTML
- [ ] Include `doublElimExample.js` for rendering functions
- [ ] Include `doublElimStyles.css` in stylesheet
- [ ] Create Supabase tables (tournaments, matches, teams, players)
- [ ] Set up Supabase real-time subscriptions
- [ ] Create tournament in seeding mode
- [ ] Initialize with teams and generate bracket
- [ ] Render bracket UI
- [ ] Attach event handlers for score input
- [ ] Subscribe to real-time updates
- [ ] Handle match completion and advancement
- [ ] Display upset alerts
- [ ] Support organizer and jumbotron modes

---

## Performance Tips

1. **Lazy Load Matches**: Don't render all matches at once, use virtualization for large tournaments
2. **Debounce Updates**: Group multiple quick updates before re-rendering
3. **Cache Teams**: Store team objects in memory, don't fetch repeatedly
4. **CSS Containment**: Use `contain: layout` on match cards for better performance
5. **Image Optimization**: Use optimized player avatars (WebP, lazy load)

---

## Browser Support

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Mobile Safari 14+
- ✅ Chrome Mobile 90+

---

## License

MIT - Use freely in your projects

---

## Support

Questions? Check the examples in `doublElimExample.js` or review the schema in `doubleElimPlugin.js`.
