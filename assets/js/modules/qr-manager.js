/**
 * QR Code Manager Module
 * Wraps qrcode.js library for generating and exporting QR codes
 */

class QRManager {
  constructor() {
    this.lastQRCanvas = null;
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
}

// Initialize as singleton
function initQRManager() {
  return new QRManager();
}
