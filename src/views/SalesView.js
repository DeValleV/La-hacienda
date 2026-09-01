/** Gestiona el catálogo, el carrito y el cobro de la ventana de Ventas. */
class SalesView {
  constructor({ products, salesHistory, formatMoney, showToast, onSaleCompleted }) {
    this.products = products;
    this.salesHistory = salesHistory;
    this.formatMoney = formatMoney;
    this.showToast = showToast;
    this.onSaleCompleted = onSaleCompleted;
    this.cart = [];
    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('product-grid').addEventListener('click', (event) => {
      // Ahora busca la tarjeta completa en lugar del botón
      const card = event.target.closest('[data-add]');
      if (card) this.addToCart(card.dataset.add);
    });
    
    document.getElementById('cart-items').addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.change) this.changeCartQuantity(button.dataset.change, button.dataset.delta);
      if (button.dataset.remove) this.removeFromCart(button.dataset.remove);
    });
    document.getElementById('clear-cart').onclick = () => this.clearCart();
    document.getElementById('checkout').onclick = () => this.checkout();
  }

  getProduct(productId) {
    return this.products.find((product) => product.id === Number(productId));
  }

  getCartLines() {
    return this.cart
      .map((line) => ({ ...line, product: this.getProduct(line.id) }))
      .filter((line) => line.product);
  }

  render() {
    this.renderProductMenu();
    this.renderOrder();
  }

  renderProductMenu() {
    document.getElementById('product-grid').innerHTML = this.products.map((product) => `
      <article class="product-card" data-add="${product.id}" style="cursor: pointer;">
        <span class="icon-box">${product.icon}</span>
        <h3>${product.name}</h3>
        <small>Código del producto: ${product.sku} · ${product.stock} disponibles</small>
        <footer>
          <strong>${this.formatMoney(product.price)}</strong>
        </footer>
      </article>`).join('');
  }

  renderOrder() {
    const lines = this.getCartLines();
    document.getElementById('cart-items').innerHTML = lines.length
      ? lines.map(({ product, qty }) => `
        <div class="cart-item">
          <header>
            <span>${product.name}</span>
            <button data-remove="${product.id}">×</button>
          </header>
          <div class="quantity">
            <button data-change="${product.id}" data-delta="-1">−</button>
            <span>${qty}</span>
            <button data-change="${product.id}" data-delta="1">＋</button>
            <b>${this.formatMoney(product.price * qty)}</b>
          </div>
        </div>`).join('')
      : '<p class="muted">Aún no hay productos en el pedido.</p>';

    const total = lines.reduce((sum, line) => sum + line.product.price * line.qty, 0);
    document.getElementById('total').textContent = this.formatMoney(total);
  }

  addToCart(productId) {
    const product = this.getProduct(productId);
    if (!product) return;
    const line = this.cart.find((item) => item.id === product.id);
    if (product.stock <= (line?.qty || 0)) {
      this.showToast('No hay más existencias disponibles.');
      return;
    }

    if (line) line.qty += 1;
    else this.cart.push({ id: product.id, qty: 1 });
    this.renderOrder();
  }

  changeCartQuantity(productId, delta) {
    const line = this.cart.find((item) => item.id === Number(productId));
    if (!line) return;
    line.qty += Number(delta);
    if (line.qty < 1) this.cart = this.cart.filter((item) => item !== line);
    this.renderOrder();
  }

  removeFromCart(productId) {
    this.cart = this.cart.filter((item) => item.id !== Number(productId));
    this.renderOrder();
  }

  clearCart() {
    this.cart = [];
    this.renderOrder();
  }

  checkout() {
    if (!this.cart.length) {
      this.showToast('Agregue al menos un producto al pedido.');
      return;
    }

    const lines = this.getCartLines();
    const tipoVenta = document.getElementById('sale-type').value;
    const total = lines.reduce((sum, line) => sum + line.product.price * line.qty, 0);

    // Este objeto es el payload de la venta; incluye el tipo seleccionado al cobrar.
    const salePayload = {
      id: Date.now(),
      tipoVenta,
      total,
      lines: lines.map(({ product, qty }) => ({
        productId: product.id,
        productName: product.name,
        price: product.price,
        qty,
      })),
    };

    this.cart.forEach((line) => {
      const product = this.getProduct(line.id);
      product.stock -= line.qty;
    });
    this.salesHistory.push(salePayload);
    this.cart = [];
    this.onSaleCompleted();
    this.showToast(`Venta ${tipoVenta.toLowerCase()} cobrada y existencias actualizadas.`);
  }
}

// Se expone la clase para que app.js pueda crear la ventana de ventas.
window.SalesView = SalesView;
