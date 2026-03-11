/**
 * QR Code Manager Module
 * Wraps qrcode.js library for generating and exporting QR codes
 * Supports three-tier access control:
 * - Public QR: Spectator access (read-only bracket view)
 * - Scorer QR: Per-court scoring access
 * - Organizer QR: Admin/organizer access
 */

class QRManager {
  constructor() {
    this.lastQRCanvas = null;
    this.qrInstances = new Map(); // Map<qrType, QRCodeInstance>
  }

  /**
   * Generate QR code for a given URL
   * @param {string} url - URL to encode
   * @param {HTMLElement} container - Container to render QR code into
   * @returns {boolean} Success status
   */
  generateQRCode(url, container) {
    if (!container || !url) {
      console.error('QR Manager: Invalid parameters');
      return false;
    }

    try {
      // Clear container first
      container.innerHTML = '';

      // Create QR code using qrcode.js library
      const qr = new QRCode(container, {
        text: url,
        width: 200,
        height: 200,
        colorDark: '#FFD700',      // Gold
        colorLight: '#0d0d1a',     // Dark background
        correctLevel: QRCode.CorrectLevel.H
      });

      // Store reference to canvas for later download
      this.lastQRCanvas = container.querySelector('canvas');

      return true;
    } catch (error) {
      console.error('Failed to generate QR code:', error);
      container.innerHTML = `<p style="color: red; padding: 20px;">Failed to generate QR code</p>`;
      return false;
    }
  }

  /**
   * Download QR code as PNG file
   * @returns {boolean} Success status
   */
  downloadQRCode() {
    try {
      if (!this.lastQRCanvas) {
        console.warn('No QR code canvas available for download');
        return false;
      }

      // Convert canvas to data URL
      const dataUrl = this.lastQRCanvas.toDataURL('image/png');

      // Create download link
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `tournament-qr-${new Date().toISOString().split('T')[0]}.png`;

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      return true;
    } catch (error) {
      console.error('Failed to download QR code:', error);
      return false;
    }
  }

  /**
   * Get QR code as data URL
   * @returns {string|null} Data URL or null
   */
  getQRCodeDataURL() {
    try {
      if (!this.lastQRCanvas) return null;
      return this.lastQRCanvas.toDataURL('image/png');
    } catch (error) {
      console.error('Failed to get QR code data URL:', error);
      return null;
    }
  }

  /**
   * Check if QRCode library is loaded globally
   * @returns {boolean}
   */
  static isQRCodeLibraryLoaded() {
    return typeof QRCode !== 'undefined';
  }

  /**
   * Generate three-tier access control QR codes
   * @param {string} tournamentId - Tournament ID
   * @param {string} publicQRID - Public QR ID for spectators
   * @param {Array} scorerPINs - Array of scorer PINs per court
   * @param {string} organizerToken - Organizer token
   * @param {HTMLElement} spectatorContainer - Container for spectator QR
   * @param {HTMLElement} scorerContainers - Map of court => container for scorer QRs
   * @param {HTMLElement} organizerContainer - Container for organizer QR
   * @returns {boolean} Success status
   */
  generateMultiTierQRCodes(
    tournamentId,
    publicQRID,
    scorerPINs,
    organizerToken,
    spectatorContainer,
    scorerContainers,
    organizerContainer
  ) {
    try {
      // Generate Spectator QR (Public, read-only)
      if (spectatorContainer) {
        this.generateSpectatorQRCode(tournamentId, publicQRID, spectatorContainer);
      }

      // Generate Scorer QRs (Per-court)
      if (scorerContainers && scorerPINs) {
        scorerPINs.forEach((pin, index) => {
          const courtId = index + 1;
          const container = scorerContainers[`court_${courtId}`];
          if (container) {
            this.generateScorerQRCode(tournamentId, pin, courtId, container);
          }
        });
      }

      // Generate Organizer QR (Sensitive, should be protected)
      if (organizerContainer) {
        this.generateOrganizerQRCode(tournamentId, organizerToken, organizerContainer);
      }

      return true;
    } catch (error) {
      console.error('Failed to generate multi-tier QR codes:', error);
      return false;
    }
  }

