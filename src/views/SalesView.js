/** Gestiona el catálogo, el carrito y el cobro de la ventana de Ventas. */
class SalesView {
  constructor({ products, salesHistory, formatMoney, showToast, onSaleCompleted }) {
    this.products = products;
    this.salesHistory = salesHistory;
    this.formatMoney = formatMoney;
    this.showToast = showToast;
    this.onSaleCompleted = onSaleCompleted;
    this.cart = [];
    this.paymentWasEdited = false;
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
    document.getElementById('amount-paid').addEventListener('input', () => {
      this.paymentWasEdited = true;
      this.renderChange();
    });
    document.getElementById('payment-suggestions').addEventListener('click', (event) => {
      const button = event.target.closest('[data-payment]');
      if (!button) return;
      document.getElementById('amount-paid').value = button.dataset.payment;
      this.paymentWasEdited = true;
      this.renderChange();
    });
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
      <article class="product-card" data-add="${product.id}" style="--product-color: ${product.color || '#ff6600'}; cursor: pointer;">
        <h3>${product.name}</h3>
        <small>${product.sku} · ${product.stock} disponibles</small>
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

    const total = this.getTotal(lines);
    document.getElementById('total').textContent = this.formatMoney(total);

    const amountPaid = document.getElementById('amount-paid');
    if (!this.paymentWasEdited) amountPaid.value = total.toFixed(2);
    this.renderPaymentSuggestions(total);
    this.renderChange(total);
  }

  getTotal(lines = this.getCartLines()) {
    return lines.reduce((sum, line) => sum + line.product.price * line.qty, 0);
  }

  getAmountPaid() {
    return Number(document.getElementById('amount-paid').value);
  }

  getSuggestedPayments(total) {
    const denominations = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const suggestions = [total];

    denominations.filter((denomination) => denomination >= total).forEach((denomination) => {
      if (suggestions.length < 4 && !suggestions.includes(denomination)) suggestions.push(denomination);
    });

    let nextAmount = Math.ceil(total / 1000) * 1000;
    while (suggestions.length < 4) {
      if (!suggestions.includes(nextAmount)) suggestions.push(nextAmount);
      nextAmount += 1000;
    }
    return suggestions;
  }

  renderPaymentSuggestions(total) {
    document.getElementById('payment-suggestions').innerHTML = this.getSuggestedPayments(total)
      .map((amount) => `<button type="button" class="payment-suggestion" data-payment="${amount}">${this.formatMoney(amount)}</button>`)
      .join('');
  }

  renderChange(total = this.getTotal()) {
    const amountPaid = this.getAmountPaid();
    const change = Number.isFinite(amountPaid) ? Math.max(0, amountPaid - total) : 0;
    document.getElementById('change-amount').textContent = this.formatMoney(change);
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
    this.paymentWasEdited = false;
    this.renderOrder();
  }

  checkout() {
    if (!this.cart.length) {
      this.showToast('Agregue al menos un producto al pedido.');
      return;
    }

    const lines = this.getCartLines();
    const tipoVenta = document.querySelector('input[name="sale-type"]:checked').value;
    const total = this.getTotal(lines);
    const amountPaid = this.getAmountPaid();
    if (!Number.isFinite(amountPaid) || amountPaid < total) {
      this.showToast('La cantidad pagada debe cubrir el total de la venta.');
      return;
    }

    // Este objeto es el payload de la venta; incluye el tipo seleccionado al cobrar.
    const salePayload = {
      id: Date.now(),
      tipoVenta,
      total,
      amountPaid,
      change: amountPaid - total,
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
    this.paymentWasEdited = false;
    this.onSaleCompleted();
    this.showToast(`Venta ${tipoVenta.toLowerCase()} cobrada y existencias actualizadas.`);
  }
}

// Se expone la clase para que app.js pueda crear la ventana de ventas.
window.SalesView = SalesView;
