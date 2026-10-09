const products = [];
const salesHistory = [];
const formatMoney = (amount) => new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', currencyDisplay: 'symbol',
}).format(amount);

class PointOfSaleApp {
  constructor() {
    this.syncTouchTabletLayout();
    window.addEventListener('resize', () => this.syncTouchTabletLayout());
    window.addEventListener('online', () => this.handleConnectionChange());
    window.addEventListener('offline', () => this.handleConnectionChange());
    window.addEventListener('connection:slow', () => this.showSlowConnection());
    window.addEventListener('connection:responsive', () => this.hideSlowConnection());
    this.api = new ApiClient();
    this.offlineStore = new OfflineStore();
    this.offlineModeRequested = false;
    this.offlineMode = false;
    this.syncingOffline = false;
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
    document.getElementById('retry-connection').addEventListener('click', () => this.retryConnection());
    document.getElementById('keep-waiting').addEventListener('click', () => this.hideSlowConnection());
    document.getElementById('activate-offline-mode').addEventListener('click', () => this.activateOfflineMode());
    document.getElementById('activate-offline-mode-sidebar').addEventListener('click', () => this.activateOfflineMode());
    document.getElementById('logout').onclick = () => this.logout();
    document.getElementById('export-inventory').onclick = () => this.exportInventory();
    // Algunos navegadores móviles no emiten `online` de forma consistente al
    // volver de una zona sin señal. Esta comprobación ligera cubre ese caso y
    // también permite salir del modo manual sin recargar la aplicación.
    setInterval(() => {
      if (this.offlineMode) this.handleConnectionChange();
    }, 30_000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.offlineMode) this.handleConnectionChange();
    });
    this.renderAll();
    this.initialize();
  }

  // Algunos simuladores sólo cambian el viewport y no exponen `any-pointer: coarse`.
  // Esta clase conserva el diseño tablet para navegadores Android/iPad reales y emulados.
  syncTouchTabletLayout() {
    const touchDevice = navigator.maxTouchPoints > 0 || /Android|iPad|Tablet/i.test(navigator.userAgent);
    const tabletWidth = window.innerWidth >= 701 && window.innerWidth <= 1920;
    document.documentElement.classList.toggle('touch-tablet', touchDevice && tabletWidth);
  }

  async initialize() {
    if (this.offlineModeRequested) return;
    try {
      await this.loadBranches();
      if (this.offlineModeRequested) return;
      const { user } = await this.api.getSession();
      if (this.offlineModeRequested) return;
      await this.startSession(user);
    } catch (error) {
      if (error.code === 'NETWORK_ERROR') {
        const snapshot = await this.offlineStore.snapshot();
        if (snapshot?.users?.length) {
          this.populateOfflineBranch(snapshot);
          this.showLogin();
        }
        else this.showOffline();
        return;
      }
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
      throw error;
    }
  }

  populateOfflineBranch(snapshot) {
    const select = document.getElementById('login-branch');
    select.replaceChildren(new Option(snapshot.branchName || 'Sucursal guardada', String(snapshot.branchId)));
    select.disabled = false;
  }

  async handleConnectionChange() {
    try {
      // Browser connection events are hints only. A response such as 401 still
      // proves that the Worker is reachable, so only a failed fetch means offline.
      await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
    } catch {
      if (this.currentSession) this.enableOfflineMode();
      else this.showOffline();
      return;
    }
    const status = document.getElementById('connection-status');
    status.hidden = true;
    if (this.offlineMode) await this.syncOfflineOperations();
    if (!this.offlineModeRequested && !document.getElementById('offline-screen').hidden) this.initialize();
  }

  async retryConnection() {
    const button = document.getElementById('retry-connection');
    button.disabled = true;
    button.textContent = 'Comprobando conexión…';
    try {
      this.offlineModeRequested = false;
      this.hideSlowConnection();
      await this.initialize();
    } finally {
      button.disabled = false;
      button.textContent = 'Reintentar conexión';
    }
  }

  showOffline() {
    this.hideSlowConnection();
    document.getElementById('app-shell').hidden = true;
    document.getElementById('login-screen').hidden = true;
    document.getElementById('offline-screen').hidden = false;
    const status = document.getElementById('connection-status');
    status.hidden = false;
    status.classList.remove('is-online');
    document.getElementById('connection-status-text').textContent = 'Sin conexión';
  }

  showSlowConnection() {
    if (document.getElementById('offline-screen').hidden) {
      document.getElementById('slow-connection').hidden = false;
    }
  }

  hideSlowConnection() {
    document.getElementById('slow-connection').hidden = true;
  }

  activateOfflineMode() {
    this.offlineModeRequested = true;
    if (this.currentSession) {
      this.enableOfflineMode();
      return;
    }
    document.getElementById('offline-title').textContent = 'Modo sin conexión activado';
    document.getElementById('offline-description').textContent = 'Las operaciones se guardarán en este dispositivo y se sincronizarán al recuperar la conexión.';
    this.showOffline();
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
        if (error.code === 'NETWORK_ERROR' && await this.loginOffline({ branchId, username, password })) return;
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
    document.getElementById('offline-screen').hidden = true;
    document.getElementById('login-screen').hidden = true;
    document.getElementById('app-shell').hidden = false;
    const sessionUser = document.getElementById('session-user');
    const name = document.createElement('strong');
    name.textContent = user.username;
    const details = document.createElement('span');
    details.textContent = `${user.name} · ${user.role} · ${user.branchName}`;
    sessionUser.replaceChildren(
      name,
      details,
      document.getElementById('activate-offline-mode-sidebar'),
      document.getElementById('logout'),
    );
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
      // La sesión en línea no debe fallar sólo porque se perdió la conexión al
      // momento de actualizar la copia offline.
      try {
        const { snapshot } = await this.api.getOfflineBootstrap();
        await this.offlineStore.saveSnapshot(snapshot);
      } catch (error) {
        console.warn('No se pudo actualizar la copia offline.', error);
      }
      this.offlineMode = false;
      this.updateOfflineStatus();
      this.showView('ventas');
      // Una cuenta distinta no debe enviar operaciones capturadas por otro
      // usuario. Las suyas se intentan al volver a autenticarse en línea.
      if ((await this.offlineStore.pendingForUser(user.userId)).length) {
        this.offlineMode = true;
        await this.syncOfflineOperations();
      }
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
    this.offlineModeRequested = false;
    document.getElementById('offline-title').textContent = 'No hay conexión a Internet';
    document.getElementById('offline-description').textContent = 'Inicia sesión con una cuenta que ya se haya usado en este dispositivo. Las ventas, reposiciones y turnos se guardarán aquí hasta recuperar la conexión.';
    document.getElementById('offline-screen').hidden = true;
    document.getElementById('login-screen').hidden = false;
    document.getElementById('app-shell').hidden = true;
    document.getElementById('login-username').focus();
  }

  async loginOffline({ branchId, username, password }) {
    const snapshot = await this.offlineStore.snapshot();
    const user = snapshot?.users?.find((item) => item.branchId === undefined || item.branchId === branchId
      ? item.username.toLowerCase() === username.toLowerCase() : false);
    if (!user || snapshot.branchId !== branchId || !(await this.verifyOfflinePassword(password, user.passwordVerifier))) {
      this.showLoginError('No hay una sesión local válida para este usuario. Conéctese e inicie sesión una vez.');
      return false;
    }
    await this.startOfflineSession(user, snapshot);
    return true;
  }

  async verifyOfflinePassword(password, verifier) {
    try {
      const [algorithm, iterationsText, saltText, hashText] = String(verifier).split('$');
      if (algorithm !== 'pbkdf2_sha256') return false;
      const decode = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
      const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: decode(saltText), iterations: Number(iterationsText) }, key, 256));
      const expected = decode(hashText);
      return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
    } catch { return false; }
  }

  async startOfflineSession(user, snapshot) {
    this.currentSession = { ...user, branchId: snapshot.branchId, branchName: snapshot.branchName };
    this.currentShift = snapshot.shift;
    products.splice(0, products.length, ...snapshot.products);
    document.getElementById('offline-screen').hidden = true;
    document.getElementById('login-screen').hidden = true;
    document.getElementById('app-shell').hidden = false;
    const sessionUser = document.getElementById('session-user');
    const name = document.createElement('strong'); name.textContent = user.username;
    const details = document.createElement('span'); details.textContent = `${user.name} · ${user.role} · ${snapshot.branchName}`;
    sessionUser.replaceChildren(name, details, document.getElementById('activate-offline-mode-sidebar'), document.getElementById('logout'));
    this.applyPermissions();
    this.shiftSummary.setShift(this.currentShift);
    this.syncShiftUi();
    this.offlineMode = true;
    this.renderAll();
    this.updateOfflineStatus();
    this.showView('ventas');
    this.showToast('Modo sin conexión activo. Las ventas se sincronizarán al reconectar.');
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
    const canCloseShift = ['administrador', 'encargado'].includes(this.currentSession.role);
    const isAdmin = this.currentSession.role === 'administrador';
    const inventoryButton = document.querySelector('[data-view="inventario"]');
    const summaryButton = document.querySelector('[data-view="resumen"]');
    const settingsButton = document.querySelector('[data-view="configuracion"]');
    inventoryButton.hidden = !canManageInventory;
    summaryButton.hidden = false;
    settingsButton.hidden = !isAdmin;
    document.getElementById('add-product').hidden = !canManageInventory;
    document.getElementById('bulk-restock').hidden = !canManageInventory;
    this.shiftSummary.setCanClose(canCloseShift);
  }

  async refreshData() {
    const [{ products: nextProducts }, { sales }] = await Promise.all([this.api.getProducts(), this.api.getSales()]);
    products.splice(0, products.length, ...nextProducts);
    salesHistory.splice(0, salesHistory.length, ...sales);
    this.renderAll();
  }

  async saveProduct(product, productId) {
    const result = productId ? await this.api.updateProduct(productId, product) : await this.api.createProduct(product);
    try {
      if (product.image) await this.api.uploadProductImage(result.product.id, product.image);
    } catch (error) {
      await this.loadProducts();
      error.productId = result.product.id;
      throw error;
    }
    await this.loadProducts();
    return result.product;
  }

  async restockProduct(productId, quantity) {
    if (this.offlineMode) return this.queueRestock([{ productId, quantity }]);
    await this.api.restockProduct(productId, quantity);
    await this.loadProducts();
  }

  async bulkRestockProducts(items) {
    if (this.offlineMode) return this.queueRestock(items);
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
    if (this.offlineMode) {
      const operation = await this.offlineStore.enqueue('sale', sale, { userId: this.currentSession.userId });
      sale.lines.forEach((line) => {
        const product = products.find((item) => item.id === line.productId);
        if (product) product.stock = Math.max(0, product.stock - line.qty);
      });
      await this.offlineStore.saveSnapshot({ ...(await this.offlineStore.snapshot()), products });
      this.renderAll();
      this.updateOfflineStatus();
      this.showToast(`Venta guardada sin conexión (${operation.id.slice(0, 8)}).`);
      return;
    }
    await this.api.createSale(sale);
    await Promise.all([this.refreshData(), this.loadHistory(true)]);
  }

  async queueRestock(items) {
    await this.offlineStore.enqueue('restock', { items }, { userId: this.currentSession.userId });
    items.forEach(({ productId, quantity }) => {
      const product = products.find((item) => item.id === Number(productId));
      if (product) product.stock += Number(quantity);
    });
    await this.offlineStore.saveSnapshot({ ...(await this.offlineStore.snapshot()), products });
    this.renderAll();
    this.updateOfflineStatus();
    this.showToast('Reposición guardada sin conexión.');
  }

  enableOfflineMode() {
    if (!this.currentSession) return;
    this.offlineMode = true;
    this.offlineModeRequested = true;
    this.updateOfflineStatus();
    this.showToast('Sin conexión: los cambios nuevos se guardarán localmente.');
  }

  async syncOfflineOperations() {
    if (this.syncingOffline || !this.currentSession) return;
    this.syncingOffline = true;
    try {
      const operations = await this.offlineStore.pendingForUser(this.currentSession.userId);
      if (!operations.length) {
        this.offlineMode = false;
        this.offlineModeRequested = false;
        return;
      }
      const { results } = await this.api.syncOffline(operations);
      for (const result of results) await this.offlineStore.mark(result.id, result.status === 'applied' ? 'applied' : 'error', result.message || null);
      const failed = results.filter((result) => result.status === 'error');
      if (failed.length) {
        this.showToast(`${failed.length} operación(es) requieren revisión antes de sincronizar.`);
      } else {
        this.offlineMode = false;
        this.offlineModeRequested = false;
        await this.refreshData();
        try {
          const { snapshot } = await this.api.getOfflineBootstrap();
          await this.offlineStore.saveSnapshot(snapshot);
        } catch (error) {
          console.warn('No se pudo renovar la copia offline.', error);
        }
        this.showToast(`${results.length} operación(es) sincronizadas.`);
      }
    } catch (error) {
      this.showToast('No se pudo sincronizar todavía. Las operaciones siguen seguras en este dispositivo.');
    } finally {
      this.syncingOffline = false;
      this.updateOfflineStatus();
    }
  }

  async updateOfflineStatus() {
    const status = document.getElementById('connection-status');
    const text = document.getElementById('connection-status-text');
    if (!this.offlineMode) { status.hidden = true; return; }
    const pending = this.currentSession
      ? (await this.offlineStore.pendingForUser(this.currentSession.userId)).length
      : await this.offlineStore.countPending();
    status.hidden = false;
    status.classList.remove('is-online');
    text.textContent = `Sin conexión · ${pending} operación${pending === 1 ? '' : 'es'} pendiente${pending === 1 ? '' : 's'}`;
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
        if (!['administrador', 'encargado'].includes(this.currentSession.role)) return;
        if (!(await this.confirmCloseShift())) return;
        if (this.offlineMode) {
          await this.offlineStore.enqueue('shift-close', {}, { userId: this.currentSession.userId });
          this.currentShift = { ...this.currentShift, status: 'cerrado', closedAt: new Date().toISOString(), provisional: true };
          await this.offlineStore.saveSnapshot({ ...(await this.offlineStore.snapshot()), shift: this.currentShift });
          this.updateOfflineStatus();
        } else this.currentShift = (await this.api.closeShift()).shift;
        this.sales.clearCart();
      } else {
        if (this.offlineMode) {
          await this.offlineStore.enqueue('shift-open', {}, { userId: this.currentSession.userId });
          this.currentShift = { id: `offline-${crypto.randomUUID()}`, status: 'abierto', openedAt: new Date().toISOString(), provisional: true };
          await this.offlineStore.saveSnapshot({ ...(await this.offlineStore.snapshot()), shift: this.currentShift });
          this.updateOfflineStatus();
        } else {
          await this.api.openShift();
          this.currentShift = (await this.api.getCurrentShift()).shift;
        }
      }
      this.shiftSummary.setShift(this.currentShift);
      this.syncShiftUi();
      // En modo offline el turno ya se refleja en el estado local. Consultar
      // la API aquí convertía una acción válida en un falso error de red.
      if (this.offlineMode) this.renderAll();
      else await this.refreshData();
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
    const backdrop = document.getElementById('mobile-menu-backdrop');
    let lastTouchToggle = 0;
    const toggleSidebar = () => {
      if (window.matchMedia('(max-width: 700px)').matches) {
        this.setMobileSidebarOpen(!document.body.classList.contains('mobile-sidebar-open'));
        return;
      }
      const isHidden = document.body.classList.toggle('sidebar-hidden');
      toggle.setAttribute('aria-expanded', String(!isHidden));
      toggle.setAttribute('aria-label', isHidden ? 'Mostrar menú lateral' : 'Ocultar menú lateral');
    };

    // Los navegadores móviles disparan pointerup de forma más consistente que click
    // cuando el botón está cerca del borde superior o de la zona segura.
    toggle.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'mouse') return;
      event.preventDefault();
      lastTouchToggle = Date.now();
      toggleSidebar();
    });
    toggle.addEventListener('click', () => {
      if (Date.now() - lastTouchToggle < 600) return;
      toggleSidebar();
    });

    backdrop.addEventListener('click', () => {
      if (Date.now() - (this.mobileSidebarOpenedAt || 0) < 650) return;
      this.setMobileSidebarOpen(false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !document.body.classList.contains('mobile-sidebar-open')) return;
      this.setMobileSidebarOpen(false);
      toggle.focus();
    });
  }

  setMobileSidebarOpen(isOpen) {
    if (isOpen) this.mobileSidebarOpenedAt = Date.now();
    document.body.classList.toggle('mobile-sidebar-open', isOpen);
    const toggle = document.getElementById('toggle-sidebar');
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Cerrar menú lateral' : 'Abrir menú lateral');
    document.getElementById('mobile-menu-backdrop').hidden = !isOpen;
  }

  showView(viewId) {
    document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === viewId));
    document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === viewId));
    document.getElementById('sales-header').hidden = viewId !== 'ventas';
    if (window.matchMedia('(max-width: 700px)').matches) {
      this.setMobileSidebarOpen(false);
    }
  }

  showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2600);
  }
}

new PointOfSaleApp();
