const LOW_STOCK_LIMIT = 10;
const PRODUCT_CARD_COLORS = [
  '#ff6600', '#e76f51', '#c44536', '#b94a48', '#a94442',
  '#d97706', '#e58c2b', '#c96a13', '#b86b1b', '#d95321',
  '#b7791f', '#c9953f', '#a77b35', '#8f6427', '#72511f',
  '#27765b', '#3a8d6d', '#4f9b78', '#648e5c', '#6d8b45',
  '#158c8c', '#1599a8', '#2e9eaa', '#367c8a', '#4d7379',
  '#3c6ead', '#4f7cac', '#577590', '#5d75a8', '#6b6fa7',
  '#7655a4', '#8c5fa8', '#9a6ba8', '#a06b86', '#8b5e7a',
  '#795548', '#8d6e63', '#9a6a4d', '#a86f48', '#6b5a50',
];

/** Gestiona la tabla y el diálogo de la ventana de Inventario. */
class InventoryView {
  constructor({ products, formatMoney, showToast, onSaveProduct, onRestockProduct, onBulkRestock, onDeactivateProduct, onActivateProduct }) {
    this.products = products;
    this.formatMoney = formatMoney;
    this.showToast = showToast;
    this.onSaveProduct = onSaveProduct;
    this.onRestockProduct = onRestockProduct;
    this.onBulkRestock = onBulkRestock;
    this.onDeactivateProduct = onDeactivateProduct;
    this.onActivateProduct = onActivateProduct;
    this.editingProductId = null;
    this.restockingProductId = null;
    this.extraCategories = [];
    this.extraBrands = [];
    this.searchTerm = '';
    this.activeCategory = 'all';
    this.statusFilter = 'activo';
    this.bindEvents();
  }

  setCatalogs(catalogs) {
    this.extraCategories = (catalogs.categories || []).map((item) => item.name);
    this.extraBrands = (catalogs.brands || []).map((item) => item.name);
  }

