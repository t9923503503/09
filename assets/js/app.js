/**
 * ═══════════════════════════════════════════════════════════════════════
 * MAIN APPLICATION ORCHESTRATOR
 * ═══════════════════════════════════════════════════════════════════════
 */

// Global state
window.appState = {
  currentTournament: null,
  currentRoster: [],
  currentTab: 'roster', // 'roster', 'pairs', 'bracket'
  authenticated: false,  // Password authentication for bracket tab
  pools: [],            // Group stage pools
  appSettings: {
    language: 'ru',
    zoomLevel: 1,
    theme: 'dark'
  }
};

// ═══════════════════════════════════════════════
// APP INITIALIZATION
// ═══════════════════════════════════════════════

class TournamentApp {
  constructor() {
    this.eventBus = eventBus;
    this.roster = null;
    this.pairManager = null;
    this.persistence = null;
    this.i18n = null;
    this.tournament = null;
    this.currentTab = 'roster';      // Active tab: 'roster', 'pairs', 'bracket'
    this.authenticated = false;       // Password authentication
    this.bracketPassword = '2525';    // Protected bracket password
    this.zoomLevel = 1;
    this.panX = 0;
    this.panY = 0;

    this.init();
  }

  /**
   * Initialize the entire application
   */
  async init() {
    console.log('Initializing Tournament App...');

    try {
      // 1. Load translations
      await this.loadTranslations();

      // 2. Initialize localization
      this.i18n = initLocalization(this.eventBus, window.translations);
      document.documentElement.lang = this.i18n.getLanguage();

      // 3. Initialize persistence
      this.persistence = initPersistence(this.eventBus);

      // 4. Setup roster manager
      this.roster = new RosterManager(this.eventBus, this.i18n);

      // 4.5. Setup pair manager for mixed doubles
      this.pairManager = new PairManager(this.eventBus, this.i18n);

      // 4.7. Setup pool manager for group stage
      this.poolManager = new PoolManager(this.eventBus, this.i18n);

      // 4.8. Setup court manager for scheduling
      this.courtManager = new CourtManager(this.eventBus, this.i18n);

      // 4.9. Setup print manager for tournament protocols
      this.printManager = new PrintManager(this.eventBus, this.i18n);

      // 5. Restore saved state
      this.restoreState();

      // 6. Setup UI
      this.setupUI();

      // 7. Setup event listeners
      this.setupEventListeners();

      // 8. Render initial state
      this.render();

      console.log('App initialized successfully');
    } catch (error) {
      console.error('Failed to initialize app:', error);
      this.showError('Failed to initialize application');
    }
  }

  /**
   * Load translation files
   */
  async loadTranslations() {
    try {
      const [enRes, ruRes] = await Promise.all([
        fetch('locales/en.json'),
        fetch('locales/ru.json')
      ]);

      window.translations = {
        en: await enRes.json(),
        ru: await ruRes.json()
      };
    } catch (error) {
      console.error('Failed to load translations:', error);
      window.translations = { en: {}, ru: {} };
    }
  }

  /**
   * Restore state from localStorage
   */
  restoreState() {
    const savedTournament = this.persistence.restoreTournament();
    const savedRoster = this.persistence.restoreRoster();
    const savedSettings = this.persistence.restoreSettings();

    if (savedSettings) {
      window.appState.appSettings = { ...window.appState.appSettings, ...savedSettings };
    }

    if (savedRoster && Array.isArray(savedRoster)) {
      this.roster.teams = savedRoster;
      window.appState.currentRoster = savedRoster;
    }

    if (savedTournament) {
      this.restoreTournamentFromData(savedTournament);
    }
  }

  /**
   * Restore tournament object from saved data
   */
  restoreTournamentFromData(data) {
    try {
      const tournament = new DoubleElimTournament({ id: data.id, name: data.name });
      tournament.teams = data.teams;
      tournament.matches = data.matches;
      tournament.bracket = data.bracket;
      tournament.seeding = data.seeding;
      tournament.status = data.status;
      tournament.createdAt = data.createdAt;
      tournament.updatedAt = data.updatedAt;

      this.tournament = tournament;
      window.appState.currentTournament = tournament;

      this.eventBus.emit('tournament:restored', { tournament });
    } catch (error) {
      console.error('Failed to restore tournament:', error);
    }
  }

  /**
   * Setup UI elements
   */
  setupUI() {
    // Header
    this.setupHeader();

    // Tabs container and navigation
    this.setupTabsNavigation();

    // Tab contents
    this.setupTabsContent();

    // Controls
    this.setupControls();

    // Status bar
    this.setupStatusBar();
  }

