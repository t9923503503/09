# Tournament Bracket Application Architecture

## Overview
Comprehensive tournament bracket tool with double elimination format, True Skill Index seeding, multi-language support, and full persistence.

## Directory Structure

```
/home/user/09/
├── index.html                    # Main entry point
├── doubleElimPlugin.js           # Tournament engine (existing)
│
├── assets/
│   ├── css/
│   │   ├── base.css              # Design tokens, typography, utilities
│   │   ├── header.css            # Header, controls, modals, toasts
│   │   ├── roster.css            # Roster import panel styles
│   │   └── bracket.css           # Bracket display, zoom/pan styles
│   │
│   └── js/
│       ├── core/
│       │   └── event-emitter.js  # Pub/sub event bus
│       │
│       ├── modules/
│       │   ├── localization.js   # i18n with browser detection
│       │   ├── persistence.js    # localStorage management
│       │   ├── roster-manager.js # Team/player parsing & management
│       │   └── bracket-renderer.js # (Future: SVG rendering, zoom/pan)
│       │
│       └── app.js                # Main orchestrator
│
└── locales/
    ├── en.json                   # English translations
    └── ru.json                   # Russian translations
```

## Module Architecture

### 1. **Event Emitter** (`core/event-emitter.js`)
- **Purpose**: Decoupled pub/sub communication
- **Key Methods**:
  - `on(event, callback)` - Subscribe to event
  - `emit(event, data)` - Publish event
  - `off(event, callback)` - Unsubscribe
- **Events Used**:
  - `tournament:created` - New tournament generated
  - `match:updated` - Match result recorded
  - `team:renamed` - Team name changed
  - `language:changed` - Language switched
  - `state:saving` / `state:saved` - Persistence events

### 2. **Localization** (`modules/localization.js`)
- **Purpose**: Multi-language support with browser detection
- **Features**:
  - Auto-detect browser language (ru/en fallback)
  - Persistent language preference in localStorage
  - String interpolation with parameters: `t('key', {param: value})`
- **Methods**:
  - `setLanguage(code)` - Change language
  - `t(key, params)` - Get translated string
  - `getLanguage()` - Get current language
- **Supported Languages**: English (en), Russian (ru)

### 3. **Persistence** (`modules/persistence.js`)
- **Purpose**: localStorage management with auto-save
- **Storage Keys**:
  - `tournament:state` - Full tournament data
  - `roster:teams` - Team roster
  - `app:settings` - User preferences
  - `app:language` - Language preference
  - `app:version` - Schema version (for migrations)
- **Methods**:
  - `save(target)` - Save specific data
  - `debouncedSave(target)` - Debounced save (500ms)
  - `restoreTournament()` - Load tournament state
  - `restoreRoster()` - Load team roster
  - `clearAll()` - Clear all data with confirmation
  - `exportJSON()` / `importJSON()` - Data export/import
- **Features**:
  - Auto-save on tournament changes
  - Survives page refresh
  - Quota detection and fallback
  - Version checking for schema migrations

### 4. **Roster Manager** (`modules/roster-manager.js`)
- **Purpose**: Team/player data management
- **Parsing**:
  - Supports multiple delimiters: newline, tab, comma, semicolon
  - Auto-generates unique IDs and skill levels
  - Validation: min 2 teams, max 256 teams
- **Methods**:
  - `parseNames(text)` - Parse text input
  - `validateCount(count)` - Validate team count
  - `calculateByeCount(count)` - Calculate necessary byes
  - `createTeams(names)` - Generate team objects with auto skills
  - `shuffleTeams(teams)` - Fisher-Yates shuffle
  - `generateRoster(text, shuffle)` - Full pipeline
- **Bracket Info**:
  - Auto-calculates next power of 2
  - Determines bye count needed
  - Validates min/max constraints

