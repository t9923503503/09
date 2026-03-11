/**
 * ═══════════════════════════════════════════════════════════════════════
 * PRINT MANAGER - Tournament protocol generation for printing
 * ═══════════════════════════════════════════════════════════════════════
 */

class PrintManager {
  constructor(eventBus, i18n) {
    this.eventBus = eventBus;
    this.i18n = i18n;
  }

  /**
   * Generate printable tournament protocol
   * @param {string} tournamentName - Tournament name
   * @param {Array} pools - Pools with matches
   * @param {number} maxSets - Maximum number of sets (usually 3)
   * @returns {string} HTML content
   */
  generatePoolProtocol(tournamentName, pools, maxSets = 3) {
    let html = this.getPageHeader(tournamentName);

    pools.forEach((pool, poolIdx) => {
      html += this.generatePoolSheets(pool, poolIdx, maxSets);
    });

    return html;
  }

  /**
   * Get page header (first page)
   */
  getPageHeader(tournamentName) {
    return `
      <!DOCTYPE html>
      <html lang="${this.i18n.getLanguage()}">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${this.i18n.t('print.documentTitle')} - ${tournamentName}</title>
        <style>
          ${this.getPageCSS()}
        </style>
      </head>
      <body>
        <div class="cover-page">
          <div class="cover-content">
            <h1 class="tournament-title">${tournamentName}</h1>
            <div class="cover-subtitle">${this.i18n.t('print.protocolHeader')}</div>
            <div class="cover-date">${new Date().toLocaleDateString()}</div>
          </div>
        </div>
    `;
  }

  /**
   * Generate protocol sheets for a pool
   */
  generatePoolSheets(pool, poolIdx, maxSets) {
    let html = '<div class="pool-section">';

    pool.matches.forEach((match, matchIdx) => {
      html += this.generateMatchSheet(pool, match, matchIdx, maxSets);
    });

    html += '</div>';
    return html;
  }

  /**
   * Generate single match sheet (one A4 page)
   */
  generateMatchSheet(pool, match, matchIdx, maxSets) {
    const pairA = match.pairA?.name || 'Team A';
    const pairB = match.pairB?.name || 'Team B';

    let setsHTML = '';
    for (let i = 0; i < maxSets; i++) {
      setsHTML += `
        <tr class="set-row">
          <td class="set-label">${this.i18n.t('print.setLabel', { number: i + 1 })}</td>
          <td class="score-box"></td>
          <td class="vs-label">vs</td>
          <td class="score-box"></td>
          <td class="empty"></td>
        </tr>
      `;
    }

    return `
      <div class="sheet page-break">
        <div class="sheet-header">
          <h2 class="sheet-title">${pool.name}</h2>
          <div class="sheet-match-number">${this.i18n.t('print.matchLabel', { number: matchIdx + 1 })}</div>
        </div>

        <div class="match-section">
          <div class="team-name team-a">${pairA}</div>
          <div class="vs-divider">VS</div>
          <div class="team-name team-b">${pairB}</div>
        </div>

        <table class="scores-table">
          <thead>
            <tr>
              <th>${this.i18n.t('print.set')}</th>
              <th class="score-header">${pairA.substring(0, 15)}</th>
              <th></th>
              <th class="score-header">${pairB.substring(0, 15)}</th>
              <th>${this.i18n.t('print.result')}</th>
            </tr>
          </thead>
          <tbody>
            ${setsHTML}
            <tr class="total-row">
              <td colspan="5" class="total-label">${this.i18n.t('print.matchResult')}</td>
            </tr>
          </tbody>
        </table>

        <div class="signatures-section">
          <div class="signature-block">
            <div class="signature-line"></div>
            <div class="signature-label">${this.i18n.t('print.referee')}</div>
          </div>
          <div class="signature-block">
            <div class="signature-line"></div>
            <div class="signature-label">${this.i18n.t('print.teamA')}</div>
          </div>
          <div class="signature-block">
            <div class="signature-line"></div>
            <div class="signature-label">${this.i18n.t('print.teamB')}</div>
          </div>
        </div>

        <div class="sheet-footer">
          <div class="footer-date">${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
        </div>
      </div>
    `;
  }

