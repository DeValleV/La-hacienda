// Datos iniciales de la aplicación. En producción vendrían de una API.
const products = [
  { id: 1, name: 'Menú del Día', category: 'Alimentos', brand: 'La Hacienda', unit: 'pieza', status: 'activo', price: 5.5, stock: 64, minStock: 10, color: '#ff6600' },
  { id: 2, name: 'Bebida Cola 500ml', category: 'Bebidas', brand: 'Cola', unit: 'botella', status: 'activo', price: 1.2, stock: 8, minStock: 10, color: '#c44536' },
  { id: 3, name: 'Postre Gelatina', category: 'Postres', brand: 'La Hacienda', unit: 'pieza', status: 'activo', price: 0.8, stock: 31, minStock: 10, color: '#7655a4' },
  { id: 4, name: 'Café Americano', category: 'Bebidas', brand: 'La Hacienda', unit: 'vaso', status: 'activo', price: 1, stock: 42, minStock: 10, color: '#795548' },
  { id: 5, name: 'Agua Natural 600ml', category: 'Bebidas', brand: 'La Hacienda', unit: 'botella', status: 'activo', price: 0.7, stock: 56, minStock: 12, color: '#158c8c' },
  { id: 6, name: 'Jugo de Naranja', category: 'Bebidas', brand: 'La Hacienda', unit: 'botella', status: 'activo', price: 1.5, stock: 23, minStock: 10, color: '#3c6ead' },
  { id: 7, name: 'Té Helado Limón', category: 'Bebidas', brand: 'La Hacienda', unit: 'vaso', status: 'activo', price: 1.25, stock: 18, minStock: 8, color: '#b7791f' },
  { id: 8, name: 'Sándwich de Pollo', category: 'Alimentos', brand: 'La Hacienda', unit: 'pieza', status: 'activo', price: 3.5, stock: 15, minStock: 8, color: '#27765b' },
  { id: 9, name: 'Ensalada Fresca', category: 'Alimentos', brand: 'La Hacienda', unit: 'pieza', status: 'activo', price: 3, stock: 21, minStock: 10, color: '#e76f51' },
  { id: 10, name: 'Tacos de Guisado', category: 'Alimentos', brand: 'La Hacienda', unit: 'orden', status: 'activo', price: 2.75, stock: 27, minStock: 12, color: '#a94442' },
  { id: 11, name: 'Sopa del Día', category: 'Alimentos', brand: 'La Hacienda', unit: 'vaso', status: 'activo', price: 2.25, stock: 9, minStock: 10, color: '#8c5fa8' },
  { id: 12, name: 'Flan de Vainilla', category: 'Postres', brand: 'La Hacienda', unit: 'pieza', status: 'activo', price: 1.1, stock: 19, minStock: 8, color: '#d97706' },
  { id: 13, name: 'Arroz con Leche', category: 'Postres', brand: 'La Hacienda', unit: 'vaso', status: 'activo', price: 1, stock: 14, minStock: 8, color: '#4f9b78' },
  { id: 14, name: 'Galleta de Avena', category: 'Postres', brand: 'La Hacienda', unit: 'pieza', status: 'activo', price: 0.6, stock: 34, minStock: 10, color: '#a06b86' },
];

// Cada cobro se conserva como una venta independiente para poder auditarla por tipo.
const salesHistory = [];
const branches = [
  { id: 1, name: 'Sucursal Centro' },
  { id: 2, name: 'Sucursal Norte' },
];
// Credenciales temporales para recorrer la interfaz antes de conectar la API.
const demoUsers = [
  { username: 'admin', password: 'admin123', name: 'Administrador', role: 'administrador', branchIds: [1, 2] },
  { username: 'cajero', password: 'cajero123', name: 'Cajero', role: 'cajero', branchIds: [1] },
];
const formatMoney = (amount) => new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  currencyDisplay: 'symbol',
}).format(amount);

/** Coordina el estado compartido y la navegación entre las tres ventanas. */
class PointOfSaleApp {
  constructor() {
    this.currentSession = null;
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
    this.history = new HistoryView({
      products,
      salesHistory,
      formatMoney,
      showToast: this.showToast.bind(this),
      onHistoryChanged: this.renderAll.bind(this),
    });

    this.bindNavigation();
    this.bindSidebarToggle();
    this.bindLogin();
    this.renderAll();
    this.showView('ventas');
  }

  /** Actualiza las tres ventanas después de un cambio en el estado compartido. */
  renderAll() {
    this.inventory.render();
    this.sales.render();
    this.shiftSummary.render();
    this.history.render();
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

  bindLogin() {
    const form = document.getElementById('login-form');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const branchId = Number(document.getElementById('login-branch').value);
      const user = demoUsers.find((candidate) => candidate.username === username && candidate.password === password);
      const error = document.getElementById('login-error');

      if (!user || !user.branchIds.includes(branchId)) {
        error.textContent = 'Usuario, contraseña o acceso a sucursal no válidos.';
        error.hidden = false;
        return;
      }

      const branch = branches.find((candidate) => candidate.id === branchId);
      this.currentSession = { user, branch };
      error.hidden = true;
      document.getElementById('login-screen').hidden = true;
      document.getElementById('app-shell').hidden = false;
      document.querySelector('#sales-header h1').textContent = `Turno activo: Almuerzo · ${branch.name}`;
      this.showToast(`Sesión iniciada: ${user.name}.`);
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