### 5. **Main Application** (`app.js`)
- **Purpose**: Orchestrate all modules and handle UI
- **Key Methods**:
  - `init()` - Initialize app with translations and state
  - `setupUI()` - Create header, roster panel, bracket, controls
  - `generateTournament()` - Create bracket from roster
  - `recordMatchResult(matchId, winnerId)` - Update match
  - `autoPlay()` - Auto-generate results based on TSI
  - `exportBracket()` - Generate PNG via html2canvas
  - `render()` / `renderBracket()` - Render tournament display
- **Global State** (`window.appState`):
  ```javascript
  {
    currentTournament: DoubleElimTournament,
    currentRoster: Array,
    appSettings: { language, zoomLevel, theme }
  }
  ```

## Data Flow

```
User Input (Roster Textarea)
    ↓
RosterManager.parseNames()
    ↓
Validation + Bracket Info Calculation
    ↓
User clicks "Generate"
    ↓
RosterManager.generateRoster() → Creates team objects
    ↓
DoubleElimTournament.initializeSeeding() → TSI sorting
    ↓
DoubleElimTournament.generateBracket() → Create matches
    ↓
eventBus.emit('tournament:created')
    ↓
Persistence auto-saves
    ↓
app.render() → Display bracket
```

## Event Flow

```
User Records Match Result
    ↓
app.recordMatchResult()
    ↓
tournament.advanceTeam() → Updates match + team stats
    ↓
eventBus.emit('match:updated')
    ↓
Persistence.debouncedSave('tournament') → Auto-save to localStorage
    ↓
app.render() → Re-render bracket with updated state
```

## UI Components

### Header
- App title and description
- Progress bar (matches completed %)
- Language switcher (EN/РУ dropdown)

### Roster Panel
- Textarea for bulk import
- Shuffle checkbox
- Generate and Clear buttons
- Real-time bracket info display (teams, size, byes)
- Status messages (success/error)

### Bracket Display
- **Winners Bracket**: Matches organized by round
- **Losers Bracket**: Drop-in matches for eliminated teams
- **Grand Final**: WB Winner vs LB Winner
- **Champion Announcement**: Displayed when tournament complete

### Each Match Card
- Match ID (`m_wb_r1_p1` format)
- Team A and B rows with:
  - Seed number in circle
  - Team name (clickable to record win)
  - Win/Loss record
  - True Skill Index (TSI)
  - Winner badge (✓) if completed
- Upset indicator (UPSET! badge in red)
- Bye indicator (for matches with one team)

### Status Bar
- Teams count
- Completed matches / Total
- Progress percentage
- Upset count
- Bye count

### Controls
- Auto Play (generates results based on TSI)
- Reset (clears matches but keeps teams)
- Full Reset (clears everything)
- Export (PNG via html2canvas)

## Localization System

### JSON Structure
```json
{
  "app.title": "Tournament Bracket",
  "roster.input.placeholder": "Paste team names...",
  "bracket.winnersTitle": "⬆️ Winners Bracket",
  // ...
}
```

### Translation with Parameters
```javascript
t('messages.tournamentCreated', {
  teams: 16,
  size: 30
})
// Result: "Tournament created: 16 teams, bracket size: 30"
```

### Language Detection
1. Check localStorage for saved preference
2. Check browser `navigator.language`
3. Default to Russian (ru)

## Persistence System

### Auto-Save Strategy
- **Debounced save on match update** (500ms delay)
- **Immediate save on tournament creation**
- **Manual save on settings change**

### Storage Quota
- Typical browser quota: 5-10 MB
- `getStorageInfo()` returns usage details
- Falls back to session storage if quota exceeded

### State Recovery
On page load:
1. Check `tournament:state` in localStorage
2. Restore `DoubleElimTournament` object
3. Rebuild match index
4. Restore roster from `roster:teams`
5. Restore settings from `app:settings`

## Styling System

