const SHIFT_LOW_STOCK_LIMIT = 10;
const SALE_TYPES = [
  { value: 'COMEDOR', label: 'Comedor' },
  { value: 'FACTURADA', label: 'Facturada' },
  { value: 'PERSONAL', label: 'We' },
];

/** Gestiona las métricas y la auditoría del cierre de turno por tipo de venta. */
class ShiftSummaryView {
  constructor({ products, salesHistory, formatMoney, showToast }) {
    this.products = products;
    this.salesHistory = salesHistory;
    this.formatMoney = formatMoney;
    this.showToast = showToast;
    document.getElementById('close-shift').onclick = () => {
      this.showToast('Turno finalizado. El reporte está listo para exportar.');
    };
  }

  getSalesByType() {
    return SALE_TYPES.map((type) => {
      const sales = this.salesHistory.filter((sale) => sale.tipoVenta === type.value);
      const products = new Map();

      sales.forEach((sale) => {
        sale.lines.forEach((line) => {
          const current = products.get(line.productId) || { ...line, qty: 0 };
          current.qty += line.qty;
          products.set(line.productId, current);
        });
      });

      return {
        ...type,
        total: sales.reduce((sum, sale) => sum + sale.total, 0),
        portions: [...products.values()].reduce((sum, line) => sum + line.qty, 0),
        products: [...products.values()],
      };
    });
  }

  render() {
    const salesByType = this.getSalesByType();
    const totalSales = salesByType.reduce((sum, type) => sum + type.total, 0);
    const totalPortions = salesByType.reduce((sum, type) => sum + type.portions, 0);
    const lowStockCount = this.products.filter(
      (product) => product.stock <= SHIFT_LOW_STOCK_LIMIT,
    ).length;

    document.getElementById('summary-sales').textContent = this.formatMoney(totalSales);
    document.getElementById('summary-comedor').textContent = this.formatMoney(
      salesByType.find((type) => type.value === 'COMEDOR').total,
    );
    document.getElementById('summary-facturada').textContent = this.formatMoney(
      salesByType.find((type) => type.value === 'FACTURADA').total,
    );
    document.getElementById('summary-personal').textContent = this.formatMoney(
      salesByType.find((type) => type.value === 'PERSONAL').total,
    );
    document.getElementById('summary-portions').textContent = totalPortions;
    document.getElementById('summary-stock').textContent = `${lowStockCount} alerta${lowStockCount === 1 ? '' : 's'}`;

    document.getElementById('sales-report').innerHTML = this.renderSalesReport(salesByType);
  }

  renderSalesReport(salesByType) {
    const hasSales = salesByType.some((type) => type.products.length);
    if (!hasSales) return '<p class="muted">Las ventas cobradas aparecerán aquí.</p>';

    return salesByType.map((type) => `
      <section class="sales-type-group">
        <header class="sales-type-heading">
          <strong>${type.label}</strong>
          <span>${this.formatMoney(type.total)}</span>
        </header>
        ${type.products.length ? this.renderProductRows(type.products) : '<p class="muted">Sin ventas registradas.</p>'}
      </section>`).join('');
  }

  renderProductRows(products) {
    const maxQuantity = Math.max(...products.map((product) => product.qty), 1);
    return products.map((product) => `
      <div class="report-row">
        <div>
          <strong>${product.productName}</strong>
          <div class="bar"><span style="width:${(product.qty / maxQuantity) * 100}%"></span></div>
        </div>
        <span>${product.qty} porciones</span>
        <strong>${this.formatMoney(product.price * product.qty)}</strong>
      </div>`).join('');
  }
}

// Se expone la clase para que app.js pueda crear la ventana de cierre de turno.
window.ShiftSummaryView = ShiftSummaryView;