  bindEvents() {
    document.getElementById('inventory-body').addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;

      if (button.dataset.restock) this.openRestockDialog(button.dataset.restock);
      if (button.dataset.edit) this.openEditDialog(button.dataset.edit);
      if (button.dataset.delete) this.deleteProduct(button.dataset.delete);
      if (button.dataset.activate) this.activateProduct(button.dataset.activate);
    });

    document.getElementById('add-product').onclick = () => this.openNewProductDialog();
    document.getElementById('bulk-restock').onclick = () => this.openBulkRestockDialog();
    document.getElementById('save-product').onclick = (event) => this.saveProduct(event);
    document.getElementById('save-restock').onclick = (event) => this.saveRestock(event);
    document.getElementById('bulk-restock-form').addEventListener('submit', (event) => this.saveBulkRestock(event));
    document.getElementById('bulk-restock-list').addEventListener('input', () => this.updateBulkRestockSummary());
    document.getElementById('add-category').onclick = () => this.toggleNewCategoryField();
    document.getElementById('confirm-category').onclick = () => this.addCategory();
    document.getElementById('add-brand').onclick = () => this.toggleNewCatalogField('brand');
    document.getElementById('confirm-brand').onclick = () => this.addCatalogOption('brand');
    document.getElementById('open-color-palette').onclick = () => this.openColorPalette();
    document.getElementById('color-options').addEventListener('click', (event) => {
      const colorOption = event.target.closest('[data-color]');
      if (colorOption) this.selectCardColor(colorOption.dataset.color);
    });
    document.getElementById('inventory-search').addEventListener('input', (event) => {
      this.searchTerm = event.target.value.trim().toLocaleLowerCase();
      this.render();
    });
    document.getElementById('inventory-category').addEventListener('change', (event) => {
      this.activeCategory = event.target.value;
      this.render();
    });
    document.getElementById('inventory-status').addEventListener('change', (event) => {
      this.statusFilter = event.target.value;
      this.render();
    });
  }

  isLowStock(product) {
    return product.stock <= (product.minStock ?? LOW_STOCK_LIMIT);
  }

  stockLevel(product) {
    if (product.stock === 0) return { label: 'Sin existencias', className: 'low' };
    if (this.isLowStock(product)) return { label: 'Stock bajo', className: 'low' };
    return { label: 'Disponible', className: 'ok' };
  }

  render() {
    const categories = [...new Set(this.products.map((product) => product.category))].sort();
    const categorySelect = document.getElementById('inventory-category');
    categorySelect.replaceChildren(...[['all', 'Todas las categorías'], ...categories.map((category) => [category, category])].map(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      return option;
    }));
    categorySelect.value = categories.includes(this.activeCategory) ? this.activeCategory : 'all';
    this.activeCategory = categorySelect.value;
    const statusSelect = document.getElementById('inventory-status');
    statusSelect.value = ['activo', 'inactivo', 'all'].includes(this.statusFilter) ? this.statusFilter : 'activo';
    this.statusFilter = statusSelect.value;
    const filteredProducts = this.products.filter((product) => {
      const matchesCategory = this.activeCategory === 'all' || product.category === this.activeCategory;
      const matchesSearch = !this.searchTerm || product.name.toLocaleLowerCase().includes(this.searchTerm) || String(product.id).includes(this.searchTerm);
      const matchesStatus = this.statusFilter === 'all' || product.status === this.statusFilter;
      return matchesCategory && matchesSearch && matchesStatus;
    });
    const inventoryBody = document.getElementById('inventory-body');
    inventoryBody.innerHTML = filteredProducts.length ? filteredProducts.map((product) => {
      const level = this.stockLevel(product);

      return `
        <tr>
          <td>${escapeHtml(product.name)}</td>
          <td class="product-id">${product.id}</td>
          <td>${escapeHtml(product.category)}</td>
          <td>${this.formatMoney(product.price)}</td>
          <td>${product.stock} unidades</td>
          <td><span class="badge ${level.className}">${level.label}</span></td>
          <td class="product-actions">
            <button class="row-action" data-restock="${product.id}">Reponer</button>
            <button class="row-action" data-edit="${product.id}">Editar</button>
            ${product.status === 'activo'
              ? `<button class="row-action delete-action" data-delete="${product.id}">Desactivar</button>`
              : `<button class="row-action" data-activate="${product.id}">Activar</button>`}
          </td>
        </tr>`;
    }).join('') : '<tr><td colspan="7" class="muted">No hay productos que coincidan con los filtros.</td></tr>';

    document.getElementById('product-count').textContent = this.products.filter((product) => product.status === 'activo').length;
    document.getElementById('low-stock').textContent = this.products.filter(
      (product) => product.status === 'activo' && this.isLowStock(product),
    ).length;
    document.getElementById('inventory-value').textContent = this.formatMoney(
      this.products
        .filter((product) => product.status === 'activo')
        .reduce((total, product) => total + product.price * product.stock, 0),
    );
  }

  openRestockDialog(productId) {
    const product = this.products.find((item) => item.id === Number(productId));
    if (!product) return;

    this.restockingProductId = product.id;
    document.getElementById('restock-product-name').textContent = product.name;
    document.getElementById('restock-quantity').value = '';
    document.getElementById('restock-dialog').showModal();
  }

  async saveRestock(event) {
    event.preventDefault();
    const submit = event.currentTarget;
    const quantityInput = document.getElementById('restock-quantity');
    const quantity = Number(quantityInput.value);
    const product = this.products.find((item) => item.id === this.restockingProductId);

    if (!product || !Number.isInteger(quantity) || quantity < 1) {
      this.showToast('Ingrese una cantidad válida mayor a cero.');
      return;
    }

    submit.disabled = true;
    try {
      await this.onRestockProduct(product.id, quantity);
      document.getElementById('restock-dialog').close();
      this.showToast(`${product.name}: ${quantity} unidades agregadas.`);
    } catch (error) {
      this.showToast(error.message);
    } finally {
      submit.disabled = false;
    }
  }

  openBulkRestockDialog() {
    const list = document.getElementById('bulk-restock-list');
    const sortedProducts = [...this.products].sort((first, second) => first.name.localeCompare(second.name, 'es'));
    list.innerHTML = sortedProducts.length ? sortedProducts.map((product) => `
      <tr>
        <td><strong>${escapeHtml(product.name)}</strong><br><small class="muted">ID ${product.id}${product.status !== 'activo' ? ' · No disponible para venta' : ''}</small></td>
        <td>${product.stock} unidades</td>
        <td><input class="bulk-restock-input" data-product-id="${product.id}" type="number" min="0" step="1" value="0" inputmode="numeric" aria-label="Unidades a agregar para ${escapeHtml(product.name)}"></td>
      </tr>
    `).join('') : '<tr><td colspan="3" class="muted">No hay productos registrados para reponer.</td></tr>';
    this.updateBulkRestockSummary();
    document.getElementById('bulk-restock-dialog').showModal();
  }

  updateBulkRestockSummary() {
    const values = [...document.querySelectorAll('.bulk-restock-input')].map((input) => Number(input.value));
    const invalid = values.some((quantity) => !Number.isInteger(quantity) || quantity < 0);
    const selected = values.filter((quantity) => Number.isInteger(quantity) && quantity > 0);
    const summary = document.getElementById('bulk-restock-summary');
    if (invalid) {
      summary.textContent = 'Cada cantidad debe ser un número entero igual o mayor que 0.';
      return;
    }
    if (!selected.length) {
      summary.textContent = 'Aún no hay productos seleccionados.';
      return;
    }
    summary.textContent = `Se agregarán ${selected.reduce((total, quantity) => total + quantity, 0)} unidades en ${selected.length} producto${selected.length === 1 ? '' : 's'}.`;
  }

  async saveBulkRestock(event) {
    event.preventDefault();
    const inputs = [...document.querySelectorAll('.bulk-restock-input')];
    const items = inputs.map((input) => ({ productId: Number(input.dataset.productId), quantity: Number(input.value) }));
    if (items.some(({ productId, quantity }) => !Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 0)) {
      this.showToast('Revise las cantidades: deben ser números enteros iguales o mayores que 0.');
      return;
    }
    const selectedItems = items.filter(({ quantity }) => quantity > 0);
    if (!selectedItems.length) {
      this.showToast('Escriba una cantidad mayor que 0 en al menos un producto.');
      return;
    }

    const submit = document.getElementById('save-bulk-restock');
    submit.disabled = true;
    try {
      await this.onBulkRestock(selectedItems);
      document.getElementById('bulk-restock-dialog').close();
      const total = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
      this.showToast(`Inventario repuesto: ${total} unidades en ${selectedItems.length} producto${selectedItems.length === 1 ? '' : 's'}.`);
    } catch (error) {
      this.showToast(error.message);
    } finally {
      submit.disabled = false;
    }
  }

  openNewProductDialog() {
    this.editingProductId = null;
    document.querySelector('#product-dialog h2').textContent = 'Nuevo producto';
    document.getElementById('save-product').textContent = 'Guardar producto';
    this.populateProductFields();
    document.querySelector('#product-dialog form').reset();
    document.getElementById('new-min-stock').value = 0;
    this.updateColorPreview();
    this.hideNewCategoryField();
    this.hideNewCatalogField('brand');
    document.getElementById('product-dialog').showModal();
  }

  openEditDialog(productId) {
    const product = this.products.find((item) => item.id === Number(productId));
    if (!product) return;

    this.editingProductId = product.id;
    document.querySelector('#product-dialog h2').textContent = 'Editar producto';
    document.getElementById('save-product').textContent = 'Guardar cambios';
    this.populateProductFields(product);
    document.getElementById('new-category').value = product.category;
    document.getElementById('new-brand').value = product.brand || '';
    document.getElementById('new-name').value = product.name;
    document.getElementById('new-price').value = product.price;
    document.getElementById('new-stock').value = product.stock;
    document.getElementById('new-min-stock').value = product.minStock ?? 0;
    document.getElementById('new-color').value = product.color || '#ff6600';
    this.updateColorPreview();
    this.hideNewCategoryField();
    this.hideNewCatalogField('brand');
    document.getElementById('product-dialog').showModal();
  }

  async deleteProduct(productId) {
    const product = this.products.find((item) => item.id === Number(productId));
    if (!product || product.status !== 'activo') return;

    if (!window.confirm(`¿Desea desactivar "${product.name}"? Dejará de estar disponible para nuevas ventas.`)) return;

    try {
      await this.onDeactivateProduct(product.id);
      this.showToast('Producto desactivado.');
    } catch (error) {
      this.showToast(error.message);
    }
  }

  async activateProduct(productId) {
    const product = this.products.find((item) => item.id === Number(productId));
    if (!product || product.status === 'activo') return;
    try {
      await this.onActivateProduct(product.id);
      this.showToast('Producto activado. Ya puede volver a venderse.');
    } catch (error) {
      this.showToast(error.message);
    }
  }

  async saveProduct(event) {
    event.preventDefault();
    const submit = event.currentTarget;
    const category = document.getElementById('new-category').value;
    const brand = document.getElementById('new-brand').value;
    const name = document.getElementById('new-name').value;
    const price = Number(document.getElementById('new-price').value);
    const stock = Number(document.getElementById('new-stock').value);
    const minStock = Number(document.getElementById('new-min-stock').value);
    const color = document.getElementById('new-color').value;

    if (!category) return this.showToast('Seleccione una categoría para el producto.');
    if (!brand) return this.showToast('Seleccione una marca para el producto.');
    if (!name.trim()) return this.showToast('Escriba el nombre del producto.');
    if (!Number.isFinite(price) || price < 0) return this.showToast('Escriba un precio válido, igual o mayor que 0.');
    if (!Number.isInteger(stock) || stock < 0) return this.showToast('Las existencias deben ser un número entero igual o mayor que 0.');
    if (!Number.isInteger(minStock) || minStock < 0) return this.showToast('El stock mínimo debe ser un número entero igual o mayor que 0.');

    const editingProduct = this.products.find((item) => item.id === this.editingProductId);
    submit.disabled = true;
    try {
      await this.onSaveProduct({ category, brand, name, price, stock, minStock, color }, editingProduct?.id);
      document.getElementById('product-dialog').close();
      this.showToast(editingProduct ? 'Producto actualizado.' : 'Producto agregado al inventario.');
    } catch (error) {
      this.showToast(error.message);
    } finally {
      submit.disabled = false;
    }
  }

  populateProductFields(product = null) {
    const categories = [...new Set([...this.products.map((item) => item.category), ...this.extraCategories])];
    const brands = [...new Set([...this.products.map((item) => item.brand).filter(Boolean), ...this.extraBrands])];
    this.setSelectOptions('new-category', categories, product?.category);
    this.setSelectOptions('new-brand', brands, product?.brand);
  }

  setSelectOptions(selectId, options, selectedValue) {
    const select = document.getElementById(selectId);
    select.replaceChildren(...options.map((option) => {
      const element = document.createElement('option');
      element.value = option;
      element.textContent = option;
      return element;
    }));
    if (selectedValue) select.value = selectedValue;
  }

  toggleNewCategoryField() {
    const field = document.getElementById('new-category-field');
    field.hidden = !field.hidden;
    if (!field.hidden) document.getElementById('new-category-name').focus();
  }

  hideNewCategoryField() {
    document.getElementById('new-category-field').hidden = true;
    document.getElementById('new-category-name').value = '';
  }

  addCategory() {
    this.addCatalogOption('category');
  }

  toggleNewCatalogField(catalog) {
    const field = document.getElementById(`new-${catalog}-field`);
    field.hidden = !field.hidden;
    if (!field.hidden) document.getElementById(`new-${catalog}-name`).focus();
  }

  hideNewCatalogField(catalog) {
    document.getElementById(`new-${catalog}-field`).hidden = true;
    document.getElementById(`new-${catalog}-name`).value = '';
  }

  addCatalogOption(catalog) {
    const input = document.getElementById(`new-${catalog}-name`);
    const name = input.value.trim();
    const config = {
      category: { property: 'category', extras: this.extraCategories, label: 'categoría' },
      brand: { property: 'brand', extras: this.extraBrands, label: 'marca' },
    }[catalog];
    const existingOptions = [...this.products.map((item) => item[config.property]).filter(Boolean), ...config.extras];
    if (!name) {
      this.showToast(`Escriba el nombre de la ${config.label}.`);
      input.focus();
      return;
    }
    if (existingOptions.some((option) => option.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      this.showToast(`Esa ${config.label} ya existe.`);
      input.focus();
      return;
    }
    config.extras.push(name);
    this.populateProductFields();
    document.getElementById(`new-${catalog}`).value = name;
    this.hideNewCatalogField(catalog);
  }

  openColorPalette() {
    const selectedColor = document.getElementById('new-color').value;
    document.getElementById('color-options').replaceChildren(...PRODUCT_CARD_COLORS.map((color) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'color-option';
      option.dataset.color = color;
      option.style.setProperty('--swatch-color', color);
      option.setAttribute('aria-label', `Seleccionar color ${color}`);
      option.setAttribute('aria-pressed', String(color === selectedColor));
      if (color === selectedColor) option.classList.add('selected');
      return option;
    }));
    document.getElementById('color-palette-dialog').showModal();
  }

  selectCardColor(color) {
    document.getElementById('new-color').value = color;
    this.updateColorPreview();
    document.getElementById('color-palette-dialog').close();
  }

  updateColorPreview() {
    const color = document.getElementById('new-color').value || '#ff6600';
    const trigger = document.getElementById('open-color-palette');
    trigger.style.setProperty('--selected-color', color);
    trigger.setAttribute('aria-label', `Elegir color de la tarjeta, color actual ${color}`);
  }
}

// Se expone la clase para que app.js pueda crear la ventana de inventario.
window.InventoryView = InventoryView;
