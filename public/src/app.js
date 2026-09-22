const products = [];
const salesHistory = [];
const formatMoney = (amount) => new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', currencyDisplay: 'symbol',
}).format(amount);

class PointOfSaleApp {
  constructor() {
    this.api = new ApiClient();
    this.currentSession = null;
    this.currentShift = null;
    this.inventory = new InventoryView({
      products,
      formatMoney,
      showToast: this.showToast.bind(this),
      onSaveProduct: this.saveProduct.bind(this),
      onRestockProduct: this.restockProduct.bind(this),
      onBulkRestock: this.bulkRestockProducts.bind(this),
      onDeactivateProduct: this.deactivateProduct.bind(this),
      onActivateProduct: this.activateProduct.bind(this),
    });
    this.sales = new SalesView({
      products,
      salesHistory,
      formatMoney,
      showToast: this.showToast.bind(this),
      onCheckout: this.checkout.bind(this),
    });
    this.shiftSummary = new ShiftSummaryView({ products, salesHistory, formatMoney, showToast: this.showToast.bind(this), onToggleShift: this.toggleShift.bind(this) });
    this.history = new HistoryView({
      formatMoney,
      onDateChange: this.loadHistoryDate.bind(this),
      onMonthChange: this.loadHistoryMonth.bind(this),
      onRefund: this.refundSale.bind(this),
    });
    this.settings = new SettingsView({
      api: this.api,
      showToast: this.showToast.bind(this),
      onCatalogsChanged: (catalogs) => this.inventory.setCatalogs(catalogs),
    });

    this.bindNavigation();
    this.bindSidebarToggle();
    this.bindDialogs();
    this.bindLogin();
    document.getElementById('logout').onclick = () => this.logout();
    document.getElementById('export-inventory').onclick = () => this.exportInventory();
    this.renderAll();
    this.initialize();
  }

  async initialize() {
    await this.loadBranches();
    try {
      const { user } = await this.api.getSession();
      await this.startSession(user);
    } catch (error) {
      if (error.status !== 401) this.showLoginError(error.message);
      this.showLogin();
    }
  }

  async loadBranches() {
    const select = document.getElementById('login-branch');
    try {
      const { branches } = await this.api.getBranches();
      select.replaceChildren(...branches.map((branch) => {
        const option = document.createElement('option');
        option.value = branch.id;
        option.textContent = branch.name;
        return option;
      }));
      select.disabled = branches.length === 0;
      if (!branches.length) this.showLoginError('No hay sucursales activas configuradas.');
    } catch (error) {
      select.replaceChildren(new Option('No se pudieron cargar', ''));
      this.showLoginError(error.message);
    }
  }