  /**
   * CSS for print layout
   */
  getPageCSS() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background: white;
        color: #333;
      }

      .page-break {
        page-break-after: always;
        page-break-inside: avoid;
      }

      .cover-page {
        width: 100%;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        page-break-after: always;
        background: linear-gradient(135deg, #0d0d1a 0%, #1a1a2e 100%);
        color: white;
      }

      .cover-content {
        text-align: center;
      }

      .tournament-title {
        font-size: 48px;
        margin-bottom: 30px;
        font-weight: bold;
      }

      .cover-subtitle {
        font-size: 24px;
        margin-bottom: 40px;
        opacity: 0.8;
      }

      .cover-date {
        font-size: 18px;
        opacity: 0.6;
      }

      .sheet {
        width: 210mm;
        height: 297mm;
        padding: 20mm;
        background: white;
        page-break-after: always;
        page-break-inside: avoid;
      }

      @media screen {
        .sheet {
          width: 100%;
          margin: 20px auto;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
      }

      .sheet-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 2px solid #333;
      }

      .sheet-title {
        font-size: 20px;
        font-weight: bold;
      }

      .sheet-match-number {
        font-size: 14px;
        opacity: 0.7;
      }

      .match-section {
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 30px 0;
        gap: 20px;
      }

      .team-name {
        flex: 1;
        padding: 15px;
        font-size: 16px;
        font-weight: bold;
        text-align: center;
        border: 2px solid #333;
        background: #f5f5f5;
      }

      .vs-divider {
        font-weight: bold;
        font-size: 14px;
      }

      .scores-table {
        width: 100%;
        margin: 30px 0;
        border-collapse: collapse;
      }

      .scores-table th,
      .scores-table td {
        border: 1px solid #333;
        padding: 12px;
        text-align: center;
      }

      .scores-table th {
        background: #f0f0f0;
        font-weight: bold;
      }

      .set-row td {
        height: 40px;
      }

      .set-label {
        text-align: left;
        font-weight: bold;
        width: 80px;
      }

      .score-header {
        width: 100px;
        font-size: 12px;
      }

      .score-box {
        width: 80px;
        border: 2px solid #333;
        background: white;
      }

      .vs-label {
        font-weight: bold;
        width: 40px;
      }

      .empty {
        width: 60px;
      }

      .total-row {
        font-weight: bold;
        background: #f0f0f0;
      }

      .total-label {
        text-align: left;
        padding: 10px !important;
      }

      .signatures-section {
        display: flex;
        justify-content: space-around;
        margin-top: 50px;
      }

      .signature-block {
        flex: 1;
        text-align: center;
      }

      .signature-line {
        border-bottom: 1px solid #333;
        height: 50px;
        margin-bottom: 10px;
      }

      .signature-label {
        font-size: 12px;
        font-weight: bold;
      }

      .sheet-footer {
        position: absolute;
        bottom: 20mm;
        left: 20mm;
        right: 20mm;
        border-top: 1px solid #ccc;
        padding-top: 10px;
        font-size: 10px;
        text-align: center;
        opacity: 0.7;
      }

      @media print {
        body {
          margin: 0;
          padding: 0;
        }
        .sheet {
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 20mm;
          box-shadow: none;
        }
      }
    `;
  }

  /**
   * Open print dialog for generated content
   * @param {string} htmlContent - HTML to print
   */
  openPrintDialog(htmlContent) {
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // Wait for content to load before printing
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }

  /**
   * Download HTML as file
   * @param {string} htmlContent - HTML to download
   * @param {string} filename - File name
   */
  downloadAsHTML(htmlContent, filename = 'tournament-protocol.html') {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PrintManager };
}
