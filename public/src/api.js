class ApiClient {
  async request(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error?.message || 'No se pudo completar la operación.');
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
  deactivateProduct(id) { return this.request(`/api/products/${id}/deactivate`, { method: 'POST', body: '{}' }); }
  createSale(sale) { return this.request('/api/sales', { method: 'POST', body: JSON.stringify(sale) }); }
  getSales() { return this.request('/api/sales'); }
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