  bindLogin() {
    document.getElementById('login-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = event.currentTarget.querySelector('[type="submit"]');
      const branchId = Number(document.getElementById('login-branch').value);
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      if (!Number.isInteger(branchId) || branchId < 1 || !username || !password) {
        this.showLoginError('Seleccione una sucursal y escriba su usuario y contraseña.');
        return;
      }
      submit.disabled = true;
      try {
        await this.api.login({
          branchId,
          username,
          password,
        });
        const { user } = await this.api.getSession();
        document.getElementById('login-error').hidden = true;
        document.getElementById('login-password').value = '';
        await this.startSession(user);
        this.showToast(`Sesión iniciada: ${user.name}.`);
      } catch (error) {
        this.showLogin();
        this.showLoginError(error.message);
      } finally {
        submit.disabled = false;
      }
    });
  }

  async startSession(user) {
    this.setLoading(true);
    this.currentSession = user;
    this.history.reset();
    document.getElementById('login-screen').hidden = true;
    document.getElementById('app-shell').hidden = false;
    const sessionUser = document.getElementById('session-user');
    const name = document.createElement('strong');
    name.textContent = user.username;
    const details = document.createElement('span');
    details.textContent = `${user.name} · ${user.role} · ${user.branchName}`;
    sessionUser.replaceChildren(name, details, document.getElementById('logout'));
    this.applyPermissions();
    try {
      const [{ shift }, catalogs] = await Promise.all([
        this.api.getCurrentShift(),
        this.api.getCatalogs(),
      ]);
      this.currentShift = shift;
      this.shiftSummary.setShift(shift);
      this.inventory.setCatalogs(catalogs);
      this.syncShiftUi();
      await Promise.all([this.refreshData(), this.loadHistory()]);
      if (user.role === 'administrador') await this.settings.load();
      this.showView('ventas');
    } catch (error) {
      this.currentSession = null;
      this.currentShift = null;
      this.shiftSummary.setShift(null);
      this.sales.setShiftOpen(false);
      throw error;
    } finally {
      this.setLoading(false);
    }
  }

  showLogin() {
    document.getElementById('login-screen').hidden = false;
    document.getElementById('app-shell').hidden = true;
    document.getElementById('login-username').focus();
  }

  showLoginError(message) {
    const error = document.getElementById('login-error');
    error.textContent = message;
    error.hidden = false;
  }

  async logout() {
    try { await this.api.logout(); } catch (error) { this.showToast(error.message); }
    this.currentSession = null;
    this.currentShift = null;
    this.shiftSummary.setShift(null);
    this.sales.setShiftOpen(false);
    this.sales.clearCart();
    document.getElementById('session-user').replaceChildren(document.getElementById('logout'));
    products.splice(0);
    salesHistory.splice(0);
    this.history.reset();
    this.renderAll();
    this.showLogin();
  }

  applyPermissions() {
    const canManageInventory = ['administrador', 'encargado'].includes(this.currentSession.role);
    const isAdmin = this.currentSession.role === 'administrador';
    const inventoryButton = document.querySelector('[data-view="inventario"]');
    const summaryButton = document.querySelector('[data-view="resumen"]');
    const settingsButton = document.querySelector('[data-view="configuracion"]');
    inventoryButton.hidden = !canManageInventory;
    summaryButton.hidden = !canManageInventory;
    settingsButton.hidden = !isAdmin;
    document.getElementById('add-product').hidden = !canManageInventory;
    document.getElementById('bulk-restock').hidden = !canManageInventory;
  }

  async refreshData() {
    const [{ products: nextProducts }, { sales }] = await Promise.all([this.api.getProducts(), this.api.getSales()]);
    products.splice(0, products.length, ...nextProducts);
    salesHistory.splice(0, salesHistory.length, ...sales);
    this.renderAll();
  }

  async saveProduct(product, productId) {
    if (productId) await this.api.updateProduct(productId, product);
    else await this.api.createProduct(product);
    await this.loadProducts();
  }

  async restockProduct(productId, quantity) {
    await this.api.restockProduct(productId, quantity);
    await this.loadProducts();
  }

  async bulkRestockProducts(items) {
    await this.api.restockProducts(items);
    await this.loadProducts();
  }

  async deactivateProduct(productId) {
    await this.api.deactivateProduct(productId);
    await this.loadProducts();
  }

  async activateProduct(productId) {
    await this.api.activateProduct(productId);
    await this.loadProducts();
  }

  async checkout(sale) {
    await this.api.createSale(sale);
    await Promise.all([this.refreshData(), this.loadHistory(true)]);
  }

  async refundSale(saleId) {
    await this.api.refundSale(saleId);
    await Promise.all([this.refreshData(), this.loadHistory(true)]);
    this.showToast('Reembolso registrado e inventario actualizado.');
  }

  async toggleShift() {
    const button = document.getElementById('close-shift');
    button.disabled = true;
    try {
      if (this.currentShift?.status === 'abierto') {
        if (!(await this.confirmCloseShift())) return;
        this.currentShift = (await this.api.closeShift()).shift;
        this.sales.clearCart();
      } else {
        await this.api.openShift();
        this.currentShift = (await this.api.getCurrentShift()).shift;
      }
      this.shiftSummary.setShift(this.currentShift);
      this.syncShiftUi();
      await this.refreshData();
      this.showToast(this.currentShift?.status === 'abierto' ? 'Turno iniciado.' : 'Turno finalizado.');
    } catch (error) {
      this.showToast(error.message);
    } finally {
      button.disabled = false;
    }
  }

  confirmCloseShift() {
    const dialog = document.getElementById('close-shift-dialog');
    dialog.showModal();
    return new Promise((resolve) => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    });
  }

  syncShiftUi() {
    const isOpen = this.currentShift?.status === 'abierto';
    this.sales.setShiftOpen(isOpen);
    if (this.currentSession) {
      document.querySelector('#sales-header h1').textContent = this.currentSession.branchName;
    }
  }

  async loadProducts() {
    const result = await this.api.getProducts();
    products.splice(0, products.length, ...result.products);
    this.renderAll();
  }

  async loadHistory(refreshSelectedDate = false) {
    const { months } = await this.api.getSalesMonths();
    this.history.setMonths(months);
    if (!months.length) return;
    const selectedDate = this.history.selectedDate;
    const selectedMonth = selectedDate?.slice(0, 7);
    const month = refreshSelectedDate && selectedMonth && months.some((entry) => entry.month === selectedMonth)
      ? selectedMonth
      : months[0].month;
    await this.loadHistoryMonth(month);
    const days = this.history.daysByMonth.get(month) || [];
    const date = refreshSelectedDate && selectedDate && days.some((entry) => entry.date === selectedDate)
      ? selectedDate
      : days[0]?.date;
    if (date) {
      this.history.setSelectedDate(date);
      await this.loadHistoryDate(date);
    }
  }

  async loadHistoryMonth(month) {
    try {
      const { days } = await this.api.getSalesDays(month);
      this.history.setDays(month, days);
    } catch (error) {
      this.showToast(error.message);
      throw error;
    }
  }

  async loadHistoryDate(date) {
    try {
      const { sales, shifts } = await this.api.getSales({ date });
      this.history.setDaySales(sales, shifts);
    } catch (error) {
      this.showToast(error.message);
      throw error;
    }
  }

  renderAll() {
    this.inventory.render();
    this.sales.render();
    this.shiftSummary.render();
    this.history.render();
  }

  setLoading(loading) {
    document.getElementById('app-loading').hidden = !loading;
    document.getElementById('app-shell').setAttribute('aria-busy', String(loading));
  }

  exportInventory() {
    window.downloadXlsx('inventario.xlsx', [{
      name: 'Inventario',
      columns: [
        { width: 10 }, { width: 30 }, { width: 18 }, { width: 22 }, { width: 14, type: 'currency' },
        { width: 15 }, { width: 15 }, { width: 15 },
      ],
      rows: [
        ['ID', 'Producto', 'Categoría', 'Marca', 'Precio', 'Existencias', 'Stock mínimo', 'Estado'],
        ...products.map((product) => [product.id, product.name, product.category, product.brand, product.price, product.stock, product.minStock, product.status]),
      ],
      rowStyles: [null, ...products.map((product) => {
        if (product.stock === 0) return 'danger';
        if (product.stock <= product.minStock) return 'warning';
        return 'success';
      })],
    }]);
    this.showToast('Se descargó el inventario en formato Excel.');
  }

  bindDialogs() {
    document.querySelectorAll('dialog').forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close('cancel');
      });
      dialog.querySelectorAll('[data-dialog-close]').forEach((button) => {
        button.addEventListener('click', () => dialog.close('cancel'));
      });
    });
    document.getElementById('confirm-close-shift').addEventListener('click', () => {
      document.getElementById('close-shift-dialog').close('confirm');
    });
  }

  bindNavigation() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-view]');
      if (button && !button.hidden) this.showView(button.dataset.view);
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
    document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === viewId));
    document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === viewId));
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
