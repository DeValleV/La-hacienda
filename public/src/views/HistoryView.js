class HistoryView {
  constructor({ salesHistory, formatMoney }) {
    this.salesHistory = salesHistory;
    this.formatMoney = formatMoney;
  }

  render() {
    const tbody = document.getElementById('history-list');
    
    if (this.salesHistory.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;">No hay ventas registradas.</td></tr>';
      return;
    }

    // Renderizamos cada venta y sus productos anidados
    tbody.innerHTML = this.salesHistory.map(sale => `
      <tr>
        <td><strong>#${sale.id}</strong>${sale.status === 'anulada' ? '<br><span class="badge low">Anulada</span>' : ''}</td>
        <td>#${sale.turnId}</td>
        <td>${escapeHtml(this.formatDate(sale.date))}</td>
        <td>${escapeHtml(sale.userName)}</td>
        <td>${escapeHtml(this.getSaleTypeLabel(sale.tipoVenta))}</td>
        <td>
          <div style="display: grid; gap: 8px;">
            ${sale.lines.map(line => `
              <div style="display: flex; gap: 10px; align-items: center;">
                <span>${escapeHtml(line.productName)}</span>
                <span class="muted">× ${line.qty}</span>
              </div>
            `).join('')}
          </div>
        </td>
        <td><strong>${this.formatMoney(sale.total)}</strong></td>
      </tr>
    `).join('');
  }

  getSaleTypeLabel(type) {
    return { COMEDOR: 'Comedor', FACTURADA: 'Facturada', PERSONAL: 'Personal' }[type] || type;
  }

  formatDate(value) {
    const text = String(value);
    const date = new Date(/[zZ]$|[+-]\d\d:\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('es-MX');
  }
}

window.HistoryView = HistoryView;
