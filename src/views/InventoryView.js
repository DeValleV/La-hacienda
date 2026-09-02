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
  constructor({ products, formatMoney, showToast, onProductsChanged }) {
    this.products = products;
    this.formatMoney = formatMoney;
    this.showToast = showToast;
    this.onProductsChanged = onProductsChanged;
    this.editingProductId = null;
    this.restockingProductId = null;
    this.extraCategories = [];
    this.extraBrands = [];
    this.extraUnits = [];
    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('inventory-body').addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;

      if (button.dataset.restock) this.openRestockDialog(button.dataset.restock);
      if (button.dataset.edit) this.openEditDialog(button.dataset.edit);
      if (button.dataset.delete) this.deleteProduct(button.dataset.delete);
    });

    document.getElementById('add-product').onclick = () => this.openNewProductDialog();
    document.getElementById('save-product').onclick = (event) => this.saveProduct(event);
    document.getElementById('save-restock').onclick = (event) => this.saveRestock(event);
    document.getElementById('add-category').onclick = () => this.toggleNewCategoryField();
    document.getElementById('confirm-category').onclick = () => this.addCategory();
    document.getElementById('add-brand').onclick = () => this.toggleNewCatalogField('brand');
    document.getElementById('confirm-brand').onclick = () => this.addCatalogOption('brand');
    document.getElementById('add-unit').onclick = () => this.toggleNewCatalogField('unit');
    document.getElementById('confirm-unit').onclick = () => this.addCatalogOption('unit');
    document.getElementById('open-color-palette').onclick = () => this.openColorPalette();
    document.getElementById('color-options').addEventListener('click', (event) => {
      const colorOption = event.target.closest('[data-color]');
      if (colorOption) this.selectCardColor(colorOption.dataset.color);
    });
  }

  isLowStock(product) {
    return product.stock <= (product.minStock ?? LOW_STOCK_LIMIT);
  }

  render() {
    const inventoryBody = document.getElementById('inventory-body');
    inventoryBody.innerHTML = this.products.map((product) => {
      const stockStatus = this.isLowStock(product) ? 'Stock bajo' : 'Disponible';
      const statusClass = this.isLowStock(product) ? 'low' : 'ok';

      return `
        <tr>
          <td>${product.name}</td>
          <td class="sku">${product.sku}</td>
          <td>${product.category}</td>
          <td>${this.formatMoney(product.price)}</td>
          <td>${product.stock} unidades</td>
          <td><span class="badge ${statusClass}">${stockStatus}</span></td>
          <td class="product-actions">
            <button class="row-action" data-restock="${product.id}">Reponer</button>
            <button class="row-action" data-edit="${product.id}">Editar</button>
            <button class="row-action delete-action" data-delete="${product.id}">Borrar</button>
          </td>
        </tr>`;
    }).join('');

    document.getElementById('product-count').textContent = this.products.length;
    document.getElementById('low-stock').textContent = this.products.filter(
      (product) => this.isLowStock(product),
    ).length;
  }

  openRestockDialog(productId) {
    const product = this.products.find((item) => item.id === Number(productId));
    if (!product) return;

    this.restockingProductId = product.id;
    document.getElementById('restock-product-name').textContent = product.name;
    document.getElementById('restock-quantity').value = '';
    document.getElementById('restock-dialog').showModal();
  }

  saveRestock(event) {
    const quantityInput = document.getElementById('restock-quantity');
    const quantity = Number(quantityInput.value);
    const product = this.products.find((item) => item.id === this.restockingProductId);

    if (!product || !Number.isInteger(quantity) || quantity < 1) {
      event.preventDefault();
      this.showToast('Ingrese una cantidad válida mayor a cero.');
      return;
    }

    product.stock += quantity;
    this.onProductsChanged();
    this.showToast(`${product.name}: ${quantity} unidades agregadas.`);
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
    this.hideNewCatalogField('unit');
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
    document.getElementById('new-sku').value = product.sku;
    document.getElementById('new-unit').value = product.unit || '';
    document.getElementById('new-status').value = product.status || 'activo';
    document.getElementById('new-price').value = product.price;
    document.getElementById('new-stock').value = product.stock;
    document.getElementById('new-min-stock').value = product.minStock ?? 0;
    document.getElementById('new-color').value = product.color || '#ff6600';
    this.updateColorPreview();
    this.hideNewCategoryField();
    this.hideNewCatalogField('brand');
    this.hideNewCatalogField('unit');
    document.getElementById('product-dialog').showModal();
  }

  deleteProduct(productId) {
    const productIndex = this.products.findIndex((item) => item.id === Number(productId));
    if (productIndex === -1) return;

    const product = this.products[productIndex];
    if (!window.confirm(`¿Desea borrar "${product.name}" del inventario?`)) return;

    this.products.splice(productIndex, 1);
    this.onProductsChanged();
    this.showToast('Producto eliminado del inventario.');
  }

  saveProduct(event) {
    const category = document.getElementById('new-category').value;
    const brand = document.getElementById('new-brand').value;
    const name = document.getElementById('new-name').value;
    const sku = document.getElementById('new-sku').value;
    const unit = document.getElementById('new-unit').value;
    const status = document.getElementById('new-status').value;
    const price = Number(document.getElementById('new-price').value);
    const stock = Number(document.getElementById('new-stock').value);
    const minStock = Number(document.getElementById('new-min-stock').value);
    const color = document.getElementById('new-color').value;

    // Evita cerrar el diálogo cuando los datos ingresados no son válidos.
    if (!category || !brand || !name || !sku || !unit || !status || [price, stock, minStock].some((value) => !Number.isFinite(value) || value < 0)) {
      event.preventDefault();
      this.showToast('Complete todos los campos del producto.');
      return;
    }

    const repeatedSku = this.products.find((product) => product.sku === sku && product.id !== this.editingProductId);
    if (repeatedSku) {
      event.preventDefault();
      this.showToast('El código SKU ya está registrado.');
      return;
    }

    const editingProduct = this.products.find((item) => item.id === this.editingProductId);
    if (editingProduct) {
      editingProduct.category = category;
      editingProduct.brand = brand;
      editingProduct.name = name;
      editingProduct.sku = sku;
      editingProduct.unit = unit;
      editingProduct.status = status;
      editingProduct.price = price;
      editingProduct.stock = stock;
      editingProduct.minStock = minStock;
      editingProduct.color = color;
    } else {
      this.products.push({
        id: Date.now(), category, brand, name, sku, unit, status, price, stock, minStock, color,
      });
    }

    this.onProductsChanged();
    this.showToast(editingProduct ? 'Producto actualizado.' : 'Producto agregado al inventario.');
  }

  populateProductFields(product = null) {
    const categories = [...new Set([...this.products.map((item) => item.category), ...this.extraCategories])];
    const brands = [...new Set([...this.products.map((item) => item.brand).filter(Boolean), ...this.extraBrands])];
    const units = [...new Set([...this.products.map((item) => item.unit).filter(Boolean), 'pieza', 'kg', 'L', ...this.extraUnits])];
    const statuses = ['activo', 'inactivo', 'descontinuado'];
    this.setSelectOptions('new-category', categories, product?.category);
    this.setSelectOptions('new-brand', brands, product?.brand);
    this.setSelectOptions('new-unit', units, product?.unit);
    this.setSelectOptions('new-status', statuses, product?.status || 'activo');
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
      unit: { property: 'unit', extras: this.extraUnits, label: 'unidad de medida' },
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
