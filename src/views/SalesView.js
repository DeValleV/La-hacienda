/** Gestiona el catálogo, el carrito y el cobro de la ventana de Ventas. */
class SalesView {
  constructor({ products, salesHistory, formatMoney, showToast, onSaleCompleted }) {
    this.products = products;
    this.salesHistory = salesHistory;
    this.formatMoney = formatMoney;
    this.showToast = showToast;
    this.onSaleCompleted = onSaleCompleted;
    this.cart = [];
    this.activeCategory = 'all';
    this.paymentWasEdited = false;
    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('product-grid').addEventListener('click', (event) => {
      // Ahora busca la tarjeta completa en lugar del botón
      const card = event.target.closest('[data-add]');
      if (card) this.addToCart(card.dataset.add);
    });
    document.getElementById('category-filters').addEventListener('click', (event) => {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      this.activeCategory = button.dataset.category;
      this.renderProductMenu();
    });
    
    document.getElementById('cart-items').addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.change) this.changeCartQuantity(button.dataset.change, button.dataset.delta);
      if (button.dataset.remove) this.removeFromCart(button.dataset.remove);
    });
    document.getElementById('cart-items').addEventListener('change', (event) => {
      const input = event.target.closest('[data-quantity]');
      if (input) this.setCartQuantity(input.dataset.quantity, input.value);
    });
    document.getElementById('clear-cart').onclick = () => this.clearCart();
    document.getElementById('checkout-options').addEventListener('click', (event) => {
      const button = event.target.closest('[data-checkout-type]');
      if (button) this.checkout(button.dataset.checkoutType);
    });
    document.getElementById('amount-paid').addEventListener('input', () => {
      this.paymentWasEdited = true;
      this.renderChange();
    });
    const moveCaretToEnd = (event) => {
      const input = event.target.closest('.numeric-input');
      if (!input || (event.type === 'click' && event.detail > 1)) return;
      requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
    };
    document.addEventListener('focusin', moveCaretToEnd);
    document.addEventListener('click', moveCaretToEnd);
    document.addEventListener('dblclick', (event) => {
      const input = event.target.closest('.numeric-input');
      if (input) input.select();
    });
    document.getElementById('payment-suggestions').addEventListener('click', (event) => {
      const button = event.target.closest('[data-payment]');
      if (!button) return;
      this.selectSuggestedPayment(button);
    });
    document.addEventListener('keydown', (event) => this.handlePaymentShortcut(event));
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
    // La base de datos no permite vender SKU inactivos o descontinuados.
    const sellableProducts = this.products.filter((product) => !product.status || product.status === 'activo');
    const categories = [...new Set(sellableProducts.map((product) => product.category))];
    if (this.activeCategory !== 'all' && !categories.includes(this.activeCategory)) {
      this.activeCategory = 'all';
    }

    document.getElementById('category-filters').innerHTML = [
      ['all', 'Todos'],
      ...categories.map((category) => [category, category]),
    ].map(([category, label]) => `
      <button type="button" class="category-filter${this.activeCategory === category ? ' active' : ''}" data-category="${category}" role="tab" aria-selected="${this.activeCategory === category}">${label}</button>`).join('');

    const createProductCard = (product) => `
      <article class="product-card" data-add="${product.id}" style="--product-color: ${product.color || '#ff6600'}; cursor: pointer;">
        <h3>${product.name}</h3>
        <footer>
          <small>${product.sku} · ${product.stock} disponibles</small>
          <strong>${this.formatMoney(product.price)}</strong>
        </footer>
      </article>`;

    const menu = document.getElementById('product-grid');
    if (this.activeCategory === 'all') {
      menu.classList.add('grouped-products');
      menu.innerHTML = categories.map((category) => {
        const categoryProducts = sellableProducts.filter((product) => product.category === category);
        return `<section class="product-category" aria-labelledby="category-${category}">
          <h3 id="category-${category}">${category}</h3>
          <div class="product-category-grid">${categoryProducts.map(createProductCard).join('')}</div>
        </section>`;
      }).join('');
      return;
    }

    menu.classList.remove('grouped-products');
    menu.innerHTML = sellableProducts
      .filter((product) => product.category === this.activeCategory)
      .map(createProductCard)
      .join('');
  }

  renderOrder() {
    const lines = this.getCartLines();
    document.getElementById('cart-items').innerHTML = lines.length
      ? lines.map(({ product, qty }) => `
        <div class="cart-item">
          <div class="cart-item-row">
            <span class="cart-item-name" title="${product.name}">${product.name}</span>
            <div class="quantity">
            <div class="quantity-stepper" aria-label="Cantidad de ${product.name}">
              <button type="button" data-change="${product.id}" data-delta="-1" aria-label="Reducir cantidad de ${product.name}">−</button>
              <input class="cart-quantity-input numeric-input" type="text" inputmode="numeric" pattern="[0-9]*" value="${qty}" data-quantity="${product.id}" aria-label="Cantidad de ${product.name}">
              <button type="button" data-change="${product.id}" data-delta="1" aria-label="Aumentar cantidad de ${product.name}">＋</button>
            </div>
            </div>
            <b>${this.formatMoney(product.price * qty)}</b>
            <button class="cart-item-remove" type="button" data-remove="${product.id}" aria-label="Eliminar ${product.name}">×</button>
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
    const denominations = [1, 2, 5, 10, 20, 50, 100, 200, 500];
    return denominations.filter((denomination) => denomination > total);
  }

  renderPaymentSuggestions(total) {
    document.getElementById('payment-suggestions').innerHTML = this.getSuggestedPayments(total)
      .map((amount, index) => `<button type="button" class="payment-suggestion" data-payment="${amount}" aria-keyshortcuts="${index + 1}" aria-label="${this.formatMoney(amount)}. Atajo ${index + 1}"><span class="payment-key">(${index + 1})</span><span>${this.formatMoney(amount)}</span></button>`)
      .join('');
  }

  selectSuggestedPayment(button) {
    document.getElementById('amount-paid').value = button.dataset.payment;
    this.paymentWasEdited = true;
    this.renderChange();
  }

  handlePaymentShortcut(event) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || document.querySelector('dialog[open]')) return;
    if (event.target.matches('input, textarea, select, [contenteditable="true"]')) return;

    const checkoutType = { j: 'COMEDOR', k: 'FACTURADA', l: 'PERSONAL' }[event.key.toLowerCase()];
    if (checkoutType) {
      event.preventDefault();
      this.checkout(checkoutType);
      return;
    }

    const shortcut = Number(event.key);
    if (!Number.isInteger(shortcut) || shortcut < 1) return;
    const button = document.querySelectorAll('#payment-suggestions [data-payment]')[shortcut - 1];
    if (!button) return;

    event.preventDefault();
    this.selectSuggestedPayment(button);
    button.focus();
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

  setCartQuantity(productId, quantity) {
    const line = this.cart.find((item) => item.id === Number(productId));
    const product = this.getProduct(productId);
    const parsedQuantity = Number.parseInt(quantity, 10);
    if (!line || !product || !Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      this.renderOrder();
      return;
    }
    line.qty = Math.min(parsedQuantity, product.stock);
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

  checkout(tipoVenta) {
    if (!this.cart.length) {
      this.showToast('Agregue al menos un producto al pedido.');
      return;
    }

    const lines = this.getCartLines();
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
