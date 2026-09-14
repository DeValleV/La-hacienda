const FRIENDLY_API_ERRORS = {
  UNAUTHENTICATED: 'La sesión terminó. Inicie sesión nuevamente para continuar.',
  FORBIDDEN: 'Su usuario no tiene permiso para realizar esta acción.',
  INVALID_CREDENTIALS: 'La sucursal, el usuario o la contraseña no coinciden.',
  NOT_FOUND: 'No se encontró el registro solicitado. Actualice la página e inténtelo de nuevo.',
  CONFLICT: 'No se pudo guardar porque ya existe un registro con esos datos.',
  INSUFFICIENT_STOCK: 'No hay existencias suficientes para completar la venta. Revise el pedido.',
  NO_OPEN_SHIFT: 'No hay un turno abierto. Pida a un encargado que inicie el turno.',
  SHIFT_ALREADY_OPEN: 'Ya hay un turno abierto en esta sucursal.',
  INVALID_JSON: 'No se pudieron leer los datos enviados. Inténtelo de nuevo.',
  INVALID_CONTENT_TYPE: 'No se pudieron enviar los datos correctamente. Recargue la página e inténtelo de nuevo.',
  INVALID_ORIGIN: 'Esta acción debe realizarse desde la página del sistema.',
  INTERNAL_ERROR: 'No se pudo completar la operación por un problema del sistema. Inténtelo de nuevo.',
  CATALOG_NOT_INITIALIZED: 'No se pudo cargar la configuración de productos. Avise a un administrador.',
};

function friendlyError(payload, status) {
  const code = payload.error?.code;
  if (FRIENDLY_API_ERRORS[code]) return FRIENDLY_API_ERRORS[code];
  if (status >= 500) return 'No se pudo completar la operación por un problema del sistema. Inténtelo de nuevo.';
  return payload.error?.message || 'No se pudo completar la operación. Inténtelo de nuevo.';
}

class ApiClient {
  async request(path, options = {}) {
    let response;
    try {
      response = await fetch(path, {
        credentials: 'same-origin',
        ...options,
        headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
      });
    } catch {
      const error = new Error('No se pudo conectar con el sistema. Revise su conexión e inténtelo de nuevo.');
      error.code = 'NETWORK_ERROR';
      throw error;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(friendlyError(payload, response.status));
      error.status = response.status;
      error.code = payload.error?.code;
      throw error;
    }
    return payload;
  }

  getBranches() { return this.request('/api/auth/branches'); }
  getSession() { return this.request('/api/me'); }
  login(credentials) { return this.request('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) }); }
  logout() { return this.request('/api/auth/logout', { method: 'POST', body: '{}' }); }
  getProducts() { return this.request('/api/products'); }
  createProduct(product) { return this.request('/api/products', { method: 'POST', body: JSON.stringify(product) }); }
  updateProduct(id, product) { return this.request(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(product) }); }
  restockProduct(id, quantity) { return this.request(`/api/products/${id}/restock`, { method: 'POST', body: JSON.stringify({ quantity }) }); }
  restockProducts(items) { return this.request('/api/products/restock-batch', { method: 'POST', body: JSON.stringify({ items }) }); }
  deactivateProduct(id) { return this.request(`/api/products/${id}/deactivate`, { method: 'POST', body: '{}' }); }
  activateProduct(id) { return this.request(`/api/products/${id}/activate`, { method: 'POST', body: '{}' }); }
  createSale(sale) { return this.request('/api/sales', { method: 'POST', body: JSON.stringify(sale) }); }
  getSales({ month = '', date = '' } = {}) {
    const search = month ? `month=${encodeURIComponent(month)}` : date ? `date=${encodeURIComponent(date)}` : '';
    return this.request(search ? `/api/sales?${search}` : '/api/sales');
  }
  getSalesMonths() { return this.request('/api/sales/months'); }
  getSalesDays(month) { return this.request(`/api/sales/days?month=${encodeURIComponent(month)}`); }
  getCurrentShift() { return this.request('/api/shifts/current'); }
  openShift() { return this.request('/api/shifts/open', { method: 'POST', body: '{}' }); }
  closeShift() { return this.request('/api/shifts/current/close', { method: 'POST', body: '{}' }); }
  getUsers() { return this.request('/api/users'); }
  createUser(user) { return this.request('/api/users', { method: 'POST', body: JSON.stringify(user) }); }
  updateUser(id, user) { return this.request(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(user) }); }
  getAdminBranches() { return this.request('/api/branches'); }
  createBranch(branch) { return this.request('/api/branches', { method: 'POST', body: JSON.stringify(branch) }); }
  updateBranch(id, branch) { return this.request(`/api/branches/${id}`, { method: 'PATCH', body: JSON.stringify(branch) }); }
  getCatalogs() { return this.request('/api/catalogs'); }
  createCatalogItem(catalog, name) { return this.request(`/api/catalogs/${catalog}`, { method: 'POST', body: JSON.stringify({ name }) }); }
  updateCatalogItem(catalog, id, name) { return this.request(`/api/catalogs/${catalog}/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }); }
}

window.ApiClient = ApiClient;
window.escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[character]);
