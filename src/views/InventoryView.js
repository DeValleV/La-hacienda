const LOW_STOCK_LIMIT = 10;

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
}

// Se expone la clase para que app.js pueda crear la ventana de inventario.
window.InventoryView = InventoryView;
