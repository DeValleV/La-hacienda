class SettingsView {
  constructor({ api, showToast, onCatalogsChanged }) {
    this.api = api;
    this.showToast = showToast;
    this.onCatalogsChanged = onCatalogsChanged;
    this.users = [];
    this.branches = [];
    this.catalogs = {};
    this.bindEvents();
  }

  bindEvents() {
    document.querySelector('.settings-tabs').addEventListener('click', (event) => {
      const button = event.target.closest('[data-settings-tab]');
      if (!button) return;
      document.querySelectorAll('[data-settings-tab]').forEach((item) => item.classList.toggle('active', item === button));
      document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
        const active = panel.dataset.settingsPanel === button.dataset.settingsTab;
        panel.hidden = !active;
        panel.classList.toggle('active', active);
      });
    });
    document.getElementById('user-form').addEventListener('submit', (event) => this.saveUser(event));
    document.getElementById('branch-form').addEventListener('submit', (event) => this.saveBranch(event));
    document.getElementById('catalog-form').addEventListener('submit', (event) => this.saveCatalog(event));
    document.getElementById('cancel-user-edit').onclick = () => this.resetUserForm();
    document.getElementById('cancel-branch-edit').onclick = () => this.resetBranchForm();
    document.getElementById('settings-users').addEventListener('click', (event) => {
      const button = event.target.closest('[data-edit-user]');
      if (button) this.editUser(Number(button.dataset.editUser));
    });
    document.getElementById('settings-branches').addEventListener('click', (event) => {
      const button = event.target.closest('[data-edit-branch]');
      if (button) this.editBranch(Number(button.dataset.editBranch));
    });
    document.getElementById('settings-catalogs').addEventListener('click', (event) => {
      const button = event.target.closest('[data-edit-catalog]');
      if (button) this.editCatalog(button.dataset.catalog, Number(button.dataset.editCatalog));
    });
    document.getElementById('catalog-type').onchange = () => this.renderCatalogs();
  }

  async load() {
    const [{ users }, { branches }, catalogs] = await Promise.all([
      this.api.getUsers(), this.api.getAdminBranches(), this.api.getCatalogs(),
    ]);
    this.users = users;
    this.branches = branches;
    this.catalogs = catalogs;
    this.onCatalogsChanged(catalogs);
    this.render();
  }

  render() {
    document.getElementById('settings-users').innerHTML = this.users.length ? this.users.map((user) => `
      <tr><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.username)}</td><td>${escapeHtml(user.role)}</td>
      <td><span class="badge ${user.active ? 'ok' : 'low'}">${user.active ? 'Activo' : 'Inactivo'}</span></td>
      <td><button class="row-action" type="button" data-edit-user="${user.id}">Editar</button></td></tr>`).join('') : '<tr><td colspan="5" class="muted">No hay usuarios.</td></tr>';
    document.getElementById('settings-branches').innerHTML = this.branches.length ? this.branches.map((branch) => `
      <tr><td>${escapeHtml(branch.name)}</td><td>${escapeHtml(branch.code)}</td><td>${escapeHtml(branch.address || '—')}</td>
      <td><span class="badge ${branch.active ? 'ok' : 'low'}">${branch.active ? 'Activa' : 'Inactiva'}</span></td>
      <td><button class="row-action" type="button" data-edit-branch="${branch.id}">Editar</button></td></tr>`).join('') : '<tr><td colspan="5" class="muted">No hay sucursales.</td></tr>';
    this.renderCatalogs();
  }

  renderCatalogs() {
    const catalog = document.getElementById('catalog-type').value;
    const items = this.catalogs[catalog] || [];
    document.getElementById('settings-catalogs').innerHTML = items.length ? items.map((item) => `
      <div class="catalog-item"><span>${escapeHtml(item.name)}</span><button class="row-action" type="button" data-catalog="${catalog}" data-edit-catalog="${item.id}">Editar</button></div>`).join('') : '<p class="muted">No hay elementos.</p>';
  }

  editUser(id) {
    const user = this.users.find((item) => item.id === id);
    if (!user) return;
    document.getElementById('user-id').value = user.id;
    document.getElementById('user-name').value = user.name;
    document.getElementById('user-username').value = user.username;
    document.getElementById('user-role').value = user.role;
    document.getElementById('user-active').checked = user.active;
    document.getElementById('user-password').value = '';
    document.getElementById('cancel-user-edit').hidden = false;
  }

  resetUserForm() {
    document.getElementById('user-form').reset();
    document.getElementById('user-id').value = '';
    document.getElementById('user-active').checked = true;
    document.getElementById('cancel-user-edit').hidden = true;
  }

  async saveUser(event) {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('[type="submit"]');
    const id = Number(document.getElementById('user-id').value) || null;
    const payload = {
      name: document.getElementById('user-name').value,
      username: document.getElementById('user-username').value,
      role: document.getElementById('user-role').value,
      password: document.getElementById('user-password').value,
      active: document.getElementById('user-active').checked,
    };
    if (!id && !payload.password) return this.showToast('La contraseña es obligatoria para un usuario nuevo.');
    submit.disabled = true;
    try {
      if (id) await this.api.updateUser(id, payload); else await this.api.createUser(payload);
      this.resetUserForm();
      await this.load();
      this.showToast('Usuario guardado.');
    } catch (error) {
      this.showToast(error.message);
    } finally {
      submit.disabled = false;
    }
  }

  editBranch(id) {
    const branch = this.branches.find((item) => item.id === id);
    if (!branch) return;
    document.getElementById('branch-id').value = branch.id;
    document.getElementById('branch-name').value = branch.name;
    document.getElementById('branch-code').value = branch.code;
    document.getElementById('branch-address').value = branch.address || '';
    document.getElementById('branch-active').checked = branch.active;
    document.getElementById('cancel-branch-edit').hidden = false;
  }

  resetBranchForm() {
    document.getElementById('branch-form').reset();
    document.getElementById('branch-id').value = '';
    document.getElementById('branch-active').checked = true;
    document.getElementById('cancel-branch-edit').hidden = true;
  }

  async saveBranch(event) {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('[type="submit"]');
    const id = Number(document.getElementById('branch-id').value) || null;
    const payload = {
      name: document.getElementById('branch-name').value,
      code: document.getElementById('branch-code').value,
      address: document.getElementById('branch-address').value,
      active: document.getElementById('branch-active').checked,
    };
    submit.disabled = true;
    try {
      if (id) await this.api.updateBranch(id, payload); else await this.api.createBranch(payload);
      this.resetBranchForm();
      await this.load();
      this.showToast('Sucursal guardada.');
    } catch (error) {
      this.showToast(error.message);
    } finally {
      submit.disabled = false;
    }
  }

  async saveCatalog(event) {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('[type="submit"]');
    const type = document.getElementById('catalog-type').value;
    const input = document.getElementById('catalog-name');
    submit.disabled = true;
    try {
      await this.api.createCatalogItem(type, input.value);
      input.value = '';
      await this.load();
      this.showToast('Elemento agregado.');
    } catch (error) {
      this.showToast(error.message);
    } finally {
      submit.disabled = false;
    }
  }

  async editCatalog(catalog, id) {
    const item = (this.catalogs[catalog] || []).find((candidate) => candidate.id === id);
    if (!item) return;
    const name = window.prompt('Nuevo nombre:', item.name);
    if (!name || name.trim() === item.name) return;
    try {
      await this.api.updateCatalogItem(catalog, id, name);
      await this.load();
      this.showToast('Catálogo actualizado.');
    } catch (error) { this.showToast(error.message); }
  }
}

window.SettingsView = SettingsView;
