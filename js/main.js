/* «Зацеп» — небольшие сценарии поверх Bootstrap JS.
   Вся интерактивность компонентов (меню, модальные окна, вкладки, карусели,
   аккордеоны) работает средствами bootstrap.bundle.min.js. Этот файл только
   связывает компоненты с данными страницы. */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const rub = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
  const params = new URLSearchParams(location.search);

  /* ---------- Год в подвале ---------- */
  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  /* ---------- Подсказки Bootstrap ---------- */
  $$('[data-bs-toggle="tooltip"]').forEach((el) => new bootstrap.Tooltip(el));

  /* ---------- Ссылка вида halls.html#hall-lead открывает нужную вкладку ---------- */
  if (location.hash) {
    const target = '#' + CSS.escape(decodeURIComponent(location.hash.slice(1)));
    const tabTrigger = $(`[data-bs-toggle="pill"][data-bs-target="${target}"], [data-bs-toggle="tab"][data-bs-target="${target}"]`);
    if (tabTrigger) {
      bootstrap.Tab.getOrCreateInstance(tabTrigger).show();
      if (document.activeElement && document.activeElement.classList.contains('tab-pane')) document.activeElement.blur();
      tabTrigger.scrollIntoView({ block: 'center' });
    }
  }

  /* ---------- Toast-уведомление ---------- */
  function showToast(title, text) {
    const toastEl = $('#siteToast');
    if (!toastEl) return;
    $('[data-toast-title]', toastEl).textContent = title;
    $('[data-toast-text]', toastEl).textContent = text;
    bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 6000 }).show();
  }

  /* ---------- Валидация всех форм с классом needs-validation ---------- */
  $$('form.needs-validation').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.classList.add('was-validated');
        const firstInvalid = $(':invalid', form);
        if (firstInvalid) firstInvalid.focus();
        return;
      }
      const name = (form.elements.name && form.elements.name.value.trim()) || '';
      const title = form.dataset.successTitle || 'Заявка отправлена';
      const text = (form.dataset.successText || 'Администратор свяжется с вами в течение 15 минут.')
        .replace('{name}', name ? name + ', ' : '');
      form.reset();
      form.classList.remove('was-validated');
      form.dispatchEvent(new Event('change'));

      const modalEl = form.closest('.modal');
      if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
      showToast(title, text);
    });
  });

  /* ---------- Быстрая запись: модальное окно знает, откуда его открыли ---------- */
  const quickModal = $('#quickBookModal');
  if (quickModal) {
    quickModal.addEventListener('show.bs.modal', (event) => {
      const trigger = event.relatedTarget;
      const select = $('#quick-service', quickModal);
      if (trigger && trigger.dataset.service && select) select.value = trigger.dataset.service;
    });
  }

  /* ---------- Каталог: фильтр по категориям и сортировка ---------- */
  const catalog = $('#catalogGrid');
  if (catalog) {
    const items = $$('.catalog-item', catalog);
    const counter = $('#catalogCount');
    const empty = $('#catalogEmpty');
    const sortSelect = $('#catalogSort');
    let current = params.get('cat') || 'all';

    const apply = () => {
      let visible = 0;
      items.forEach((item) => {
        const show = current === 'all' || item.dataset.category.split(' ').includes(current);
        item.classList.toggle('is-hidden', !show);
        if (show) visible += 1;
      });
      if (counter) counter.textContent = visible;
      if (empty) empty.classList.toggle('d-none', visible > 0);
      $$('[data-filter]').forEach((btn) => {
        const active = btn.dataset.filter === current;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    };

    $$('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        current = btn.dataset.filter;
        const url = new URL(location.href);
        if (current === 'all') url.searchParams.delete('cat'); else url.searchParams.set('cat', current);
        history.replaceState(null, '', url);
        apply();
      });
    });

    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        const mode = sortSelect.value;
        const sorted = [...items].sort((a, b) => {
          if (mode === 'price-asc') return a.dataset.price - b.dataset.price;
          if (mode === 'price-desc') return b.dataset.price - a.dataset.price;
          return a.dataset.order - b.dataset.order;
        });
        sorted.forEach((el) => catalog.appendChild(el));
      });
    }
    apply();
  }

  /* ---------- Залы: фильтр таблицы трасс ---------- */
  const routes = $('#routesTable');
  if (routes) {
    const hallSelect = $('#routeHall');
    const levelSelect = $('#routeLevel');
    const rows = $$('tbody tr[data-hall]', routes);
    const noRows = $('#routesEmpty');
    const count = $('#routesCount');
    const filter = () => {
      let n = 0;
      rows.forEach((row) => {
        const ok = (hallSelect.value === 'all' || row.dataset.hall === hallSelect.value)
          && (levelSelect.value === 'all' || row.dataset.level === levelSelect.value);
        row.classList.toggle('d-none', !ok);
        if (ok) n += 1;
      });
      noRows.classList.toggle('d-none', n > 0);
      count.textContent = n;
    };
    hallSelect.addEventListener('change', filter);
    levelSelect.addEventListener('change', filter);
    filter();
  }

  /* ---------- Страница записи: калькулятор и подстановка услуги ---------- */
  const orderForm = $('#orderForm');
  if (orderForm) {
    const service = $('#order-service');
    const people = $('#order-people');
    const date = $('#order-date');
    const rentals = $$('input[name="rental"]', orderForm);
    const rentalNote = $('#rentalIncluded');
    const promoInput = $('#order-promo');
    const promoBtn = $('#promoApply');
    const promoMsg = $('#promoFeedback');
    let discount = 0;

    // дата: не раньше сегодняшнего дня
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    date.min = today.toISOString().slice(0, 10);

    if (params.get('service') && $(`option[value="${params.get('service')}"]`, service)) {
      service.value = params.get('service');
    }

    $$('[data-step]', orderForm).forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = Number(people.value || 1) + Number(btn.dataset.step);
        people.value = Math.min(Number(people.max), Math.max(Number(people.min), next));
        update();
      });
    });

    promoBtn.addEventListener('click', () => {
      const code = promoInput.value.trim().toUpperCase();
      promoInput.classList.remove('is-valid', 'is-invalid');
      if (code === 'ЗАЦЕП10' || code === 'ZACEP10') {
        discount = 0.1;
        promoInput.classList.add('is-valid');
        promoMsg.className = 'form-text text-success';
        promoMsg.textContent = 'Промокод применён: скидка 10%.';
      } else {
        discount = 0;
        promoInput.classList.add('is-invalid');
        promoMsg.className = 'form-text text-danger';
        promoMsg.textContent = code ? 'Такого промокода нет.' : 'Введите промокод.';
      }
      update();
    });

    function update() {
      const opt = service.selectedOptions[0];
      const chosen = Boolean(service.value);
      const price = Number(opt && opt.dataset.price) || 0;
      const included = opt && opt.dataset.gear === 'included';
      const qty = Math.max(1, Number(people.value) || 1);

      rentals.forEach((r) => {
        r.disabled = included;
        if (included) r.checked = false;
      });
      rentalNote.classList.toggle('d-none', !included);

      const rentalSum = rentals.filter((r) => r.checked).reduce((s, r) => s + Number(r.dataset.price), 0);
      const subtotal = (price + rentalSum) * qty;
      const total = subtotal * (1 - discount);

      $('#sumService').textContent = chosen ? opt.textContent.replace(/\s+—.*$/, '') : 'Не выбрано';
      $('#sumPrice').textContent = chosen ? (price ? rub(price) + ' × ' + qty : 'бесплатно') : '—';
      $('#sumRental').textContent = rentalSum ? rub(rentalSum * qty) : (included ? 'включено' : '—');
      $('#sumDiscount').textContent = discount && subtotal ? '−' + rub(subtotal * discount) : '—';
      $('#sumTotal').textContent = chosen ? rub(total) : '—';
      $('#sumDate').textContent = date.value
        ? new Date(date.value + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' })
          + ($('#order-time').value ? ', ' + $('#order-time').value : '')
        : '—';
    }

    orderForm.addEventListener('input', update);
    orderForm.addEventListener('change', update);
    orderForm.addEventListener('reset', () => {
      discount = 0;
      promoInput.classList.remove('is-valid', 'is-invalid');
      promoMsg.className = 'form-text';
      promoMsg.textContent = 'Например, ЗАЦЕП10 — скидка 10% на первое посещение.';
      setTimeout(update);
    });
    update();
  }
})();