  /**
   * Generate Spectator QR Code (Public, read-only access)
   * @param {string} tournamentId - Tournament ID
   * @param {string} publicQRID - Public QR ID
   * @param {HTMLElement} container - Container to render into
   * @returns {boolean} Success status
   */
  generateSpectatorQRCode(tournamentId, publicQRID, container) {
    try {
      if (!container) {
        console.error('QR Manager: Invalid container for spectator QR');
        return false;
      }

      container.innerHTML = '';

      // Encode as JSON for easy parsing
      const qrData = JSON.stringify({
        type: 'spectator',
        tournamentId: tournamentId,
        publicQRID: publicQRID,
        timestamp: Date.now()
      });

      const qr = new QRCode(container, {
        text: qrData,
        width: 200,
        height: 200,
        colorDark: '#FFD700',      // Gold
        colorLight: '#0d0d1a',     // Dark background
        correctLevel: QRCode.CorrectLevel.H
      });

      this.qrInstances.set('spectator', qr);
      this.lastQRCanvas = container.querySelector('canvas');

      return true;
    } catch (error) {
      console.error('Failed to generate spectator QR code:', error);
      container.innerHTML = `<p style="color: red; padding: 20px;">Failed to generate spectator QR</p>`;
      return false;
    }
  }

  /**
   * Generate Scorer QR Code (Per-court, scoring access)
   * @param {string} tournamentId - Tournament ID
   * @param {string} scorerPIN - Scorer PIN for this court
   * @param {number} courtId - Court ID
   * @param {HTMLElement} container - Container to render into
   * @returns {boolean} Success status
   */
  generateScorerQRCode(tournamentId, scorerPIN, courtId, container) {
    try {
      if (!container) {
        console.error('QR Manager: Invalid container for scorer QR');
        return false;
      }

      container.innerHTML = '';

      // Encode scorer access data
      const qrData = JSON.stringify({
        type: 'scorer',
        tournamentId: tournamentId,
        scorerPIN: scorerPIN,
        courtId: courtId,
        timestamp: Date.now()
      });

      const qr = new QRCode(container, {
        text: qrData,
        width: 200,
        height: 200,
        colorDark: '#4DA8DA',       // Blue
        colorLight: '#0d0d1a',      // Dark background
        correctLevel: QRCode.CorrectLevel.H
      });

      this.qrInstances.set(`scorer_court_${courtId}`, qr);

      return true;
    } catch (error) {
      console.error(`Failed to generate scorer QR code for court ${courtId}:`, error);
      container.innerHTML = `<p style="color: red; padding: 20px;">Failed to generate scorer QR</p>`;
      return false;
    }
  }

  /**
   * Generate Organizer QR Code (Sensitive, admin access)
   * WARNING: This should not be displayed publicly or in public places
   * Consider password-protecting or hiding this QR code
   * @param {string} tournamentId - Tournament ID
   * @param {string} organizerToken - Organizer token
   * @param {HTMLElement} container - Container to render into
   * @returns {boolean} Success status
   */
  generateOrganizerQRCode(tournamentId, organizerToken, container) {
    try {
      if (!container) {
        console.error('QR Manager: Invalid container for organizer QR');
        return false;
      }

      container.innerHTML = '';

      // Encode organizer access data
      const qrData = JSON.stringify({
        type: 'organizer',
        tournamentId: tournamentId,
        organizerToken: organizerToken,
        timestamp: Date.now(),
        warning: 'SENSITIVE - Do not share publicly'
      });

      const qr = new QRCode(container, {
        text: qrData,
        width: 200,
        height: 200,
        colorDark: '#e94560',       // Red (warning color)
        colorLight: '#0d0d1a',      // Dark background
        correctLevel: QRCode.CorrectLevel.H
      });

      this.qrInstances.set('organizer', qr);

      // Add warning label
      const warning = document.createElement('p');
      warning.style.color = '#e94560';
      warning.style.fontWeight = 'bold';
      warning.style.marginTop = '10px';
      warning.textContent = '⚠️ SENSITIVE - Do not share publicly';
      container.appendChild(warning);

      return true;
    } catch (error) {
      console.error('Failed to generate organizer QR code:', error);
      container.innerHTML = `<p style="color: red; padding: 20px;">Failed to generate organizer QR</p>`;
      return false;
    }
  }

  /**
   * Download specific tier QR code
   * @param {string} qrType - Type of QR: 'spectator', 'scorer_court_X', 'organizer'
   * @param {string} filename - Optional custom filename
   * @returns {boolean} Success status
   */
  downloadMultiTierQRCode(qrType, filename) {
    try {
      // Get canvas from stored instances if available
      // For now, use lastQRCanvas as fallback
      const canvas = this.lastQRCanvas;

      if (!canvas) {
        console.warn('No QR code canvas available for download');
        return false;
      }

      const dataUrl = canvas.toDataURL('image/png');

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename || `tournament-qr-${qrType}-${new Date().toISOString().split('T')[0]}.png`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      return true;
    } catch (error) {
      console.error('Failed to download QR code:', error);
      return false;
    }
  }
}

// Initialize as singleton
function initQRManager() {
  return new QRManager();
}