  /**
   * Setup header with language switcher
   */
  setupHeader() {
    const headerHTML = `
      <div class="app-header">
        <div class="header-content">
          <div class="header-left">
            <div class="app-branding">
              <div class="app-icon">🏆</div>
              <div>
                <div class="app-title">${this.i18n.t('app.title')}</div>
                <div class="app-version">${this.i18n.t('app.subtitle')}</div>
              </div>
            </div>
          </div>
          <div class="header-center">
            <div class="progress-info">
              <span class="progress-label">${this.i18n.t('stats.progress')}:</span>
              <span class="progress-value">0%</span>
              <div class="progress-visual">
                <div class="progress-bar" style="width: 0%"></div>
              </div>
            </div>
          </div>
          <div class="header-right">
            <button class="header-btn" id="settingsBtn" title="Tournament Settings">
              ⚙️
            </button>
            <div class="language-switcher">
              <button class="language-toggle" id="languageToggle">
                <span class="language-icon">🌍</span>
              </button>
              <div class="language-menu" id="languageMenu">
                <button class="language-option" data-lang="en">
                  <span class="language-option-flag">🇬🇧</span>
                  <span class="language-option-text">English</span>
                  <span class="language-option-check" style="display:none;">✓</span>
                </button>
                <button class="language-option" data-lang="ru">
                  <span class="language-option-flag">🇷🇺</span>
                  <span class="language-option-text">Русский</span>
                  <span class="language-option-check" style="display:none;">✓</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = headerHTML;
    document.body.insertBefore(container.firstElementChild, document.body.firstChild);

    // Setup language switcher
    const toggle = document.getElementById('languageToggle');
    const menu = document.getElementById('languageMenu');
    const options = menu.querySelectorAll('.language-option');

    toggle.addEventListener('click', () => {
      menu.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.language-switcher')) {
        menu.classList.remove('active');
      }
    });

    options.forEach(option => {
      option.addEventListener('click', () => {
        const lang = option.dataset.lang;
        this.changeLanguage(lang);
      });
    });

    // Setup settings button
    const settingsBtn = document.getElementById('settingsBtn');
    settingsBtn.addEventListener('click', () => this.openTournamentSettings());

    this.updateLanguageDisplay();
  }

  /**
   * Open tournament settings modal
   */
  openTournamentSettings() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'settingsModal';
    modal.innerHTML = `
      <div class="modal-content settings-modal">
        <div class="modal-header">
          <h2>⚙️ ${this.i18n.t('settings.title')}</h2>
          <button class="modal-close" id="closeSettingsBtn">✕</button>
        </div>
        <div class="modal-body">
          <div class="settings-group">
            <label class="settings-label">${this.i18n.t('settings.tournament.name')}</label>
            <input type="text" id="tournamentName" class="settings-input" placeholder="Beach Volleyball Tournament">
          </div>

          <div class="settings-group">
            <label class="settings-label">${this.i18n.t('settings.tournament.format')}</label>
            <div class="settings-radio-group">
              <label class="settings-radio">
                <input type="radio" name="format" value="knockout" checked>
                <span>${this.i18n.t('settings.tournament.knockout')}</span>
              </label>
              <label class="settings-radio">
                <input type="radio" name="format" value="groups">
                <span>${this.i18n.t('settings.tournament.groups')}</span>
              </label>
            </div>
          </div>

          <div class="settings-group">
            <label class="settings-label">${this.i18n.t('settings.courts.count')}</label>
            <div class="settings-radio-group">
              ${[1, 2, 3, 4].map(n => `
                <label class="settings-radio">
                  <input type="radio" name="courts" value="${n}" ${n === 1 ? 'checked' : ''}>
                  <span>${n}</span>
                </label>
              `).join('')}
            </div>
          </div>

          <div class="settings-group">
            <label class="settings-label">${this.i18n.t('settings.sets.format')}</label>
            <div class="settings-radio-group">
              <label class="settings-radio">
                <input type="radio" name="setFormat" value="regular" checked>
                <span>${this.i18n.t('settings.sets.regular')}</span>
              </label>
              <label class="settings-radio">
                <input type="radio" name="setFormat" value="pro">
                <span>${this.i18n.t('settings.sets.pro')}</span>
              </label>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancelSettingsBtn">${this.i18n.t('modals.no')}</button>
          <button class="btn btn-primary" id="saveSettingsBtn">${this.i18n.t('modals.yes')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Load current settings
    const tournamentNameInput = document.getElementById('tournamentName');
    const formatRadios = document.querySelectorAll('input[name="format"]');
    const courtsRadios = document.querySelectorAll('input[name="courts"]');
    const setFormatRadios = document.querySelectorAll('input[name="setFormat"]');

    if (window.appState.tournament) {
      tournamentNameInput.value = window.appState.tournament.name || '';
      const format = window.appState.tournament.format || 'knockout';
      formatRadios.forEach(r => r.checked = r.value === format);

      const courts = window.appState.tournament.courts || 1;
      courtsRadios.forEach(r => r.checked = r.value == courts);

      const setFormat = window.appState.tournament.setFormat || 'regular';
      setFormatRadios.forEach(r => r.checked = r.value === setFormat);
    }

    // Setup close handlers
    const closeBtn = document.getElementById('closeSettingsBtn');
    const cancelBtn = document.getElementById('cancelSettingsBtn');
    const saveBtn = document.getElementById('saveSettingsBtn');

    const closeModal = () => modal.remove();

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    saveBtn.addEventListener('click', () => {
      const settings = {
        name: tournamentNameInput.value || 'Beach Volleyball Tournament',
        format: document.querySelector('input[name="format"]:checked').value,
        courts: parseInt(document.querySelector('input[name="courts"]:checked').value),
        setFormat: document.querySelector('input[name="setFormat"]:checked').value
      };

      window.appState.tournament = window.appState.tournament || {};
      Object.assign(window.appState.tournament, settings);

      this.persistence.save('tournament');
      this.showMessage(this.i18n.t('messages.settingsSaved'));
      closeModal();
    });

    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  /**
   * Update language display in switcher
   */
  updateLanguageDisplay() {
    const currentLang = this.i18n.getLanguage();
    const options = document.querySelectorAll('.language-option');

    options.forEach(option => {
      const lang = option.dataset.lang;
      const checkmark = option.querySelector('.language-option-check');
      if (lang === currentLang) {
        checkmark.style.display = 'inline';
        option.classList.add('active');
      } else {
        checkmark.style.display = 'none';
        option.classList.remove('active');
      }
    });
  }

  /**
   * Change application language
   */
  changeLanguage(langCode) {
    this.i18n.setLanguage(langCode);
    window.appState.appSettings.language = langCode;
    document.documentElement.lang = langCode;
    this.persistence.save('settings');

    // Re-render UI
    this.render();
    this.updateLanguageDisplay();

    this.showMessage(this.i18n.t('messages.languageChanged'));
  }

  /**
   * Setup tabs navigation
   */
  setupTabsNavigation() {
    const html = `
      <div class="tabs-container">
        <div class="tabs-nav">
          <button class="tab-btn active" data-tab="roster">
            📋 ${this.i18n.t('tabs.roster')}
          </button>
          <button class="tab-btn" data-tab="pairs">
            👥 ${this.i18n.t('tabs.pairs')}
          </button>
          <button class="tab-btn" data-tab="bracket">
            🏆 ${this.i18n.t('tabs.bracket')}
          </button>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container.firstElementChild);

    // Setup tab button listeners
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        this.switchTab(tabName);
      });
    });

    this.updateTabsDisplay();
  }

  /**
   * Setup tabs content areas
   */
  setupTabsContent() {
    const html = `
      <div id="tabsContent" class="tabs-content">
        <div id="rosterTab" class="tab-content" data-tab="roster" style="display:none;"></div>
        <div id="pairsTab" class="tab-content" data-tab="pairs" style="display:none;"></div>
        <div id="bracketTab" class="tab-content" data-tab="bracket" style="display:none;"></div>
      </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container.firstElementChild);

    // Populate tabs
    this.populateRosterTab();
    this.populatePairsTab();
    this.populateBracketTab();
  }

  /**
   * Populate roster tab with content
   */
  populateRosterTab() {
    const tab = document.getElementById('rosterTab');
    const html = `
      <div class="container" style="margin-top: 20px;">
        <div class="roster-section">
          <div class="roster-header">
            <h2 class="roster-title">${this.i18n.t('roster.title')}</h2>
            <p class="roster-subtitle">${this.i18n.t('roster.subtitle')}</p>
          </div>

          <div class="roster-input-group">
            <label class="roster-label">${this.i18n.t('roster.input.label')}</label>
            <textarea
              id="rosterInput"
              class="roster-textarea"
              placeholder="${this.i18n.t('roster.input.placeholder')}"
            ></textarea>
            <p class="roster-hint">${this.i18n.t('roster.input.hint')}</p>
          </div>

          <div class="roster-options">
            <label class="roster-checkbox">
              <input type="checkbox" id="shuffleToggle">
              <label for="shuffleToggle">${this.i18n.t('roster.shuffle')}</label>
            </label>
          </div>

          <div class="roster-actions">
            <button class="btn btn-primary" id="generateBtn">
              ${this.i18n.t('roster.generate')}
            </button>
            <button class="btn btn-secondary" id="clearRosterBtn">
              ${this.i18n.t('roster.clear')}
            </button>
          </div>

          <div class="roster-status" id="rosterStatus" style="display:none;"></div>

          <div class="bracket-info">
            <div class="bracket-info-item">
              <div class="bracket-info-value" id="teamCount">0</div>
              <div class="bracket-info-label">${this.i18n.t('stats.teams')}</div>
            </div>
            <div class="bracket-info-item">
              <div class="bracket-info-value" id="bracketSize">0</div>
              <div class="bracket-info-label">${this.i18n.t('stats.progress')}</div>
            </div>
            <div class="bracket-info-item">
              <div class="bracket-info-value" id="byeCount">0</div>
              <div class="bracket-info-label">${this.i18n.t('stats.byes')}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    tab.innerHTML = html;

    // Setup event listeners
    const input = document.getElementById('rosterInput');
    const generateBtn = document.getElementById('generateBtn');
    const clearBtn = document.getElementById('clearRosterBtn');

    input.addEventListener('input', (e) => this.onRosterInputChange(e));
    generateBtn.addEventListener('click', () => this.generateTournamentFromRoster());
    clearBtn.addEventListener('click', () => this.clearRoster());

    // Restore previous input
    if (this.roster.teams.length > 0) {
      const names = this.roster.teams.map(t => t.name).join('\n');
      input.value = names;
      this.updateRosterStatus(this.roster.teams.length);
    }
  }

  /**
   * Populate pairs tab with content
   */
  populatePairsTab() {
    const tab = document.getElementById('pairsTab');
    const html = `
      <div class="container" style="margin-top: 20px;">
        <div class="roster-section">
          <div class="roster-header">
            <h2 class="roster-title">${this.i18n.t('pairs.title')}</h2>
            <p class="roster-subtitle">${this.i18n.t('pairs.subtitle')}</p>
          </div>

          <div class="roster-input-group">
            <label class="roster-label">${this.i18n.t('pairs.input.label')}</label>
            <textarea
              id="playersInput"
              class="roster-textarea"
              placeholder="${this.i18n.t('pairs.input.placeholder')}"
            ></textarea>
            <p class="roster-hint">${this.i18n.t('pairs.input.hint')}</p>
          </div>

          <div class="roster-actions">
            <button class="btn btn-primary" id="generatePairsBtn">
              ${this.i18n.t('pairs.generate')}
            </button>
            <button class="btn btn-secondary" id="clearPairsBtn">
              ${this.i18n.t('pairs.clear')}
            </button>
            <button class="btn btn-success" id="generateTournamentFromPairsBtn" style="display:none;">
              🏆 ${this.i18n.t('tabs.bracket')}
            </button>
          </div>

          <div class="pairs-status" id="pairsStatus" style="display:none;"></div>

          <div id="pairsContainer" style="display:none; margin-top: 20px;">
            <h3 style="color: #FFD700; margin-bottom: 15px;">${this.i18n.t('pairs.created')}</h3>
            <div id="pairsList" class="pairs-list"></div>
          </div>
        </div>
      </div>
    `;

    tab.innerHTML = html;

    // Setup event listeners
    const playersInput = document.getElementById('playersInput');
    const generateBtn = document.getElementById('generatePairsBtn');
    const clearBtn = document.getElementById('clearPairsBtn');
    const tournamentBtn = document.getElementById('generateTournamentFromPairsBtn');

    playersInput.addEventListener('input', (e) => this.onPlayersInputChange(e));
    generateBtn.addEventListener('click', () => this.generatePairs());
    clearBtn.addEventListener('click', () => this.clearPairs());
    tournamentBtn.addEventListener('click', () => this.generateTournamentFromPairs());
  }

  /**
   * Populate bracket tab with content
   */
  populateBracketTab() {
    const tab = document.getElementById('bracketTab');

    if (!this.authenticated) {
      // Show password form
      const html = `
        <div class="container" style="margin-top: 20px;">
          <div class="password-modal">
            <div class="password-card">
              <div class="password-header">
                <div class="password-icon">🔐</div>
                <h2>${this.i18n.t('bracket.protected')}</h2>
              </div>
              <p class="password-text">${this.i18n.t('bracket.enterPassword')}</p>
              <input
                type="password"
                id="bracketPassword"
                class="password-input"
                placeholder="Enter password..."
              >
              <div id="passwordError" class="password-error" style="display:none;"></div>
              <button class="btn btn-primary" id="bracketLoginBtn" style="width: 100%; margin-top: 15px;">
                ${this.i18n.t('bracket.unlock')}
              </button>
            </div>
          </div>
        </div>
      `;
      tab.innerHTML = html;

      // Setup password button
      const input = document.getElementById('bracketPassword');
      const btn = document.getElementById('bracketLoginBtn');
      const error = document.getElementById('passwordError');

      const checkPassword = () => {
        const pwd = input.value;
        if (pwd === this.bracketPassword) {
          this.authenticated = true;
          error.style.display = 'none';
          this.populateBracketTab(); // Reload bracket content
        } else {
          error.style.display = 'block';
          error.textContent = this.i18n.t('bracket.wrongPassword');
          input.value = '';
        }
      };

      btn.addEventListener('click', checkPassword);
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') checkPassword();
      });
    } else {
      // Show bracket
      const html = `
        <div class="container" style="margin-top: 20px;">
          <div id="bracketSection"></div>
          <div class="controls-section">
            <button id="logoutBtn" class="btn btn-secondary">🔓 ${this.i18n.t('bracket.logout')}</button>
          </div>
        </div>
      `;
      tab.innerHTML = html;

      // Setup logout
      document.getElementById('logoutBtn').addEventListener('click', () => {
        this.authenticated = false;
        this.populateBracketTab();
      });

      // Setup bracket section
      this.setupBracketSection();
    }
  }

  /**
   * Switch to a different tab
   */
  switchTab(tabName) {
    this.currentTab = tabName;
    window.appState.currentTab = tabName;

    // Check authentication for bracket tab
    if (tabName === 'bracket' && !this.authenticated) {
      this.authenticated = false;
    }

    this.updateTabsDisplay();
  }

  /**
   * Update tabs display (show/hide content and active state)
   */
  updateTabsDisplay() {
    // Update button styles
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const tabName = btn.dataset.tab;
      if (tabName === this.currentTab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Show/hide content
    document.querySelectorAll('.tab-content').forEach(content => {
      const tabName = content.dataset.tab;
      if (tabName === this.currentTab) {
        content.style.display = 'block';
      } else {
        content.style.display = 'none';
      }
    });
  }

  /**
   * Generate tournament from roster
   */
  generateTournamentFromRoster() {
    const input = document.getElementById('rosterInput');
    const shuffle = document.getElementById('shuffleToggle')?.checked || false;
    const text = input.value;

    const result = this.roster.generateRoster(text, shuffle);

    if (result.error) {
      this.showError(result.error);
      return;
    }

    // Create tournament
    this.tournament = new DoubleElimTournament({
      name: `Tournament (${result.teams.length} teams)`
    });

    this.tournament.initializeSeeding(result.teams);
    this.tournament.generateBracket();

    window.appState.currentTournament = this.tournament;
    window.appState.currentRoster = result.teams;

    // Save state
    this.persistence.save('all');

    // Emit event
    this.eventBus.emit('tournament:created', {
      tournament: this.tournament,
      teams: result.teams.length
    });

    this.showMessage(this.i18n.t('messages.tournamentCreated', {
      teams: result.teams.length,
      size: this.tournament.bracket.winners.length + this.tournament.bracket.losers.length + 1
    }));

    // Switch to bracket tab and unlock
    this.authenticated = true;
    this.switchTab('bracket');
    this.render();
  }

  /**
   * Setup roster management panel
   */

  /**
   * Handle players input change for pairs
   */
  onPlayersInputChange(e) {
    const text = e.target.value;
    const players = this.pairManager.parsePlayers(text);
    this.updatePairsStatus(players);
  }

  /**
   * Update pairs status display
   */
  updatePairsStatus(players) {
    const statusEl = document.getElementById('pairsStatus');
    const { males, females } = this.pairManager.countByGender(players);
    const validation = this.pairManager.validatePlayers(players);

    if (players.length === 0) {
      statusEl.style.display = 'none';
      return;
    }

    let statusText = this.i18n.t('pairs.status', {
      total: players.length,
      males: males,
      females: females
    });

    if (!validation.valid) {
      statusEl.textContent = validation.error;
      statusEl.classList.remove('success');
      statusEl.classList.add('error');
    } else {
      statusEl.textContent = statusText;
      statusEl.classList.remove('error');
      statusEl.classList.add('success');
    }

    statusEl.style.display = 'block';
  }

  /**
   * Generate pairs from players input
   */
  generatePairs() {
    const input = document.getElementById('playersInput');
    const text = input.value;

    const players = this.pairManager.parsePlayers(text);
    this.pairManager.players = players;

    const validation = this.pairManager.validatePlayers(players);
    if (!validation.valid) {
      this.showError(validation.error);
      return;
    }

    // Create pairs
    const pairs = this.pairManager.createPairsFromPlayers(players, 'balanced');
    this.pairManager.pairs = pairs;

    // Display pairs
    this.displayPairs(pairs);

    this.showMessage(this.i18n.t('messages.pairsCreated', {
      count: pairs.length
    }));

    window.appState.currentRoster = this.pairManager.getPairsAsTeams();
  }

  /**
   * Generate tournament from pairs
   */
  generateTournamentFromPairs() {
    if (this.pairManager.pairs.length === 0) {
      this.showError('No pairs to create tournament from');
      return;
    }

    // Convert pairs to teams
    const teams = this.pairManager.getPairsAsTeams();

    // Check tournament format
    const format = window.appState.tournament?.format || 'knockout';

    if (format === 'groups') {
      // Pool stage format
      this.setupPoolTournament(teams);
    } else {
      // Direct elimination format
      this.setupKnockoutTournament(teams);
    }

    this.authenticated = true;  // Auto-unlock bracket after creation
    this.switchTab('bracket');
  }

  /**
   * Setup knockout (direct elimination) tournament
   */
  setupKnockoutTournament(teams) {
    // Create tournament
    this.tournament = new DoubleElimTournament({
      name: window.appState.tournament?.name || `Mixed Doubles Tournament (${teams.length} pairs)`
    });

    this.tournament.initializeSeeding(teams);
    this.tournament.generateBracket();

    window.appState.currentTournament = this.tournament;
    window.appState.currentRoster = teams;

    // Save state
    this.persistence.save('all');

    // Emit event
    this.eventBus.emit('tournament:created', {
      tournament: this.tournament,
      teams: teams.length
    });

    this.showMessage(this.i18n.t('messages.tournamentCreated', {
      teams: teams.length,
      size: this.tournament.bracket.winners.length + this.tournament.bracket.losers.length + 1
    }));

    this.render();
  }

  /**
   * Setup pool (group) stage tournament
   */
  setupPoolTournament(teams) {
    // Distribute pairs into pools
    this.poolManager.distributePairs(teams, 4);
    const pools = this.poolManager.getPools();

    // Initialize courts (from settings)
    const courtCount = window.appState.tournament?.courts || 1;
    this.courtManager.initializeCourts(courtCount);

    // Collect all matches from all pools for scheduling
    const allMatches = [];
    pools.forEach(pool => {
      pool.matches.forEach(match => {
        allMatches.push({
          id: match.id,
          pairA: match.pairA,
          pairB: match.pairB,
          poolId: pool.id
        });
      });
    });

    // Auto-schedule matches
    this.courtManager.autoScheduleMatches(allMatches);

    // Store in app state
    window.appState.pools = pools;
    window.appState.schedule = this.courtManager.getSchedule();
    window.appState.currentTournament = {
      name: window.appState.tournament?.name || `Beach Volleyball Tournament (${teams.length} pairs)`,
      format: 'groups',
      pools: pools,
      courts: courtCount
    };
    window.appState.currentRoster = teams;

    // Save state
    this.persistence.save('all');

    // Emit event
    this.eventBus.emit('tournament:created', {
      tournament: window.appState.currentTournament,
      teams: teams.length,
      pools: pools.length,
      courts: courtCount
    });

    this.showMessage(this.i18n.t('pools.messages.distributed', {
      poolCount: pools.length,
      size: 4
    }));

    this.render();
  }

  /**
   * Display pools with standings
   */
  displayPools() {
    const bracketSection = document.getElementById('bracketSection');
    if (!bracketSection || !window.appState.pools) return;

    const pools = window.appState.pools;
    const html = `
      <div class="container" style="margin-top: 20px;">
        <div class="pools-section">
          <h2 class="pools-title">📊 ${this.i18n.t('pools.title')}</h2>
          <div class="pools-status">
            <div class="pools-status-text">
              ${this.i18n.t('pools.messages.distributed', {
                poolCount: pools.length,
                size: 4
              })}
            </div>
          </div>

          <div class="pools-container">
            ${pools.map(pool => this.renderPoolCard(pool)).join('')}
          </div>

          <div class="pools-actions">
            <button id="exportBtn" class="btn btn-secondary">
              ${this.i18n.t('data.export')}
            </button>
            <button id="importBtn" class="btn btn-secondary">
              ${this.i18n.t('data.import')}
            </button>
            <button id="scheduleBtn" class="btn btn-primary">
              📅 ${this.i18n.t('schedule.tabTitle')}
            </button>
            <button id="advancePoolsBtn" class="btn btn-success">
              ${this.i18n.t('pools.advanceButton')}
            </button>
          </div>
        </div>
      </div>
    `;

    bracketSection.innerHTML = html;

    // Setup export button
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportTournamentData());
    }

    // Setup import button
    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
      importBtn.addEventListener('click', () => this.importTournamentData());
    }

    // Setup schedule button
    const scheduleBtn = document.getElementById('scheduleBtn');
    if (scheduleBtn) {
      scheduleBtn.addEventListener('click', () => this.displaySchedule());
    }

    // Setup advance button
    const advanceBtn = document.getElementById('advancePoolsBtn');
    if (advanceBtn) {
      advanceBtn.addEventListener('click', () => this.advancePairsFromPools());
    }

    // Setup match scoring buttons
    bracketSection.querySelectorAll('.pool-matches-list button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const poolId = e.target.dataset.poolId;
        const matchId = e.target.dataset.matchId;
        this.openMatchScoringModal(poolId, matchId);
      });
    });
  }

  /**
   * Render a single pool card with standings
   */
  renderPoolCard(pool) {
    const standings = this.poolManager.calculateStandings(pool.id);

    return `
      <div class="pool-card">
        <div class="pool-header">
          <h3 class="pool-title">${pool.name}</h3>
          <div class="pool-match-count">
            ${this.i18n.t('pools.matchCount', {
              completed: pool.matches.filter(m => m.completed).length,
              total: pool.matches.length
            })}
          </div>
        </div>

        <table class="pool-standings-table">
          <thead>
            <tr>
              <th class="pool-rank">#</th>
              <th class="pool-pair-name">${this.i18n.t('pools.pair')}</th>
              <th class="pool-seed">${this.i18n.t('pools.seed')}</th>
              <th class="pool-stat">${this.i18n.t('pools.wins')}</th>
              <th class="pool-stat">${this.i18n.t('pools.losses')}</th>
              <th class="pool-stat points">${this.i18n.t('pools.points')}</th>
              <th class="pool-stat ratio">${this.i18n.t('pools.setRatio')}</th>
            </tr>
          </thead>
          <tbody>
            ${standings.map((standing, idx) => `
              <tr>
                <td class="pool-rank">${idx + 1}</td>
                <td class="pool-pair-name">${standing.pairName}</td>
                <td class="pool-seed">${standing.seed}</td>
                <td class="pool-stat">${standing.wins}</td>
                <td class="pool-stat">${standing.losses}</td>
                <td class="pool-stat points">${standing.points}</td>
                <td class="pool-stat ratio">${standing.setRatio}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="pool-matches-section">
          <h4 class="pool-matches-title">${this.i18n.t('sets.matches')}</h4>
          <div class="pool-matches-list">
            ${pool.matches.map(match => `
              <div class="pool-match-item ${match.completed ? 'completed' : ''}">
                <div class="match-teams-row">
                  <span class="match-pair">${match.pairA.name}</span>
                  <span class="match-score">
                    ${match.completed ? `${match.setsA.join('/')} - ${match.setsB.join('/')}` : '—'}
                  </span>
                  <span class="match-pair">${match.pairB.name}</span>
                </div>
                <button class="btn btn-sm btn-primary" data-pool-id="${pool.id}" data-match-id="${match.id}">
                  ${match.completed ? '✓ ' : ''}${this.i18n.t('sets.enterScore')}
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Advance top 2 pairs from each pool to playoffs
   */
  advancePairsFromPools() {
    const advancing = this.poolManager.getAdvancingPairs(2);

    if (advancing.length === 0) {
      this.showError('No pairs to advance');
      return;
    }

    // Create playoff tournament
    this.tournament = new DoubleElimTournament({
      name: window.appState.tournament?.name || `Playoffs (${advancing.length} pairs)`
    });

    this.tournament.initializeSeeding(advancing);
    this.tournament.generateBracket();

    window.appState.currentTournament = this.tournament;
    window.appState.playoffTeams = advancing;

    // Save state
    this.persistence.save('all');

    // Emit event
    this.eventBus.emit('playoffs:created', {
      tournament: this.tournament,
      teams: advancing.length
    });

    this.showMessage(this.i18n.t('pools.messages.advanced', {
      count: advancing.length
    }));

    this.render();
  }

  /**
   * Get tournament statistics
   */
  getTournamentStats() {
    const pools = window.appState.pools;
    if (!pools) return null;

    let stats = {
      totalMatches: 0,
      completedMatches: 0,
      totalBalls: 0,
      longestMatch: { score: 0, pairA: '', pairB: '' },
      topPairs: [],
      totalSetsPlayed: 0
    };

    // Collect all pair statistics
    const pairStats = {};

    pools.forEach(pool => {
      pool.matches.forEach(match => {
        stats.totalMatches++;

        if (match.completed) {
          stats.completedMatches++;

          // Calculate match balls
          const ballsA = match.setsA.reduce((a, b) => a + b, 0);
          const ballsB = match.setsB.reduce((a, b) => a + b, 0);
          const totalBalls = ballsA + ballsB;

          stats.totalBalls += totalBalls;
          stats.totalSetsPlayed += match.setsA.length;

          // Find longest match
          if (totalBalls > stats.longestMatch.score) {
            stats.longestMatch = {
              score: totalBalls,
              pairA: match.pairA.name,
              pairB: match.pairB.name,
              sets: `${match.setsA.join('/')} vs ${match.setsB.join('/')}`
            };
          }

          // Track pair wins
          const setsWonA = match.setsA.filter((s, idx) => s > match.setsB[idx]).length;
          const setsWonB = match.setsB.filter((s, idx) => s > match.setsA[idx]).length;

          if (!pairStats[match.pairA.id]) {
            pairStats[match.pairA.id] = { name: match.pairA.name, wins: 0, losses: 0, ballsFor: 0, ballsAgainst: 0 };
          }
          if (!pairStats[match.pairB.id]) {
            pairStats[match.pairB.id] = { name: match.pairB.name, wins: 0, losses: 0, ballsFor: 0, ballsAgainst: 0 };
          }

          if (setsWonA > setsWonB) {
            pairStats[match.pairA.id].wins++;
            pairStats[match.pairB.id].losses++;
          } else {
            pairStats[match.pairB.id].wins++;
            pairStats[match.pairA.id].losses++;
          }

          pairStats[match.pairA.id].ballsFor += ballsA;
          pairStats[match.pairA.id].ballsAgainst += ballsB;
          pairStats[match.pairB.id].ballsFor += ballsB;
          pairStats[match.pairB.id].ballsAgainst += ballsA;
        }
      });
    });

    // Get top 3 pairs by win rate
    stats.topPairs = Object.values(pairStats)
      .filter(p => p.wins > 0)
      .sort((a, b) => {
        const winRateA = a.wins / (a.wins + a.losses);
        const winRateB = b.wins / (b.wins + b.losses);
        return winRateB - winRateA;
      })
      .slice(0, 3)
      .map(p => ({
        ...p,
        winRate: ((p.wins / (p.wins + p.losses)) * 100).toFixed(1)
      }));

    return stats;
  }

  /**
   * Display tournament statistics summary
   */
  displayTournamentStats() {
    const bracketSection = document.getElementById('bracketSection');
    if (!bracketSection) return;

    const stats = this.getTournamentStats();
    if (!stats) {
      this.showError('No tournament data available');
      return;
    }

    const progressPercent = stats.totalMatches > 0
      ? Math.round((stats.completedMatches / stats.totalMatches) * 100)
      : 0;

    const html = `
      <div class="container" style="margin-top: 20px;">
        <div class="stats-section">
          <h2 class="stats-title">📊 ${this.i18n.t('stats.tournamentSummary')}</h2>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">${stats.completedMatches}/${stats.totalMatches}</div>
              <div class="stat-label">${this.i18n.t('stats.matchesCompleted')}</div>
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${progressPercent}%"></div>
              </div>
            </div>

            <div class="stat-card">
              <div class="stat-value">${stats.totalBalls}</div>
              <div class="stat-label">${this.i18n.t('stats.totalBalls')}</div>
            </div>

            <div class="stat-card">
              <div class="stat-value">${stats.totalSetsPlayed}</div>
              <div class="stat-label">${this.i18n.t('stats.setsPlayed')}</div>
            </div>

            <div class="stat-card">
              <div class="stat-value">${stats.longestMatch.score}</div>
              <div class="stat-label">${this.i18n.t('stats.longestMatch')}</div>
              <div class="stat-detail">${stats.longestMatch.pairA} vs ${stats.longestMatch.pairB}</div>
              <div class="stat-detail">${stats.longestMatch.sets || ''}</div>
            </div>
          </div>

          <div class="top-pairs-section">
            <h3 class="top-pairs-title">🏆 ${this.i18n.t('stats.topPairs')}</h3>
            <div class="top-pairs-list">
              ${stats.topPairs.map((pair, idx) => `
                <div class="top-pair-item">
                  <div class="top-pair-rank">#${idx + 1}</div>
                  <div class="top-pair-info">
                    <div class="top-pair-name">${pair.name}</div>
                    <div class="top-pair-record">${pair.wins}W - ${pair.losses}L (${pair.winRate}%)</div>
                  </div>
                  <div class="top-pair-balls">
                    <span class="balls-for">${pair.ballsFor}</span>
                    <span class="balls-sep">|</span>
                    <span class="balls-against">${pair.ballsAgainst}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="stats-actions">
            <button id="backToPoolsFromStatsBtn" class="btn btn-secondary">
              ← ${this.i18n.t('schedule.backToGroups')}
            </button>
          </div>
        </div>
      </div>
    `;

    bracketSection.innerHTML = html;

    // Setup back button
    const backBtn = document.getElementById('backToPoolsFromStatsBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => this.displayPools());
    }
  }

  /**
   * Display schedule by courts and time slots
   */
  displaySchedule() {
    const bracketSection = document.getElementById('bracketSection');
    if (!bracketSection) return;

    const schedule = this.courtManager.getSchedule();
    const courts = this.courtManager.getCourts();

    const html = `
      <div class="container" style="margin-top: 20px;">
        <div class="schedule-section">
          <h2 class="schedule-title">📅 ${this.i18n.t('schedule.title')}</h2>

          <div class="schedule-info">
            <span>${this.i18n.t('schedule.courts')}: ${courts.length}</span>
            <span>|</span>
            <span>${this.i18n.t('schedule.progress')}: ${this.courtManager.getUtilization()}%</span>
          </div>

          <div class="schedule-timeline">
            ${schedule.map(timeSlot => this.renderTimeSlot(timeSlot)).join('')}
          </div>

          <div class="schedule-actions">
            <button id="statsBtn" class="btn btn-primary">
              📊 ${this.i18n.t('stats.label')}
            </button>
            <button id="printProtocolBtn" class="btn btn-primary">
              🖨️ ${this.i18n.t('print.title')}
            </button>
            <button id="backToPoolsBtn" class="btn btn-secondary">
              ← ${this.i18n.t('schedule.backToGroups')}
            </button>
          </div>
        </div>
      </div>
    `;

    bracketSection.innerHTML = html;

    // Setup stats button
    const statsBtn = document.getElementById('statsBtn');
    if (statsBtn) {
      statsBtn.addEventListener('click', () => this.displayTournamentStats());
    }

    // Setup print button
    const printBtn = document.getElementById('printProtocolBtn');
    if (printBtn) {
      printBtn.addEventListener('click', () => this.openPrintDialog());
    }

    // Setup back button
    const backBtn = document.getElementById('backToPoolsBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => this.displayPools());
    }
  }

  /**
   * Render a time slot in the schedule
   */
  renderTimeSlot(timeSlot) {
    return `
      <div class="time-slot">
        <div class="time-slot-header">
          <h3 class="time-label">🕐 ${timeSlot.startTime}</h3>
        </div>
        <div class="time-slot-matches">
          ${timeSlot.matches.map(match => `
            <div class="scheduled-match ${match.completed ? 'completed' : ''}">
              <div class="match-court">Court ${match.courtNumber}</div>
              <div class="match-info">
                <span class="match-team-a">${match.matchData.pairA.name}</span>
                <span class="match-vs">vs</span>
                <span class="match-team-b">${match.matchData.pairB.name}</span>
              </div>
              <div class="match-time">${match.duration} min</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Open print options dialog
   */
  openPrintDialog() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'printModal';

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>🖨️ ${this.i18n.t('print.title')}</h3>
          <button class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <p>${this.i18n.t('print.selectFormat')}</p>
          <div class="print-options">
            <button class="btn btn-primary print-option" data-action="print">
              🖨️ ${this.i18n.t('print.printDirect')}
            </button>
            <button class="btn btn-secondary print-option" data-action="download">
              💾 ${this.i18n.t('print.downloadHTML')}
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Setup close button
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => modal.remove());

    // Setup print options
    const printBtns = modal.querySelectorAll('.print-option');
    printBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.closest('button').dataset.action;
        modal.remove();

        if (action === 'print') {
          this.printPoolProtocol();
        } else if (action === 'download') {
          this.downloadPoolProtocol();
        }
      });
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  /**
   * Print tournament protocol
   */
  printPoolProtocol() {
    const pools = window.appState.pools;
    if (!pools || pools.length === 0) {
      this.showError(this.i18n.t('print.error.noGroups'));
      return;
    }

    const tournamentName = window.appState.tournament?.name || 'Tournament';
    const html = this.printManager.generatePoolProtocol(tournamentName, pools, 3);

    this.printManager.openPrintDialog(html);
    this.showMessage(this.i18n.t('print.messages.opening'));
  }

  /**
   * Download tournament protocol as HTML file
   */
  downloadPoolProtocol() {
    const pools = window.appState.pools;
    if (!pools || pools.length === 0) {
      this.showError(this.i18n.t('print.error.noGroups'));
      return;
    }

    const tournamentName = window.appState.tournament?.name || 'Tournament';
    const html = this.printManager.generatePoolProtocol(tournamentName, pools, 3);
    const filename = `${tournamentName.replace(/\s+/g, '_')}_protocol.html`;

    this.printManager.downloadAsHTML(html, filename);
    this.showMessage(this.i18n.t('print.messages.downloaded'));
  }

  /**
   * Open match scoring modal
   * @param {string} poolId - Pool ID
   * @param {string} matchId - Match ID
   */
  openMatchScoringModal(poolId, matchId) {
    const pool = this.poolManager.getPool(poolId);
    if (!pool) return;

    const match = pool.matches.find(m => m.id === matchId);
    if (!match) return;

    const setFormat = window.appState.tournament?.setFormat || 'regular';
    const maxSets = setFormat === 'pro' ? 3 : 3;  // Best of 3

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = `matchModal_${matchId}`;

    let setsHTML = '';
    for (let i = 0; i < maxSets; i++) {
      setsHTML += `
        <div class="set-input-group">
          <label class="set-label">${this.i18n.t('sets.setLabel', { number: i + 1 })}</label>
          <div class="set-inputs">
            <input type="number" class="set-score" data-set="${i}" data-team="a" min="0" max="25" placeholder="0">
            <span class="set-vs">vs</span>
            <input type="number" class="set-score" data-set="${i}" data-team="b" min="0" max="25" placeholder="0">
          </div>
        </div>
      `;
    }

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>${this.i18n.t('sets.matchTitle')}</h3>
          <button class="modal-close" data-match-id="${matchId}">✕</button>
        </div>
        <div class="modal-body">
          <div class="match-teams">
            <div class="team-name team-a">${match.pairA.name}</div>
            <div class="team-vs">vs</div>
            <div class="team-name team-b">${match.pairB.name}</div>
          </div>
          <div class="sets-form">
            ${setsHTML}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-action="cancel" data-match-id="${matchId}">
            ${this.i18n.t('modals.no')}
          </button>
          <button class="btn btn-success" data-action="save" data-match-id="${matchId}" data-pool-id="${poolId}">
            ${this.i18n.t('sets.save')}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Setup event listeners
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => modal.remove());

    const cancelBtn = modal.querySelector('[data-action="cancel"]');
    cancelBtn.addEventListener('click', () => modal.remove());

    const saveBtn = modal.querySelector('[data-action="save"]');
    saveBtn.addEventListener('click', () => {
      const setsA = [];
      const setsB = [];

      for (let i = 0; i < maxSets; i++) {
        const scoreA = parseInt(
          modal.querySelector(`[data-set="${i}"][data-team="a"]`).value
        ) || 0;
        const scoreB = parseInt(
          modal.querySelector(`[data-set="${i}"][data-team="b"]`).value
        ) || 0;

        if (scoreA > 0 || scoreB > 0) {
          setsA.push(scoreA);
          setsB.push(scoreB);
        }
      }

      if (setsA.length === 0) {
        this.showError(this.i18n.t('sets.error.noScores'));
        return;
      }

      // Record match result
      this.poolManager.recordMatchResult(matchId, setsA, setsB);

      this.showMessage(this.i18n.t('messages.matchRecorded'));
      modal.remove();
      this.displayPools();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  /**
   * Display created pairs
   */
  displayPairs(pairs) {
    const container = document.getElementById('pairsContainer');
    const list = document.getElementById('pairsList');
    const tournamentBtn = document.getElementById('generateTournamentFromPairsBtn');

    if (pairs.length === 0) {
      container.style.display = 'none';
      tournamentBtn.style.display = 'none';
      return;
    }

    list.innerHTML = pairs.map((pair, idx) => `
      <div class="pair-item">
        <div class="pair-number">#${idx + 1}</div>
        <div class="pair-info">
          <div class="pair-name">${pair.name}</div>
          <div class="pair-details">
            ${pair.players.map(p => `<span class="player-gender-${p.gender}">${p.name}</span>`).join(' & ')}
          </div>
        </div>
        <button class="btn-small btn-remove" data-pair-id="${pair.id}">✕</button>
      </div>
    `).join('');

    container.style.display = 'block';
    tournamentBtn.style.display = 'inline-block';

    // Add remove pair listeners
    list.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const pairId = e.target.dataset.pairId;
        this.pairManager.removePair(pairId);
        this.pairManager.pairs = this.pairManager.pairs.filter(p => p.id !== pairId);
        this.displayPairs(this.pairManager.pairs);
      });
    });
  }

  /**
   * Clear pairs
   */
  clearPairs() {
    this.pairManager.clear();
    this.poolManager.clear();
    window.appState.pools = [];
    document.getElementById('playersInput').value = '';
    document.getElementById('pairsStatus').style.display = 'none';
    document.getElementById('pairsContainer').style.display = 'none';
    this.showMessage(this.i18n.t('messages.pairsCleared'));
  }

  /**
   * Handle roster input change
   */
  onRosterInputChange(e) {
    const text = e.target.value;
    const names = this.roster.parseNames(text);
    this.updateRosterStatus(names.length);
  }

  /**
   * Update roster status display
   */
  updateRosterStatus(count) {
    const status = this.roster.getBracketInfo(count);
    const statusEl = document.getElementById('rosterStatus');

    if (status.valid) {
      statusEl.textContent = this.i18n.t('roster.status', {
        count: count,
        size: status.size,
        byes: status.byes
      });
      statusEl.classList.remove('error', 'success');
      statusEl.classList.add('success');
      statusEl.style.display = 'block';
    } else if (count > 0) {
      statusEl.textContent = status.error;
      statusEl.classList.remove('success');
      statusEl.classList.add('error');
      statusEl.style.display = 'block';
    } else {
      statusEl.style.display = 'none';
    }

    document.getElementById('teamCount').textContent = count;
    document.getElementById('bracketSize').textContent = status.size || '—';
    document.getElementById('byeCount').textContent = status.byes || '—';
  }

  /**
   * Generate tournament from roster
   */
  /**
   * Clear roster
   */
  clearRoster() {
    if (!confirm(this.i18n.t('modals.confirmReset'))) return;

    document.getElementById('rosterInput').value = '';
    this.roster.clear();
    this.poolManager.clear();
    this.tournament = null;
    window.appState.currentTournament = null;
    window.appState.currentRoster = [];
    window.appState.pools = [];

    this.persistence.clear('tournament');
    this.updateRosterStatus(0);
    this.render();

    this.showMessage(this.i18n.t('messages.stateSaved'));
  }

  /**
   * Setup bracket display section
   */
  setupBracketSection() {
    // Find or create bracket container in the bracket tab
    let container = document.getElementById('bracketSection');
    if (!container) {
      container = document.getElementById('bracketContainer');
    }
    if (!container) return; // Skip if no container found

    // Check if we have pools to display
    if (window.appState.pools && window.appState.pools.length > 0) {
      this.displayPools();
    } else if (this.tournament) {
      // Display regular bracket
      container.innerHTML = '';
    } else {
      // Show empty state
      container.innerHTML = `
        <div class="bracket-empty">
          <div class="bracket-empty-icon">🏐</div>
          <div class="bracket-empty-text">
            ${this.i18n.t('roster.input.placeholder')}
          </div>
        </div>
      `;
    }
  }

  /**
   * Setup control buttons
   */
  setupControls() {
    const html = `
      <div class="container" style="margin-bottom: var(--spacing-xl);">
        <div class="controls-section">
          <h3 class="controls-title">${this.i18n.t('header.language')}</h3>
          <div class="controls-grid">
            <button class="control-btn primary" id="autoPlayBtn">
              ${this.i18n.t('controls.autoPlay')}
            </button>
            <button class="control-btn secondary" id="resetBtn">
              ${this.i18n.t('controls.reset')}
            </button>
            <button class="control-btn danger" id="resetAllBtn">
              ${this.i18n.t('controls.resetAll')}
            </button>
            <button class="control-btn success" id="exportBtn">
              ${this.i18n.t('controls.export')}
            </button>
          </div>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container.firstElementChild);

    // Setup event listeners
    document.getElementById('autoPlayBtn').addEventListener('click', () => this.autoPlay());
    document.getElementById('resetBtn').addEventListener('click', () => this.resetTournament());
    document.getElementById('resetAllBtn').addEventListener('click', () => this.resetAll());
    document.getElementById('exportBtn').addEventListener('click', () => this.exportBracket());
  }

  /**
   * Setup status bar
   */
  setupStatusBar() {
    const html = `
      <div class="container" style="margin-top: var(--spacing-xl); margin-bottom: var(--spacing-xl);">
        <div class="status-bar" id="statusBar"></div>
      </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container.firstElementChild);
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    this.eventBus.on('match:updated', () => this.render());
    this.eventBus.on('tournament:created', () => this.updateStatusBar());
    this.eventBus.on('language:changed', () => this.updateUITexts());
  }

  /**
   * Render bracket display
   */
  render() {
    if (!this.tournament) {
      this.renderEmpty();
      return;
    }

    this.renderBracket();
    this.updateStatusBar();
  }

  /**
   * Render empty state
   */
  renderEmpty() {
    const container = document.getElementById('bracketContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="bracket-empty">
        <div class="bracket-empty-icon">🎯</div>
        <div class="bracket-empty-text">
          ${this.i18n.t('roster.input.placeholder')}
        </div>
      </div>
    `;
  }

  /**
   * Render tournament bracket
   */
  renderBracket() {
    const container = document.getElementById('bracketContainer');
    if (!container || !this.tournament) return;

    let html = '';

    // Winners Bracket
    const wbRounds = {};
    this.tournament.bracket.winners.forEach(m => {
      if (!wbRounds[m.round]) wbRounds[m.round] = [];
      wbRounds[m.round].push(m);
    });

    html += `<div class="bracket-section">
      <h3 class="bracket-section-title">${this.i18n.t('bracket.winnersTitle')}</h3>
      <div class="bracket-rounds">`;

    Object.keys(wbRounds).sort((a, b) => a - b).forEach(r => {
      html += `<div class="bracket-round">
        <div class="bracket-round-title">${this.i18n.t('bracket.roundLabel', { round: r })}</div>`;
      wbRounds[r].forEach(m => {
        html += this.renderMatch(m);
      });
      html += `</div>`;
    });

    html += `</div></div>`;

    // Losers Bracket
    const lbRounds = {};
    this.tournament.bracket.losers.forEach(m => {
      if (!lbRounds[m.round]) lbRounds[m.round] = [];
      lbRounds[m.round].push(m);
    });

    html += `<div class="bracket-section">
      <h3 class="bracket-section-title">${this.i18n.t('bracket.losersTitle')}</h3>
      <div class="bracket-rounds">`;

    Object.keys(lbRounds).sort((a, b) => a - b).forEach(r => {
      html += `<div class="bracket-round">
        <div class="bracket-round-title">${this.i18n.t('bracket.roundLabel', { round: r })}</div>`;
      lbRounds[r].forEach(m => {
        html += this.renderMatch(m);
      });
      html += `</div>`;
    });

    html += `</div></div>`;

    // Grand Final
    const gf = this.tournament.bracket.grand_final;
    html += `<div class="grand-final-section">
      <h3 class="grand-final-title">🏆 ${this.i18n.t('bracket.grandFinalTitle')}</h3>`;
    html += this.renderMatch(gf);

    if (gf.winner_id) {
      const champ = this.tournament.teams.find(t => t.id === gf.winner_id);
      html += `<div class="champion-announce">
        <div class="champion-text">🥇 ${this.i18n.t('standings.champion')}</div>
        <div class="champion-name">${champ ? champ.name : '?'}</div>
      </div>`;
    }

    html += `</div>`;

    container.innerHTML = html;

    // Attach click handlers
    container.querySelectorAll('.team-row').forEach(row => {
      row.addEventListener('click', (e) => {
        const matchId = row.closest('.match').dataset.matchId;
        const teamId = row.dataset.teamId;
        if (matchId && teamId) {
          this.recordMatchResult(matchId, teamId);
        }
      });
    });
  }

  /**
   * Render single match
   */
  renderMatch(match) {
    const isCompleted = match.status === 'completed';
    const isBye = match.isBye;

    let classList = 'match';
    if (isCompleted) classList += ' completed';
    if (match.upsetAlert) classList += ' upset';
    if (isBye) classList += ' bye';

    let html = `<div class="${classList}" data-match-id="${match.id}">`;

    // Header
    html += `<div class="match-header">
      <span class="match-id">${match.id}</span>
      <div class="match-badges">`;

    if (match.upsetAlert) {
      html += `<span class="badge upset">${this.i18n.t('bracket.upset')}</span>`;
    }
    if (isBye) {
      html += `<span class="badge bye">${this.i18n.t('bracket.bye')}</span>`;
    }

    html += `</div></div>`;

    // Team A
    const teamA = this.tournament.teams.find(t => t.id === match.team_a_id);
    const isWinnerA = match.winner_id === match.team_a_id;
    const teamAClass = 'team-row' + (isWinnerA ? ' winner' : '') + (isBye ? ' bye-team' : '') + (!match.team_a_id ? ' empty' : '');

    html += `<div class="${teamAClass}" data-team-id="${match.team_a_id}">
      <div class="seed-badge ${teamA ? '' : 'empty'}">${teamA && teamA.seed ? teamA.seed : '—'}</div>
      <div class="team-info">
        <div class="team-name">${teamA ? teamA.name : this.i18n.t('bracket.tbd')}</div>
        <div class="team-stats">
          <span class="team-stat"><span class="team-stat-label">W:</span><span class="team-stat-value">${teamA ? teamA.wins : 0}</span></span>
          <span class="team-stat"><span class="team-stat-label">L:</span><span class="team-stat-value">${teamA ? teamA.losses : 0}</span></span>
          <span class="team-tsi">${teamA ? 'TSI: ' + teamA.trueSkillIndex : ''}</span>
        </div>
      </div>
      ${isWinnerA ? '<div class="team-winner-badge">✓</div>' : ''}
    </div>`;

    // Team B
    const teamB = this.tournament.teams.find(t => t.id === match.team_b_id);
    const isWinnerB = match.winner_id === match.team_b_id;
    const teamBClass = 'team-row' + (isWinnerB ? ' winner' : '') + (isBye ? ' bye-team' : '') + (!match.team_b_id ? ' empty' : '');

    html += `<div class="${teamBClass}" data-team-id="${match.team_b_id}">
      <div class="seed-badge ${teamB ? '' : 'empty'}">${teamB && teamB.seed ? teamB.seed : '—'}</div>
      <div class="team-info">
        <div class="team-name">${isBye && !match.team_b_id ? this.i18n.t('bracket.bye') : (teamB ? teamB.name : this.i18n.t('bracket.tbd'))}</div>
        <div class="team-stats">
          <span class="team-stat"><span class="team-stat-label">W:</span><span class="team-stat-value">${teamB ? teamB.wins : 0}</span></span>
          <span class="team-stat"><span class="team-stat-label">L:</span><span class="team-stat-value">${teamB ? teamB.losses : 0}</span></span>
          <span class="team-tsi">${teamB ? 'TSI: ' + teamB.trueSkillIndex : ''}</span>
        </div>
      </div>
      ${isWinnerB ? '<div class="team-winner-badge">✓</div>' : ''}
    </div>`;

    html += `</div>`;
    return html;
  }

  /**
   * Record match result
   */
  recordMatchResult(matchId, winnerId) {
    if (!this.tournament) return;

    const match = this.tournament.matches[matchId];
    if (!match || match.status === 'completed' || match.isBye) return;
    if (!match.team_a_id || !match.team_b_id) return;

    const result = this.tournament.advanceTeam(matchId, winnerId);
    if (result) {
      this.eventBus.emit('match:updated', { match, result });
      this.persistence.debouncedSave('tournament');
    }
  }

  /**
   * Auto-play remaining matches
   */
  autoPlay() {
    if (!this.tournament) return;

    const pending = this.tournament.getPendingMatches();
    if (pending.length === 0) {
      this.showMessage('No pending matches');
      return;
    }

    const match = pending[0];
    const teamA = this.tournament.teams.find(t => t.id === match.team_a_id);
    const teamB = this.tournament.teams.find(t => t.id === match.team_b_id);

    const tsiA = teamA ? teamA.trueSkillIndex : 0;
    const tsiB = teamB ? teamB.trueSkillIndex : 0;
    const total = tsiA + tsiB;
    const rand = Math.random() * total;
    const winnerId = rand < tsiA ? match.team_a_id : match.team_b_id;

    this.recordMatchResult(match.id, winnerId);

    // Continue auto-play
    setTimeout(() => this.autoPlay(), 300);
  }

  /**
   * Reset tournament
   */
  resetTournament() {
    if (!confirm(this.i18n.t('modals.confirmReset'))) return;

    if (this.tournament) {
      this.tournament.teams.forEach(t => {
        t.wins = 0;
        t.losses = 0;
        t.eliminated = false;
      });

      Object.values(this.tournament.matches).forEach(m => {
        m.status = 'pending';
        m.winner_id = null;
      });

      this.persistence.save('tournament');
      this.render();
      this.showMessage(this.i18n.t('messages.stateSaved'));
    }
  }

  /**
   * Reset everything
   */
  resetAll() {
    if (!confirm(this.i18n.t('modals.confirmResetAll'))) return;

    this.tournament = null;
    this.roster.clear();
    window.appState.currentTournament = null;
    window.appState.currentRoster = [];

    this.persistence.clearAll(false);
    document.getElementById('rosterInput').value = '';
    this.updateRosterStatus(0);
    this.render();

    this.showMessage(this.i18n.t('messages.stateSaved'));
  }

  /**
   * Export bracket as PNG
   */
  async exportBracket() {
    const container = document.getElementById('bracketContainer');
    if (!container || !this.tournament) {
      this.showError('No tournament to export');
      return;
    }

    this.showMessage('Exporting bracket...');

    try {
      // Load html2canvas if not already loaded
      if (!window.html2canvas) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const canvas = await html2canvas(container, {
        backgroundColor: '#0d0d1a',
        scale: 2
      });

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `tournament-${this.tournament.id}-${Date.now()}.png`;
      link.click();

      this.showMessage(this.i18n.t('modals.exportSuccess'));
    } catch (error) {
      console.error('Export failed:', error);
      this.showError(this.i18n.t('modals.exportError'));
    }
  }

  /**
   * Update status bar
   */
  updateStatusBar() {
    if (!this.tournament) return;

    const progress = this.tournament.getProgress();
    const upsets = Object.values(this.tournament.matches).filter(m => m.upsetAlert).length;

    const statusBar = document.getElementById('statusBar');
    if (!statusBar) return;

    statusBar.innerHTML = `
      <div class="status-item">
        <div class="status-icon">👥</div>
        <div class="status-value">${this.tournament.teams.length}</div>
        <div class="status-label">${this.i18n.t('stats.teams')}</div>
      </div>
      <div class="status-item">
        <div class="status-icon">🎮</div>
        <div class="status-value">${progress.done}/${progress.total}</div>
        <div class="status-label">${this.i18n.t('stats.completed')}</div>
      </div>
      <div class="status-item">
        <div class="status-icon">📊</div>
        <div class="status-value">${progress.pct}%</div>
        <div class="status-label">${this.i18n.t('stats.progress')}</div>
      </div>
      <div class="status-item">
        <div class="status-icon">🔥</div>
        <div class="status-value">${upsets}</div>
        <div class="status-label">${this.i18n.t('stats.upsets')}</div>
      </div>
      <div class="status-item">
        <div class="status-icon">⏭️</div>
        <div class="status-value">${this.tournament.seeding.byesCount}</div>
        <div class="status-label">${this.i18n.t('stats.byes')}</div>
      </div>
    `;

    // Update header progress bar
    const progressBar = document.querySelector('.progress-bar');
    const progressValue = document.querySelector('.progress-value');
    if (progressBar) {
      progressBar.style.width = progress.pct + '%';
      progressValue.textContent = progress.pct + '%';
    }
  }

  /**
   * Update UI texts (on language change)
   */
  updateUITexts() {
    // This would re-render all text elements
    // For now, we'll reload the page
    location.reload();
  }

  /**
   * Show message toast
   */
  showMessage(text, type = 'info') {
    const container = document.querySelector('.toast-container') || this.createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-icon">
        ${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}
      </div>
      <div class="toast-content">
        <div class="toast-message">${text}</div>
      </div>
      <button class="toast-close">✕</button>
    `;
    container.appendChild(toast);

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    setTimeout(() => toast.remove(), 5000);
  }

  /**
   * Show error message
   */
  showError(text) {
    this.showMessage(text, 'error');
  }

  /**
   * Export tournament data as JSON backup
   */
  exportTournamentData() {
    const tournamentData = {
      timestamp: new Date().toISOString(),
      tournament: window.appState.tournament,
      pools: window.appState.pools,
      roster: window.appState.currentRoster,
      appSettings: window.appState.appSettings
    };

    this.persistence.exportTournamentJSON(tournamentData);
    this.showMessage(this.i18n.t('data.exportSuccess'));
  }

  /**
   * Import tournament data from JSON file
   */
  importTournamentData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const data = await this.persistence.importTournamentJSON(file);

        if (!data.tournament || !data.pools) {
          throw new Error('Invalid tournament backup file');
        }

        // Restore data
        window.appState.tournament = data.tournament;
        window.appState.pools = data.pools;
        window.appState.currentRoster = data.roster || [];
        window.appState.appSettings = data.appSettings || window.appState.appSettings;

        // Reinitialize managers
        this.poolManager.pools = data.pools || [];

        // Save to localStorage
        this.persistence.save('all');

        this.showMessage(this.i18n.t('data.importSuccess'));
        this.render();
      } catch (error) {
        this.showError(`${this.i18n.t('data.importError')}: ${error.message}`);
      }
    });

    input.click();
  }

  /**
   * Create toast container
   */
  createToastContainer() {
    const container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
  }
}

// ═══════════════════════════════════════════════
// START APPLICATION
// ═══════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  window.app = new TournamentApp();
});
