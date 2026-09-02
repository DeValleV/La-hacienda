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
  }

  isLowStock(product) {
    return product.stock <= LOW_STOCK_LIMIT;
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
    document.querySelector('#product-dialog form').reset();
    document.getElementById('product-dialog').showModal();
  }

  openEditDialog(productId) {
    const product = this.products.find((item) => item.id === Number(productId));
    if (!product) return;

    this.editingProductId = product.id;
    document.querySelector('#product-dialog h2').textContent = 'Editar producto';
    document.getElementById('save-product').textContent = 'Guardar cambios';
    document.getElementById('new-name').value = product.name;
    document.getElementById('new-sku').value = product.sku;
    document.getElementById('new-price').value = product.price;
    document.getElementById('new-stock').value = product.stock;
    document.getElementById('new-color').value = product.color || '#ff6600';
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
    const name = document.getElementById('new-name').value;
    const sku = document.getElementById('new-sku').value;
    const price = Number(document.getElementById('new-price').value);
    const stock = Number(document.getElementById('new-stock').value);
    const color = document.getElementById('new-color').value;

    // Evita cerrar el diálogo cuando los datos ingresados no son válidos.
    if (!name || !sku || Number.isNaN(price) || Number.isNaN(stock)) {
      event.preventDefault();
      this.showToast('Complete todos los campos del producto.');
      return;
    }

    const editingProduct = this.products.find((item) => item.id === this.editingProductId);
    if (editingProduct) {
      editingProduct.name = name;
      editingProduct.sku = sku;
      editingProduct.price = price;
      editingProduct.stock = stock;
      editingProduct.color = color;
    } else {
      this.products.push({
        id: Date.now(), name, sku, category: 'General', price, stock, color,
      });
    }

    this.onProductsChanged();
    this.showToast(editingProduct ? 'Producto actualizado.' : 'Producto agregado al inventario.');
  }
}

// Se expone la clase para que app.js pueda crear la ventana de inventario.
window.InventoryView = InventoryView;