### CSS Custom Properties
```css
--gold: #FFD700          /* Primary color */
--red: #e94560           /* Error/Upset indicator */
--green: #6ABF69         /* Success/Winner */
--blue: #4DA8DA          /* Info/Bye */
--dark: #0d0d1a          /* Background */
--text: #e8e8f0          /* Text color */
--muted: #6b6b8a         /* Secondary text */
```

### Responsive Breakpoints
- Desktop: Full bracket view
- Tablet (max 1024px): Two-column layout
- Mobile (max 768px): Single column with horizontal scroll
- Small (max 480px): Reduced font sizes, stacked buttons

### Light Theme
Apply `class="light"` to `<body>` for light theme with automatic CSS variable overrides.

## Browser Compatibility

- **Chrome/Edge**: 90+
- **Firefox**: 88+
- **Safari**: 14+
- **Mobile**: iOS Safari 14+, Android Chrome 90+

**Limitations**:
- localStorage required (no fallback)
- ES6 syntax (no transpilation)
- fetch API required for loading translations

## Performance Optimizations

1. **Debounced Saves**: 500ms delay prevents excessive writes
2. **Event-Driven Updates**: Only affected components re-render
3. **No Framework Overhead**: Pure vanilla JS, minimal bundle
4. **CSS Optimization**: Variable-based theming, minimal media queries
5. **Local Storage**: Avoids network calls for persistence

## Future Enhancements

- [ ] **Zoom & Pan**: Mouse wheel zoom, drag pan for large brackets
- [ ] **SVG Rendering**: Replace DOM for 64+ team brackets
- [ ] **PDF Export**: Full tournament report with seeding details
- [ ] **Team Avatars**: Upload team photos/logos
- [ ] **WebSocket Sync**: Real-time multi-client collaboration
- [ ] **Mobile App**: Electron/Capacitor wrapper
- [ ] **Analytics**: Track upsets, match duration trends
- [ ] **Social Sharing**: Generate bracket images with opengraph

## Testing Strategy

### Unit Tests (Jest/Mocha)
```javascript
// Example: RosterManager
describe('RosterManager', () => {
  it('parses newline-separated names', () => {
    const text = 'Team A\nTeam B\nTeam C';
    const names = roster.parseNames(text);
    expect(names).toEqual(['Team A', 'Team B', 'Team C']);
  });

  it('calculates correct bye count', () => {
    expect(roster.calculateByeCount(3)).toBe(1);  // 3 teams → 4-team bracket
    expect(roster.calculateByeCount(8)).toBe(0);  // 8 teams → 8-team bracket
  });
});
```

### Integration Tests
- Load translations → Initialize app → Generate tournament
- Generate tournament → Record match → Verify state persistence
- Change language → Verify all UI text updates

### E2E Tests (Cypress)
- Paste roster → Generate bracket → Play matches → Export PNG
- Import saved JSON → Verify state matches original

## Deployment

1. **Development**: Serve locally with `python -m http.server`
2. **Production**: Deploy to GitHub Pages or static hosting
3. **No Build Step**: Direct file serving
4. **CDN for html2canvas**: Loaded on-demand from CDN

## Troubleshooting

### App won't load
- Check browser console for JS errors
- Verify all `.js` files are accessible
- Check CORS if loading from different domain

### Translations not loading
- Verify `locales/en.json` and `locales/ru.json` exist
- Check browser Network tab for 404 errors
- Fallback keys will show if translation missing

### localStorage not working
- Check if private/incognito mode (restricts storage)
- Verify storage quota not exceeded
- Try clearing storage: `localStorage.clear()`

### Bracket not displaying
- Ensure tournament was created (check console)
- Verify roster has valid team count
- Check if matches were generated

## Contributing

When adding features:
1. Follow modular architecture (separate concerns)
2. Emit events for cross-module communication
3. Use localization keys for all UI text
4. Add translations to both en.json and ru.json
5. Test on mobile and desktop viewports
6. Update this documentation

---

**Last Updated**: 2026-03-11
**Version**: 1.0
**Author**: Claude Code
