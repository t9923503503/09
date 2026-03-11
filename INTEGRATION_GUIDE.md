# 🚀 Double Elimination - Quick Start Integration

**Пошаговый гайд для интеграции Tournament Engine в существующий проект**

---

## 📦 Что вы получаете

```
doubleElimPlugin.js          ← Core engine (3000 lines)
doublElimExample.js           ← Usage & rendering (500 lines)
doublElimStyles.css           ← UI styles (700 lines)
DOUBLE_ELIM_README.md         ← Full documentation
supabase-migrations.sql       ← Database setup
INTEGRATION_GUIDE.md          ← This file
```

---

## ⚙️ Step 1: Setup Database

### 1.1 Supabase Console

1. Open [Supabase Dashboard](https://app.supabase.com)
2. Go to SQL Editor
3. Create new query
4. Copy-paste content from `supabase-migrations.sql`
5. Click "Run"

✅ Tables created:
- `tournaments`
- `tournament_teams`
- `tournament_players`
- `matches`
- `tournament_history`

### 1.2 Verify Tables

```sql
-- Check in Supabase Console
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('tournaments', 'matches', 'tournament_teams', 'tournament_players');
```

Expected output:
```
 tournament_teams
 tournament_players
 tournaments
 matches
```

---

## 📥 Step 2: Include JavaScript Files

### 2.1 In your `index.html`

Add these script tags **before closing `</body>`**:

```html
<!-- Double Elimination Tournament Engine -->
<script src="/doubleElimPlugin.js"></script>
<script src="/doublElimExample.js"></script>

<!-- Include styles in <head> -->
<link rel="stylesheet" href="/doublElimStyles.css">
```

### 2.2 Verify Inclusion

Open browser console and check:

```javascript
typeof DoubleElimTournament        // → "function" ✓
typeof initTournament               // → "function" ✓
```

---

## 🎯 Step 3: Basic Initialization

### 3.1 Create HTML Container

In your page where you want to display bracket:

```html
<div id="bracket-container"></div>
```

### 3.2 JavaScript Code

```javascript
// 1. Create tournament instance
const tournament = new DoubleElimTournament({
  id: `t_${Date.now()}`,
  name: "My Tournament"
});

// 2. Define teams (Example from doublElimExample.js)
const teams = [
  {
    id: "pair_001",
    name: "Team A",
    players: [
      { id: "p1", name: "Player 1", level: 4 },
      { id: "p2", name: "Player 2", level: 3 }
    ]
  },
  // ... more teams
];

// 3. Initialize seeding
tournament.initializeSeeding(teams);

// 4. Generate bracket
tournament.generateBracket();

// 5. Render in UI
const container = document.getElementById('bracket-container');
rerenderBracket(tournament, container, true); // true = organizer mode
```

Result: **Fully functional bracket in DOM** ✅

---

## 💾 Step 4: Supabase Integration

### 4.1 Save Tournament

```javascript
async function saveTournament() {
  try {
    const result = await saveTournamentToSupabase(tournament);
    console.log("✅ Tournament saved:", result);
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// Call when user clicks "Start Tournament"
document.getElementById('btn-start').addEventListener('click', saveTournament);
```

### 4.2 Load Tournament

```javascript
async function loadTournament(tournamentId) {
  const { data, error } = await supabase
    .from('tournaments')
    .select('data')
    .eq('id', tournamentId)
    .single();

  if (error) throw error;

  // Reconstruct tournament object
  const tournamentData = data.data;
  const tournament = new DoubleElimTournament();
  Object.assign(tournament, tournamentData);

  return tournament;
}
```

---

## 📡 Step 5: Real-time Updates

### 5.1 Subscribe to Match Updates

```javascript
async function setupTournament(tournamentId, isOrganizer = true) {
  // Load tournament
  const tournament = await loadTournament(tournamentId);

  // Subscribe to real-time updates
  subscribeToMatchUpdates(tournament, tournamentId);

  // Render
  const container = document.getElementById('bracket-container');
  rerenderBracket(tournament, container, isOrganizer);

  return tournament;
}
```

### 5.2 What Happens Automatically

- User 1 (Organizer) records score in match → Supabase UPDATE
- ↓
- Supabase broadcasts UPDATE via realtime
- ↓
- User 2 (Viewer) receives update → Local tournament state updates
- ↓
- Bracket re-renders with animation
- ↓
- All users see same bracket in real-time! 🔄

---

## 🎨 Step 6: Customize UI

### 6.1 Light Theme Support

If your app has light mode:

```javascript
document.body.classList.toggle('light');
// Styles auto-adjust (see doublElimStyles.css)
```

### 6.2 Custom Colors

Edit `:root` in `doublElimStyles.css`:

```css
:root {
  --bracket-primary: #FFD700;      /* Gold */
  --bracket-secondary: #FFA500;    /* Orange */
  --bracket-upset: #FF6B6B;        /* Red for upsets */
  /* ... customize more */
}
```

### 6.3 Mobile Optimization

Already included! But you can adjust breakpoints:

```css
/* Tablet and up */
@media (min-width: 768px) {
  .match-card {
    /* Your custom styles */
  }
}
```

---

## 🎮 Step 7: Organizer Controls

### 7.1 Score Input

Once bracket renders, users can:

1. Click `Score Input` field
2. Enter score (e.g., "25")
3. Click `✓` button
4. Match auto-advances to next round

### 7.2 Custom Event Handler

```javascript
// Attach your own handlers
const container = document.getElementById('bracket-container');

container.addEventListener('click', function(e) {
  if (e.target.classList.contains('btn-record-score')) {
    const matchId = e.target.dataset.matchId;
    const match = tournament.matches[matchId];

    console.log(`Score recorded for ${match.id}`);
    // Do something custom...
  }
});
```

---

## 🔍 Step 8: Monitoring & Debug

### 8.1 Check Tournament Status

```javascript
console.log(tournament.getStatus());

// Output:
// {
//   tournamentId: "t_...",
//   status: "running",
//   progress: { completed: 5, total: 15, percentage: 33 },
//   teams: 6,
//   bracket: { winners: 7, losers: 6, grand_final: 1 }
// }
```

### 8.2 View Match Details

```javascript
const match = tournament.matches['m_wb_r1_p1'];
console.log({
  id: match.id,
  bracket: match.bracket,
  teams: [match.team_a_id, match.team_b_id],
  score: `${match.score_a}-${match.score_b}`,
  winner: match.winner_id,
  upset: match.upsetAlert
});
```

### 8.3 Export Tournament

```javascript
const json = tournament.toJSON();
console.log(JSON.stringify(json, null, 2));

// Good for backup/reporting
const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
// ... download or send to server
```

---

## 🐛 Troubleshooting

### Problem: "DoubleElimTournament is not defined"

**Solution:** Make sure `doubleElimPlugin.js` is loaded before you use it.

```html
<!-- ✓ Correct order -->
<script src="/doubleElimPlugin.js"></script>
<script src="/doublElimExample.js"></script>
<script src="/my-app.js"></script> <!-- Uses tournament -->
```

### Problem: Bracket doesn't display

**Solution:** Check:

1. Does `#bracket-container` exist in DOM?
2. Is CSS file included? (`doublElimStyles.css`)
3. Is `rerenderBracket()` called?

```javascript
const container = document.getElementById('bracket-container');
if (!container) {
  console.error('❌ Container not found!');
  return;
}

if (tournament.status !== 'running') {
  console.error('❌ Tournament not initialized!');
  return;
}

rerenderBracket(tournament, container, true);
```

### Problem: Real-time updates not working

**Solution:** Check Supabase connection:

```javascript
// In browser console
await supabase.from('matches').select('*').limit(1);
// If this works, realtime should work too

// Enable debug logging
const subscription = supabase
  .from('matches')
  .on('*', payload => console.log('UPDATE:', payload))
  .subscribe();
```

### Problem: Upset alerts not showing

**Solution:** Check `match.upsetAlert` value:

```javascript
const match = tournament.matches['m_wb_r1_p1'];
console.log('Upset?', match.upsetAlert);
console.log('Team A seed:', tournament.teams[match.team_a_id].seed);
console.log('Team B seed:', tournament.teams[match.team_b_id].seed);
```

Upset = lower seed number wins (e.g., #5 beats #2).

---

## 🚀 Advanced Features

### A. Multi-Tournament Dashboard

```javascript
// Load multiple tournaments
const tournaments = await supabase
  .from('tournaments')
  .select('*')
  .eq('status', 'running');

tournaments.data.forEach(t => {
  const tournament = loadTournament(t.id);
  renderMiniTournament(tournament); // Custom component
});
```

### B. Export to PDF

```javascript
// Use html2pdf library
import html2pdf from 'html2pdf.js';

function exportBracketPDF(tournament) {
  const html = renderBracketTabs(tournament, false);
  const element = document.createElement('div');
  element.innerHTML = html;

  html2pdf({
    margin: 10,
    filename: `${tournament.name}.pdf`,
    image: { type: 'png', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4' }
  }).save();
}
```

### C. Bracket Statistics

```javascript
function getUpsets(tournament) {
  return Object.values(tournament.matches)
    .filter(m => m.upsetAlert && m.status === 'completed')
    .map(m => ({
      match: m.id,
      lowerSeed: m.winner_id,
      upperSeed: m.loser_id,
      score: `${m.score_a}-${m.score_b}`
    }));
}

function getFinalists(tournament) {
  const gf = tournament.bracket.grand_final;
  return {
    wbWinner: gf.team_a_id,
    lbWinner: gf.team_b_id
  };
}
```

### D. Drag-and-Drop Seeding

```javascript
// Before generateBracket(), allow reordering

// In organizer interface:
function enableSeedingDragDrop() {
  const teams = document.querySelectorAll('.seed-team');

  teams.forEach(team => {
    team.draggable = true;
    team.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('teamId', team.dataset.teamId);
    });
  });

  const seeding = document.querySelector('.seeding-list');
  seeding.addEventListener('dragover', (e) => e.preventDefault());
  seeding.addEventListener('drop', (e) => {
    e.preventDefault();
    const teamId = e.dataTransfer.getData('teamId');
    // Reorder tournament.seeding.seedOrder
    // Then regenerate bracket
  });
}
```

---

## 📊 Performance Notes

- **Small tournaments (4-8 teams)**: Instant rendering
- **Medium tournaments (16-32 teams)**: <200ms render
- **Large tournaments (64+ teams)**: Consider virtualization

For large brackets, render only visible matches:

```javascript
function virtualizeMatches(tournament, viewport) {
  const visible = Object.values(tournament.matches)
    .filter(m => isInViewport(m, viewport));

  return renderMatches(visible, tournament);
}
```

---

## ✅ Integration Checklist

- [ ] Database tables created in Supabase
- [ ] JavaScript files included in HTML
- [ ] Styles file linked in `<head>`
- [ ] HTML container `#bracket-container` exists
- [ ] Supabase client initialized (`window.supabase`)
- [ ] Sample tournament created
- [ ] Bracket renders without errors
- [ ] Score input works
- [ ] Real-time updates working
- [ ] Organizer mode displays correctly
- [ ] Mobile responsive (test on device)
- [ ] Light theme works (if applicable)
- [ ] Error handling in place

---

## 🎓 Learning Resources

1. **API Reference** → `DOUBLE_ELIM_README.md`
2. **Examples** → `doublElimExample.js`
3. **Database** → `supabase-migrations.sql`
4. **Styles** → `doublElimStyles.css`

---

## 🤝 Next Steps

1. ✅ Complete this checklist
2. 🧪 Test with sample tournament
3. 📈 Customize styling to match your brand
4. 🔐 Add user authentication/authorization
5. 📱 Test on mobile devices
6. 🚀 Deploy to production!

---

## 📞 Support

Questions? Issues? Check:

1. Browser console for errors
2. Supabase logs for DB issues
3. Network tab for API calls
4. Code examples in `doublElimExample.js`

Good luck! 🏐🎯
