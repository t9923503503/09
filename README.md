# 🏆 Tournament Bracket - Double Elimination Tool

A powerful, fully-featured tournament bracket tool with double elimination format, True Skill Index seeding, multi-language support, and persistent state management.

**Live Demo**: https://t9923503503.github.io/09/

## Features

✨ **Core Features**
- 🎯 **Double Elimination Bracket** - Winners & Losers brackets with automatic advancement
- 🎲 **True Skill Index Seeding** - Intelligent team seeding based on skill levels
- 📋 **Bulk Import** - Paste team names (one per line) to generate tournaments
- 🔀 **Shuffle Option** - Randomize team order before bracket generation
- 📊 **Auto-Bye Calculation** - Automatically adds byes for non-power-of-2 team counts
- 💾 **Full Persistence** - Auto-saves to localStorage, survives page refresh
- 🌍 **Multi-Language** - English & Russian with browser language detection
- 🖼️ **PNG Export** - Download bracket as high-quality image
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile

✅ **Tournament Features**
- Click to record match winners
- Auto-play with intelligent match selection
- Real-time progress tracking
- Upset detection (highlight surprising results)
- Complete standings table
- Live match log

## Quick Start

### 1. Open the App
Visit: https://t9923503503.github.io/09/

### 2. Create a Tournament
1. Paste team names (one per line)
2. Click **"✓ Generate Bracket"**
3. Optionally enable "🔀 Shuffle Players"

### 3. Play Matches
- Click a team name to record a win
- Or click "▶️ Auto Play" for auto-play

### 4. Export Results
Click **"📥 Export"** to download as PNG

## Architecture

The app uses a **modular event-driven architecture**:

```
UI Layer (app.js)
    ↓
Event Bus (event-emitter.js)
    ↓
Modules:
├── Localization (i18n)
├── Persistence (localStorage)
├── Roster Manager (team parsing)
└── Tournament Engine (bracket logic)
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for complete documentation.

## Directory Structure

```
assets/
├── css/                    # Stylesheets
│   ├── base.css           # Design tokens & utilities
│   ├── header.css         # Header & controls
│   ├── roster.css         # Team import panel
│   └── bracket.css        # Bracket display
│
└── js/
    ├── core/              # Core systems
    │   └── event-emitter.js
    │
    ├── modules/           # Feature modules
    │   ├── localization.js
    │   ├── persistence.js
    │   └── roster-manager.js
    │
    └── app.js             # Main orchestrator

locales/
├── en.json               # English translations
└── ru.json               # Russian translations

index.html               # Entry point
ARCHITECTURE.md         # Technical documentation
```

## Development

### Local Setup
```bash
cd /home/user/09
python -m http.server 8000
# Open http://localhost:8000
```

### Making Changes
1. Edit JS/CSS files
2. Reload browser
3. Changes auto-save to localStorage
4. Commit via git

### Translation
Add new strings to:
- `locales/en.json`
- `locales/ru.json`

Use in code:
```javascript
this.i18n.t('key.name', { param: value })
```

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari 14+, Chrome Android)

## Data Privacy

✅ **All processing is local**
- No server uploads
- No tracking
- Uses browser localStorage
- Auto-saves state
- Can export/import data

## Future Roadmap

- [ ] Zoom & Pan for large brackets
- [ ] In-place team name editing
- [ ] CSV import/export
- [ ] PDF reports
- [ ] Team avatars
- [ ] WebSocket sync (multiplayer)
- [ ] Mobile app (Electron/Capacitor)
- [ ] Advanced statistics

## Contributing

See [ARCHITECTURE.md](./ARCHITECTURE.md) for:
- Module documentation
- Event system details
- Code guidelines
- Testing strategy

## License

Open source - MIT License

## Support

🐛 **Bug reports**: Check console errors first
📧 **Questions**: See ARCHITECTURE.md
💡 **Feature requests**: Open an issue

---

**v1.0** | March 2026 | Made with ❤️