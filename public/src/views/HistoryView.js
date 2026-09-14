class HistoryView {
  constructor({ formatMoney, onDateChange, onMonthChange }) {
    this.formatMoney = formatMoney;
    this.onDateChange = onDateChange;
    this.onMonthChange = onMonthChange;
    this.months = [];
    this.daysByMonth = new Map();
    this.calendarMonth = null;
    this.selectedDate = null;
    this.daySales = [];
    this.dayShifts = [];
    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('history-date-picker').addEventListener('click', () => this.openCalendar());
    document.getElementById('history-calendar-previous').addEventListener('click', () => this.changeCalendarMonth(-1));
    document.getElementById('history-calendar-next').addEventListener('click', () => this.changeCalendarMonth(1));
    document.getElementById('history-calendar-days').addEventListener('click', (event) => {
      const button = event.target.closest('[data-history-date]');
      if (button && !button.disabled) this.selectDate(button.dataset.historyDate);
    });
  }

  setMonths(months) {
    this.months = [...months].sort((first, second) => String(second.month).localeCompare(String(first.month)));
    if (!this.months.some((entry) => entry.month === this.calendarMonth)) this.calendarMonth = this.months[0]?.month || this.currentMonth();
    this.renderCalendar();
  }

  setDays(month, days) {
    this.daysByMonth.set(month, days);
    this.renderCalendar();
  }

  setSelectedDate(date) {
    this.selectedDate = date;
    this.calendarMonth = date.slice(0, 7);
    this.daySales = [];
    this.dayShifts = [];
    this.render();
    this.renderCalendar();
  }

  setDaySales(sales, shifts = []) {
    this.daySales = sales;
    this.dayShifts = shifts;
    this.render();
  }

  reset() {
    this.months = [];
    this.daysByMonth.clear();
    this.calendarMonth = null;
    this.selectedDate = null;
    this.daySales = [];
    this.dayShifts = [];
    this.render();
    this.renderCalendar();
  }

  async openCalendar() {
    if (!this.calendarMonth) this.calendarMonth = this.months[0]?.month || this.currentMonth();
    await this.ensureMonthLoaded(this.calendarMonth);
    this.renderCalendar();
    document.getElementById('history-calendar-dialog').showModal();
  }

  async changeCalendarMonth(delta) {
    const index = this.months.findIndex((entry) => entry.month === this.calendarMonth);
    const next = this.months[index + delta];
    if (!next) return;
    this.calendarMonth = next.month;
    await this.ensureMonthLoaded(this.calendarMonth);
    this.renderCalendar();
  }

  async ensureMonthLoaded(month) {
    if (this.daysByMonth.has(month)) return;
    try {
      await this.onMonthChange(month);
    } catch {
      // La aplicación muestra el error traducido; el calendario queda en su estado anterior.
    }
  }

  async selectDate(date) {
    this.setSelectedDate(date);
    document.getElementById('history-calendar-dialog').close();
    try {
      await this.onDateChange(date);
    } catch {
      // La aplicación muestra el error traducido.
    }
  }

  renderCalendar() {
    const title = document.getElementById('history-calendar-month');
    const grid = document.getElementById('history-calendar-days');
    const previous = document.getElementById('history-calendar-previous');
    const next = document.getElementById('history-calendar-next');
    const month = this.calendarMonth;
    if (!month) {
      title.textContent = 'Sin ventas registradas';
      grid.replaceChildren();
      previous.disabled = true;
      next.disabled = true;
      return;
    }
    title.textContent = this.formatMonth(month);
    const currentIndex = this.months.findIndex((entry) => entry.month === month);
    previous.disabled = currentIndex < 1;
    next.disabled = currentIndex < 0 || currentIndex >= this.months.length - 1;
    const availableDates = new Set((this.daysByMonth.get(month) || []).map((entry) => entry.date));
    const [year, monthNumber] = month.split('-').map(Number);
    const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const mondayFirstOffset = (firstDay.getUTCDay() + 6) % 7;
    const cells = [];
    for (let index = 0; index < mondayFirstOffset; index += 1) cells.push(this.emptyCalendarCell());
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${month}-${String(day).padStart(2, '0')}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-day';
      button.textContent = day;
      button.dataset.historyDate = date;
      button.disabled = !availableDates.has(date);
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-label', `${this.formatDay(date)}${button.disabled ? ', sin ventas' : ''}`);
      if (date === this.selectedDate) button.classList.add('selected');
      cells.push(button);
    }
    grid.replaceChildren(...cells);
  }

  emptyCalendarCell() {
    const cell = document.createElement('span');
    cell.className = 'calendar-day empty';
    cell.setAttribute('aria-hidden', 'true');
    return cell;
  }

  render() {
    const picker = document.getElementById('history-date-picker');
    const period = document.getElementById('history-period');
    if (!this.selectedDate) {
      picker.textContent = 'Seleccionar día';
      period.textContent = 'Seleccione un día para consultar todos los turnos de la sucursal.';
      this.renderStats([]);
      document.getElementById('history-shifts').innerHTML = '<div class="panel history-empty muted">No hay un día seleccionado.</div>';
      return;
    }
    picker.textContent = this.formatDay(this.selectedDate);
    period.textContent = `Todos los turnos registrados el ${this.formatDay(this.selectedDate)} en esta sucursal.`;
    this.renderStats(this.daySales);
    this.renderShifts();
  }

  renderStats(sales) {
    const total = sales.reduce((sum, sale) => sum + sale.total, 0);
    const portions = sales.reduce((sum, sale) => sum + sale.lines.reduce((lineSum, line) => lineSum + line.qty, 0), 0);
    const shifts = this.dayShifts.length || new Set(sales.map((sale) => sale.turnId)).size;
    document.getElementById('history-day-stats').innerHTML = `
      <article><span>Total del día</span><strong>${this.formatMoney(total)}</strong><small>${sales.length} venta${sales.length === 1 ? '' : 's'} registradas</small></article>
      <article><span>Turnos</span><strong>${shifts}</strong><small>Turnos con ventas</small></article>
      <article><span>Porciones vendidas</span><strong>${portions}</strong><small>Productos cobrados</small></article>
      <article><span>Promedio por venta</span><strong>${sales.length ? this.formatMoney(total / sales.length) : this.formatMoney(0)}</strong><small>Importe promedio</small></article>`;
  }

  renderShifts() {
    const container = document.getElementById('history-shifts');
    if (!this.daySales.length) {
      container.innerHTML = '<div class="panel history-empty muted">No hay ventas registradas durante este día.</div>';
      return;
    }
    const groups = new Map(this.dayShifts.map((shift) => [shift.id, { shift, sales: [] }]));
    this.daySales.forEach((sale) => {
      if (!groups.has(sale.turnId)) groups.set(sale.turnId, { shift: { id: sale.turnId, openedAt: sale.date, closedAt: null, status: 'cerrado' }, sales: [] });
      groups.get(sale.turnId).sales.push(sale);
    });
    container.innerHTML = [...groups.entries()].sort(([, first], [, second]) => new Date(first.shift.openedAt) - new Date(second.shift.openedAt)).map(([turnId, group]) => {
      const { shift, sales } = group;
      const total = sales.reduce((sum, sale) => sum + sale.total, 0);
      const portions = sales.reduce((sum, sale) => sum + sale.lines.reduce((lineSum, line) => lineSum + line.qty, 0), 0);
      const firstTime = this.formatTime(shift.openedAt);
      const lastTime = shift.closedAt ? this.formatTime(shift.closedAt) : 'abierto';
      return `<details class="panel history-shift" open>
        <summary><div><strong>Turno #${turnId}</strong><span class="muted">De ${firstTime} a ${lastTime}</span></div><div class="shift-quick-stats"><span>${sales.length} ventas</span><span>${portions} porciones</span><strong>${this.formatMoney(total)}</strong></div></summary>
        <div class="table-wrap"><table><thead><tr><th>HORA</th><th>USUARIO</th><th>TIPO</th><th>PRODUCTOS Y CANTIDADES</th><th>TOTAL</th></tr></thead><tbody>
          ${sales.length ? sales.map((sale) => `<tr><td>${escapeHtml(this.formatTime(sale.date))}</td><td>${escapeHtml(sale.userName)}</td><td><span class="sale-type sale-type-${sale.tipoVenta.toLowerCase()}">${escapeHtml(this.getSaleTypeLabel(sale.tipoVenta))}</span></td><td><div class="history-lines">${sale.lines.map((line) => `<div><span>${escapeHtml(line.productName)}</span><span class="muted">× ${line.qty}</span></div>`).join('')}</div></td><td><strong>${this.formatMoney(sale.total)}</strong></td></tr>`).join('') : '<tr><td colspan="5" class="muted">Este turno no registró ventas.</td></tr>'}
        </tbody></table></div>
      </details>`;
    }).join('');
  }

  getSaleTypeLabel(type) {
    return { COMEDOR: 'Comedor', FACTURADA: 'Facturada', PERSONAL: 'Personal' }[type] || type;
  }

  currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  formatMonth(value) {
    const [year, month] = String(value).split('-').map(Number);
    return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1, 12));
  }

  formatDay(value) {
    const [year, month, day] = String(value).split('-').map(Number);
    return new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day, 12));
  }

  formatTime(value) {
    const text = String(value);
    const date = new Date(/[zZ]$|[+-]\d\d:\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  }
}

window.HistoryView = HistoryView;
