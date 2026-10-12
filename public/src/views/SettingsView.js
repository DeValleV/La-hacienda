class SettingsView {
  constructor({ api, showToast, onCatalogsChanged }) {
    Object.assign(this, { api, showToast, onCatalogsChanged, users: [], branches: [], catalogs: {} });
    this.bindEvents();
  }

  bindEvents() {
    document.querySelector('.settings-tabs').addEventListener('click', (event) => {
      const button = event.target.closest('[data-settings-tab]');
      if (!button) return;
      document.querySelectorAll('[data-settings-tab]').forEach((item) => item.classList.toggle('active', item === button));
      document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
        const active = panel.dataset.settingsPanel === button.dataset.settingsTab;
        panel.hidden = !active; panel.classList.toggle('active', active);
      });
    });
    [['user-form', 'saveUser'], ['branch-form', 'saveBranch'], ['catalog-form', 'saveCatalog']].forEach(([id, method]) => document.getElementById(id).addEventListener('submit', (event) => this[method](event)));
    [['new-user', 'openNewUserDialog'], ['new-branch', 'openNewBranchDialog'], ['new-catalog', 'openNewCatalogDialog']].forEach(([id, method]) => { document.getElementById(id).onclick = () => this[method](); });
    document.getElementById('settings-users').addEventListener('click', (event) => this.handleUserAction(event));
    document.getElementById('settings-branches').addEventListener('click', (event) => this.handleBranchAction(event));
    document.getElementById('settings-catalogs').addEventListener('click', (event) => { const button = event.target.closest('[data-edit-catalog]'); if (button) this.editCatalog(button.dataset.catalog, Number(button.dataset.editCatalog)); });
    document.getElementById('catalog-type').onchange = () => this.renderCatalogs();
  }

  async load() {
    const [{ users }, { branches }, catalogs] = await Promise.all([this.api.getUsers(), this.api.getAdminBranches(), this.api.getCatalogs()]);
    Object.assign(this, { users, branches, catalogs }); this.onCatalogsChanged(catalogs); this.render();
  }

  render() {
    this.populateBranchOptions();
    document.getElementById('settings-users').innerHTML = this.users.length ? this.users.map((user) => `<tr><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.username)}</td><td>${escapeHtml(user.role)}</td><td>${escapeHtml(user.branchName)}</td><td><span class="badge ${user.active ? 'ok' : 'low'}">${user.active ? 'Activo' : 'Inactivo'}</span></td><td class="row-actions"><button class="row-action" type="button" data-edit-user="${user.id}">Editar</button><button class="row-action ${user.active ? 'danger-action' : ''}" type="button" data-toggle-user="${user.id}">${user.active ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('') : '<tr><td colspan="6" class="muted">No hay usuarios.</td></tr>';
    document.getElementById('settings-branches').innerHTML = this.branches.length ? this.branches.map((branch) => `<tr><td>${escapeHtml(branch.name)}</td><td>${escapeHtml(branch.code)}</td><td>${escapeHtml(branch.address || '—')}</td><td><span class="badge ${branch.active ? 'ok' : 'low'}">${branch.active ? 'Activa' : 'Inactiva'}</span></td><td class="row-actions"><button class="row-action" type="button" data-edit-branch="${branch.id}">Editar</button><button class="row-action ${branch.active ? 'danger-action' : ''}" type="button" data-toggle-branch="${branch.id}">${branch.active ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('') : '<tr><td colspan="5" class="muted">No hay sucursales.</td></tr>';
    this.renderCatalogs();
  }

  populateBranchOptions() {
    const select = document.getElementById('user-branch'); const selected = Number(select.value);
    select.replaceChildren(...this.branches.map((branch) => { const option = document.createElement('option'); option.value = branch.id; option.textContent = branch.active ? branch.name : `${branch.name} (inactiva)`; option.disabled = !branch.active; return option; }));
    if (this.branches.some((branch) => branch.id === selected)) select.value = String(selected);
    if (!select.value) select.value = String(this.branches.find((branch) => branch.active)?.id || '');
  }

  renderCatalogs() {
    const catalog = document.getElementById('catalog-type').value; const items = this.catalogs[catalog] || [];
    document.getElementById('settings-catalogs').innerHTML = items.length ? items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td><button class="row-action" type="button" data-catalog="${catalog}" data-edit-catalog="${item.id}">Editar</button></td></tr>`).join('') : '<tr><td colspan="2" class="muted">No hay elementos.</td></tr>';
  }

  openNewUserDialog() { this.openDialog('user', 'Nuevo usuario'); document.getElementById('user-active').checked = true; this.populateBranchOptions(); }
  editUser(id) { const user = this.users.find((item) => item.id === id); if (!user) return; this.openDialog('user', 'Editar usuario'); document.getElementById('user-id').value = user.id; document.getElementById('user-name').value = user.name; document.getElementById('user-username').value = user.username; document.getElementById('user-role').value = user.role; document.getElementById('user-branch').value = user.branchId; document.getElementById('user-active').checked = user.active; }
  openNewBranchDialog() { this.openDialog('branch', 'Nueva sucursal'); document.getElementById('branch-active').checked = true; }
  editBranch(id) { const branch = this.branches.find((item) => item.id === id); if (!branch) return; this.openDialog('branch', 'Editar sucursal'); document.getElementById('branch-id').value = branch.id; document.getElementById('branch-name').value = branch.name; document.getElementById('branch-code').value = branch.code; document.getElementById('branch-address').value = branch.address || ''; document.getElementById('branch-active').checked = branch.active; }
  openNewCatalogDialog() { this.openDialog('catalog', 'Nuevo elemento'); }
  editCatalog(catalog, id) { const item = (this.catalogs[catalog] || []).find((candidate) => candidate.id === id); if (!item) return; document.getElementById('catalog-type').value = catalog; this.openDialog('catalog', 'Editar elemento'); document.getElementById('catalog-id').value = item.id; document.getElementById('catalog-name').value = item.name; }

  openDialog(kind, title) { document.getElementById(`${kind}-dialog-title`).textContent = title; document.getElementById(`${kind}-form`).reset(); document.getElementById(`${kind}-id`).value = ''; document.getElementById(`${kind}-dialog`).showModal(); }

  async handleUserAction(event) {
    const edit = event.target.closest('[data-edit-user]'); if (edit) return this.editUser(Number(edit.dataset.editUser));
    const button = event.target.closest('[data-toggle-user]'); const user = this.users.find((item) => item.id === Number(button?.dataset.toggleUser)); if (!user) return;
    button.disabled = true;
    try { await this.api.updateUser(user.id, { name: user.name, username: user.username, role: user.role, branchId: user.branchId, active: !user.active }); await this.load(); this.showToast(`Usuario ${user.active ? 'desactivado' : 'activado'}.`); } catch (error) { this.showToast(error.message); } finally { button.disabled = false; }
  }

  async handleBranchAction(event) {
    const edit = event.target.closest('[data-edit-branch]'); if (edit) return this.editBranch(Number(edit.dataset.editBranch));
    const button = event.target.closest('[data-toggle-branch]'); const branch = this.branches.find((item) => item.id === Number(button?.dataset.toggleBranch)); if (!branch) return;
    button.disabled = true;
    try { await this.api.updateBranch(branch.id, { name: branch.name, code: branch.code, address: branch.address || '', active: !branch.active }); await this.load(); this.showToast(`Sucursal ${branch.active ? 'desactivada' : 'activada'}.`); } catch (error) { this.showToast(error.message); } finally { button.disabled = false; }
  }

  async saveUser(event) {
    event.preventDefault(); const submit = event.currentTarget.querySelector('[type="submit"]'); const id = Number(document.getElementById('user-id').value) || null;
    const payload = { name: document.getElementById('user-name').value.trim(), username: document.getElementById('user-username').value.trim(), role: document.getElementById('user-role').value, branchId: Number(document.getElementById('user-branch').value), password: document.getElementById('user-password').value, active: document.getElementById('user-active').checked };
    if (!payload.name || !payload.username || !Number.isInteger(payload.branchId) || payload.branchId < 1) return this.showToast('Complete nombre, usuario y sucursal.'); if (!id && !payload.password) return this.showToast('La contraseña es obligatoria para un usuario nuevo.'); if (payload.password && payload.password.length < 10) return this.showToast('La contraseña debe tener al menos 10 caracteres.');
    submit.disabled = true; try { if (id) await this.api.updateUser(id, payload); else await this.api.createUser(payload); document.getElementById('user-dialog').close(); await this.load(); this.showToast('Usuario guardado.'); } catch (error) { this.showToast(error.message); } finally { submit.disabled = false; }
  }

  async saveBranch(event) {
    event.preventDefault(); const submit = event.currentTarget.querySelector('[type="submit"]'); const id = Number(document.getElementById('branch-id').value) || null;
    const payload = { name: document.getElementById('branch-name').value.trim(), code: document.getElementById('branch-code').value.trim(), address: document.getElementById('branch-address').value.trim(), active: document.getElementById('branch-active').checked };
    if (!payload.name || !payload.code) return this.showToast('Complete nombre y código de la sucursal.');
    submit.disabled = true; try { if (id) await this.api.updateBranch(id, payload); else await this.api.createBranch(payload); document.getElementById('branch-dialog').close(); await this.load(); this.showToast('Sucursal guardada.'); } catch (error) { this.showToast(error.message); } finally { submit.disabled = false; }
  }

  async saveCatalog(event) {
    event.preventDefault(); const submit = event.currentTarget.querySelector('[type="submit"]'); const type = document.getElementById('catalog-type').value; const id = Number(document.getElementById('catalog-id').value) || null; const name = document.getElementById('catalog-name').value.trim();
    if (!name) return this.showToast('Escriba el nombre del elemento.');
    submit.disabled = true; try { if (id) await this.api.updateCatalogItem(type, id, name); else await this.api.createCatalogItem(type, name); document.getElementById('catalog-dialog').close(); await this.load(); this.showToast('Catálogo guardado.'); } catch (error) { this.showToast(error.message); } finally { submit.disabled = false; }
  }
}

window.SettingsView = SettingsView;
