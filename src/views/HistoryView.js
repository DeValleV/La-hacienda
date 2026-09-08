class HistoryView {
  constructor({ salesHistory, products, formatMoney, showToast, onHistoryChanged }) {
    this.salesHistory = salesHistory;
    this.products = products;
    this.formatMoney = formatMoney;
    this.showToast = showToast;
    this.onHistoryChanged = onHistoryChanged;
  }

  render() {
    const tbody = document.getElementById('history-list');
    
    if (this.salesHistory.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted" style="text-align:center;">No hay ventas registradas.</td></tr>';
      return;
    }

    // Renderizamos cada venta y sus productos anidados
    tbody.innerHTML = this.salesHistory.map(sale => `
      <tr>
        <td><strong>#${sale.id}</strong>${sale.status === 'anulada' ? '<br><span class="badge low">Anulada</span>' : ''}</td>
        <td>${this.getSaleTypeLabel(sale.tipoVenta)}</td>
        <td>
          <div style="display: grid; gap: 8px;">
            ${sale.lines.map(line => `
              <div style="display: flex; gap: 10px; align-items: center;">
                <span>${line.productName}</span>
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

  changeSaleType(saleId, newType) {
    const sale = this.salesHistory.find(s => s.id === saleId);
    if (sale && sale.status !== 'anulada') {
      sale.tipoVenta = newType;
      this.showToast(`Venta #${saleId} reclasificada a ${newType}.`);
      this.onHistoryChanged();
    }
  }

  changeQuantity(saleId, productId, newQty) {
    const sale = this.salesHistory.find(s => s.id === saleId);
    if (!sale || sale.status === 'anulada') return;
    const line = sale.lines.find(l => l.productId === productId);
    const product = this.products.find(p => p.id === productId);

    if (newQty < 1) {
      this.removeProduct(saleId, productId);
      return;
    }

    const difference = newQty - line.qty; // Positivo si agregaron, negativo si quitaron
    if (product.stock < difference) {
      this.showToast('Stock insuficiente para aumentar la cantidad.');
      this.render(); // Restablece el valor visual en el input
      return;
    }

    // Ajustar stock y actualizar línea
    product.stock -= difference; 
    line.qty = newQty;
    this.recalculateTotal(sale);
  }

  removeProduct(saleId, productId) {
    const sale = this.salesHistory.find(s => s.id === saleId);
    if (!sale || sale.status === 'anulada') return;
    const lineIndex = sale.lines.findIndex(l => l.productId === productId);
    const product = this.products.find(p => p.id === productId);

    // Restaurar stock
    product.stock += sale.lines[lineIndex].qty;
    
    // Eliminar línea
    sale.lines.splice(lineIndex, 1);

    if (sale.lines.length === 0) {
      this.deleteSale(saleId); // Si se queda sin productos, elimina toda la venta
    } else {
      this.recalculateTotal(sale);
    }
  }

  deleteSale(saleId) {
    const sale = this.salesHistory.find(s => s.id === saleId);
    if (!sale || sale.status === 'anulada') return;

    // Restaurar el stock de todos los productos de esta venta
    sale.lines.forEach(line => {
      const product = this.products.find(p => p.id === line.productId);
      if (product) product.stock += line.qty;
    });

    sale.status = 'anulada';
    this.showToast(`Venta #${saleId} anulada y stock devuelto.`);
    this.onHistoryChanged();
  }

  recalculateTotal(sale) {
    sale.total = sale.lines.reduce((sum, line) => sum + (line.price * line.qty), 0);
    this.showToast('Venta actualizada correctamente.');
    this.onHistoryChanged();
  }
}

window.HistoryView = HistoryView;
