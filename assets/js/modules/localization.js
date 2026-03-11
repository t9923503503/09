/**
 * ═══════════════════════════════════════════════
 * LOCALIZATION MODULE - Multi-language support
 * ═══════════════════════════════════════════════
 */

class LocalizationManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.translations = {};
    this.currentLanguage = this.detectLanguage();
    this.fallbackLanguage = 'en';

    // Storage key
    this.storageKey = 'app:language';
  }

  /**
   * Load translations from JSON files
   * @param {Object} enStrings - English translations
   * @param {Object} ruStrings - Russian translations
   */
  loadTranslations(enStrings, ruStrings) {
    this.translations = {
      en: enStrings || {},
      ru: ruStrings || {}
    };
  }

  /**
   * Detect browser language
   * @returns {string} Language code (en, ru)
   */
  detectLanguage() {
    // Check localStorage first
    const stored = localStorage.getItem(this.storageKey);
    if (stored && ['en', 'ru'].includes(stored)) {
      return stored;
    }

    // Check browser language
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang.startsWith('ru')) {
      return 'ru';
    }
    if (browserLang.startsWith('en')) {
      return 'en';
    }

    // Default to Russian if unclear
    return 'ru';
  }

  /**
   * Get translated string
   * @param {string} key - Translation key (e.g., "app.title")
   * @param {Object} params - Parameters for string interpolation
   * @returns {string} Translated string
   */
  t(key, params = {}) {
    let value = this.translations[this.currentLanguage]?.[key] ||
                this.translations[this.fallbackLanguage]?.[key] ||
                key;

    // Replace parameters
    Object.entries(params).forEach(([param, value]) => {
      value = String(value);
      value = value.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
        '"': '&quot;', "'": '&#39;'
      }[c]));
      const regex = new RegExp(`\\{${param}\\}`, 'g');
      value = value.replace(regex, value);
    });

    return value;
  }

  /**
   * Set current language
   * @param {string} langCode - Language code (en, ru)
   */
  setLanguage(langCode) {
    if (!['en', 'ru'].includes(langCode)) {
      console.warn(`Unknown language: ${langCode}`);
      return;
    }

    if (this.currentLanguage === langCode) return;

    this.currentLanguage = langCode;
    localStorage.setItem(this.storageKey, langCode);

    // Emit event for UI to re-render
    this.eventBus.emit('language:changed', { language: langCode });

    console.log(`Language changed to: ${langCode}`);
  }

  /**
   * Get current language
   * @returns {string} Current language code
   */
  getLanguage() {
    return this.currentLanguage;
  }

  /**
   * Get all available languages
   * @returns {Array} Available language codes
   */
  getAvailableLanguages() {
    return ['en', 'ru'];
  }

  /**
   * Check if a translation key exists
   * @param {string} key - Translation key
   * @returns {boolean}
   */
  hasKey(key) {
    return key in this.translations[this.currentLanguage] ||
           key in this.translations[this.fallbackLanguage];
  }
}

// Global instance
let i18n = null;

/**
 * Initialize localization manager
 * @param {Object} eventBus - Event emitter instance
 * @param {Object} translations - { en: {...}, ru: {...} }
 * @returns {LocalizationManager}
 */
function initLocalization(eventBus, translations) {
  i18n = new LocalizationManager(eventBus);
  if (translations) {
    i18n.loadTranslations(translations.en, translations.ru);
  }
  return i18n;
}

/**
 * Get translation with global instance
 * @param {string} key - Translation key
 * @param {Object} params - Parameters
 * @returns {string}
 */
function t(key, params) {
  if (!i18n) {
    console.warn('Localization not initialized');
    return key;
  }
  return i18n.t(key, params);
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LocalizationManager, initLocalization, t };
}
