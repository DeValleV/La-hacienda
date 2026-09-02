// Datos iniciales de la aplicación. En producción vendrían de una API.
const products = [
  { id: 1, name: 'Menú del Día', sku: '10010', category: 'Alimentos', brand: 'La Hacienda', unit: 'pieza', status: 'activo', price: 5.5, stock: 64, minStock: 10, color: '#ff6600' },
  { id: 2, name: 'Bebida Cola 500ml', sku: '20054', category: 'Bebidas', brand: 'Cola', unit: 'botella', status: 'activo', price: 1.2, stock: 8, minStock: 10, color: '#1599a8' },
  { id: 3, name: 'Postre Gelatina', sku: '30122', category: 'Postres', brand: 'La Hacienda', unit: 'pieza', status: 'activo', price: 0.8, stock: 31, minStock: 10, color: '#d97706' },
  { id: 4, name: 'Café Americano', sku: '40010', category: 'Bebidas', brand: 'La Hacienda', unit: 'vaso', status: 'activo', price: 1, stock: 42, minStock: 10, color: '#795548' },
];

// Cada cobro se conserva como una venta independiente para poder auditarla por tipo.
const salesHistory = [];
const formatMoney = (amount) => new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  currencyDisplay: 'code',
}).format(amount);

/** Coordina el estado compartido y la navegación entre las tres ventanas. */
class PointOfSaleApp {
  constructor() {
    this.inventory = new InventoryView({
      products,
      formatMoney,
      showToast: this.showToast.bind(this),
      onProductsChanged: this.renderAll.bind(this),
    });
    this.sales = new SalesView({
      products,
      salesHistory,
      formatMoney,
      showToast: this.showToast.bind(this),
      onSaleCompleted: this.renderAll.bind(this),
    });
    this.shiftSummary = new ShiftSummaryView({
      products,
      salesHistory,
      formatMoney,
      showToast: this.showToast.bind(this),
    });

    this.bindNavigation();
    this.bindSidebarToggle();
    this.renderAll();
    this.showView('ventas');
  }

  /** Actualiza las tres ventanas después de un cambio en el estado compartido. */
  renderAll() {
    this.inventory.render();
    this.sales.render();
    this.shiftSummary.render();
  }

  bindNavigation() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-view]');
      if (button) this.showView(button.dataset.view);
    });
  }

  bindSidebarToggle() {
    const toggle = document.getElementById('toggle-sidebar');
    toggle.addEventListener('click', () => {
      const isHidden = document.body.classList.toggle('sidebar-hidden');
      toggle.setAttribute('aria-expanded', String(!isHidden));
      toggle.setAttribute('aria-label', isHidden ? 'Mostrar menú lateral' : 'Ocultar menú lateral');
    });
  }

  showView(viewId) {
    document.querySelectorAll('.view').forEach((view) => {
      view.classList.toggle('active', view.id === viewId);
    });
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.classList.toggle('active', button.dataset.view === viewId);
    });
    document.getElementById('sales-header').hidden = viewId !== 'ventas';
  }

  showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2600);
  }
}

new PointOfSaleApp();
