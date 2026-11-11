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

  /* ---------- Общие помощники ---------- */
  // localStorage может быть недоступен (приватный режим) — тогда просто ничего не сохраняем
  const store = {
    get(key, fallback) {
      try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* без сохранения */ } },
    remove(key) { try { localStorage.removeItem(key); } catch (e) { /* без сохранения */ } },
  };
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // ё → е, чтобы «ёлка» находилась по «елка»; длина строки не меняется
  const normalize = (s) => String(s).toLowerCase().replace(/ё/g, 'е');
  // Слова запроса с отсечённым окончанием: «дети» найдёт и «детям», и «детские»
  const queryWords = (value) => normalize(value).split(/[\s,.!?]+/).filter(Boolean)
    .map((w) => (w.length > 5 ? w.slice(0, -2) : w.length > 3 ? w.slice(0, -1) : w));
  // Текст для поиска: только буквы и цифры, слова через пробел; ищем с начала слова
  const searchable = (value) => ' ' + normalize(value).replace(/[^a-zа-я0-9]+/g, ' ');
  const hasWords = (hay, words) => words.every((w) => hay.includes(' ' + w));
  const plural = (n, forms) => {
    const a = Math.abs(n) % 100; const b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b === 1) return forms[0];
    return b > 1 && b < 5 ? forms[1] : forms[2];
  };
  // Подсветка найденных слов: размечаем позиции в исходном тексте, затем экранируем
  function highlight(text, words) {
    const lower = normalize(text);
    const marked = new Array(text.length).fill(false);
    words.forEach((w) => {
      let i = lower.indexOf(w);
      while (w && i !== -1) {
        if (i === 0 || !/[a-zа-я0-9]/.test(lower[i - 1])) {
          for (let j = i; j < i + w.length; j += 1) marked[j] = true;
        }
        i = lower.indexOf(w, i + w.length);
      }
    });
    let html = ''; let open = false;
    for (let i = 0; i < text.length; i += 1) {
      if (marked[i] && !open) { html += '<mark>'; open = true; }
      if (!marked[i] && open) { html += '</mark>'; open = false; }
      html += escapeHtml(text[i]);
    }
    return open ? html + '</mark>' : html;
  }

  /* ---------- Год в подвале ---------- */
  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  /* ---------- Подсказки Bootstrap ---------- */
  $$('[data-bs-toggle="tooltip"]').forEach((el) => new bootstrap.Tooltip(el));

  /* ---------- Ссылка вида halls.html#hall-lead открывает нужную вкладку ---------- */
  function openHashTab() {
    if (!location.hash) return;
    const target = '#' + CSS.escape(decodeURIComponent(location.hash.slice(1)));
    const tabTrigger = $(`[data-bs-toggle="pill"][data-bs-target="${target}"], [data-bs-toggle="tab"][data-bs-target="${target}"]`);
    if (tabTrigger) {
      bootstrap.Tab.getOrCreateInstance(tabTrigger).show();
      if (document.activeElement && document.activeElement.classList.contains('tab-pane')) document.activeElement.blur();
      tabTrigger.scrollIntoView({ block: 'center' });
    }
  }
  openHashTab();
  window.addEventListener('hashchange', openHashTab);

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
      let text = (form.dataset.successText || 'Администратор свяжется с вами в течение 15 минут.')
        .replace('{name}', name ? name + ', ' : '');
      if (form.id === 'orderForm') text += saveBooking(form);
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

  /* ================= Запись → личный кабинет ================= */
  // Вызывается из обработчика формы записи до её сброса
  function saveBooking(form) {
    const select = form.elements.service;
    const option = select.selectedOptions[0];
    const total = $('#sumTotal');
    const booking = {
      id: Date.now(),
      service: option ? option.textContent.replace(/\s+—.*$/, '').trim() : 'Посещение',
      date: form.elements.date.value,
      time: form.elements.time.value,
      people: Math.max(1, Number(form.elements.people.value) || 1),
      total: total ? total.textContent : '',
    };
    store.set('zc-bookings', [...store.get('zc-bookings', []), booking]);
    // Если человек ещё не входил в кабинет — заводим профиль из данных формы
    if (!store.get('zc-user', null)) {
      store.set('zc-user', {
        name: form.elements.name.value.trim(),
        phone: form.elements.phone.value.trim(),
        email: form.elements.email.value.trim(),
        level: 'новичок', remind: true, news: false,
      });
    }
    return ' Запись появилась в личном кабинете.';
  }

  /* ================= Поиск по сайту ================= */
  // Статический индекс: сайт без сервера, поэтому искать будем по заранее описанным разделам
  const SEARCH_INDEX = [
    { s: 'Страница', t: 'Главная', d: 'Скалодром «Зацеп»: боулдеринг, трудность 16 м, вводное занятие, абонементы', u: 'index.html', popular: true },
    { s: 'Страница', t: 'Залы и трассы', d: 'Четыре зала, шкала сложности, свежие трассы с фильтром, правила зала', u: 'halls.html', popular: true },
    { s: 'Страница', t: 'Абонементы и цены', d: 'Каталог: разовые посещения, абонементы, тренировки, детские секции, прокат', u: 'catalog.html', k: 'цена стоимость прайс', popular: true },
    { s: 'Страница', t: 'Вводное занятие «Первый зацеп»', d: 'Для новичков: 90 минут с инструктором, инструктаж, снаряжение включено — 2 400 ₽', u: 'product.html', k: 'новичкам первый раз', popular: true },
    { s: 'Страница', t: 'Детям и события', d: 'Детские секции, дни рождения, соревнования и календарь событий', u: 'kids.html' },
    { s: 'Страница', t: 'Запись онлайн', d: 'Форма записи с расчётом стоимости, прокатом и промокодом', u: 'order.html', k: 'записаться бронь бронирование' },
    { s: 'Страница', t: 'Контакты', d: 'Адрес, метро «ЦСКА», «Сокол», «Зорге», телефон, часы работы, карта', u: 'contacts.html', k: 'адрес где находится' },
    { s: 'Страница', t: 'Личный кабинет', d: 'Мои записи, абонемент, история посещений, настройки профиля', u: 'account.html', k: 'профиль вход аккаунт' },
    { s: 'Главная', t: 'Отзывы', d: 'Рейтинг 4,9, отзывы скалолазов и родителей, оставить свой отзыв', u: 'index.html#reviews', k: 'мнения оценка' },
    { s: 'Главная', t: 'Частые вопросы', d: 'Подготовка, что взять с собой, оплата, дети, правила', u: 'index.html#faq', k: 'faq вопросы ответы' },
    { s: 'Главная', t: 'Популярные абонементы', d: 'Разовое посещение, безлимит на месяц, 8 посещений', u: 'index.html#popular' },
    { s: 'Залы', t: 'Боулдеринг-зал «Пещера»', d: 'Стены до 4,5 м без верёвки над матами толщиной 40 см', u: 'halls.html#hall-boulder' },
    { s: 'Залы', t: 'Зал трудности «Стена»', d: '16 метров, 32 линии с верёвкой и 6 автостраховок', u: 'halls.html#hall-lead', k: 'верёвка высота' },
    { s: 'Залы', t: 'Детский зал «Скалята»', d: 'Стены 6 м с автостраховками и игровые трассы', u: 'halls.html#hall-kids' },
    { s: 'Залы', t: 'Тренажёрная зона', d: 'Кампусборд, системная стена, фингерборды и зона ОФП', u: 'halls.html#hall-training' },
    { s: 'Залы', t: 'Свежие трассы', d: 'Таблица трасс с фильтром по залу и уровню сложности', u: 'halls.html#routes', k: 'категория сложность грейд' },
    { s: 'Залы', t: 'Правила зала', d: 'Боулдеринг, лазание с верёвкой, дети в зале, что запрещено', u: 'halls.html#rules', k: 'безопасность', popular: true },
    { s: 'Цены', t: 'Разовое посещение — 1 200 ₽', d: 'Целый день в любом зале', u: 'catalog.html?cat=single' },
    { s: 'Цены', t: 'Утреннее посещение — 900 ₽', d: 'По будням до 16:00', u: 'catalog.html?cat=single' },
    { s: 'Цены', t: 'Абонемент «8 посещений» — 6 400 ₽', d: 'Действует 2 месяца, можно использовать вдвоём', u: 'catalog.html?cat=subs' },
    { s: 'Цены', t: 'Безлимит на месяц — 7 900 ₽', d: 'Любые залы без ограничений', u: 'catalog.html?cat=subs' },
    { s: 'Цены', t: 'Студенческий безлимит — 5 500 ₽', d: 'Безлимит на месяц для студентов очной формы', u: 'catalog.html?cat=subs', k: 'скидка студент' },
    { s: 'Цены', t: 'Безлимит на год — 59 000 ₽', d: 'Самый выгодный вариант, заморозка до 30 дней', u: 'catalog.html?cat=subs' },
    { s: 'Цены', t: 'Персональная тренировка — 3 500 ₽', d: '60 минут с тренером', u: 'catalog.html?cat=training', k: 'тренер инструктор' },
    { s: 'Цены', t: 'Группы «Старт» и «Техника»', d: '8 занятий в мини-группе с тренером', u: 'catalog.html?cat=training' },
    { s: 'Цены', t: 'Курс нижней страховки — 14 900 ₽', d: '4 занятия, после курса — допуск к лазанию с верёвкой', u: 'catalog.html?cat=training', k: 'допуск верёвка' },
    { s: 'Цены', t: 'Скидки и условия', d: 'Студенты, семьи, группы, заморозка абонемента, подарочные сертификаты', u: 'catalog.html#termsAccordion', k: 'скидка сертификат подарок заморозка' },
    { s: 'Новичкам', t: 'Программа вводного занятия', d: 'Инструктаж, снаряжение и разминка, лазание с инструктором, план', u: 'product.html#program' },
    { s: 'Новичкам', t: 'Что взять с собой', d: 'Спортивная одежда, полотенце; туфли и магнезия — напрокат', u: 'product.html#bring', k: 'одежда обувь' },
    { s: 'Новичкам', t: 'Инструкторы', d: 'Анна Лебедева, Илья Мартынов, Дарья Соколова', u: 'product.html#specs', k: 'тренер' },
    { s: 'Детям', t: 'Детские секции', d: '«Скалята» 5–7 лет, «Юниор» 8–14 лет, «Подростки», расписание групп', u: 'kids.html#sections', k: 'ребёнок дети', popular: true },
    { s: 'Детям', t: 'Дни рождения', d: 'Программы «Мини», «Приключение» и «Максимум»', u: 'kids.html#birthday', k: 'праздник' },
    { s: 'Детям', t: 'Соревнования и события', d: '«Зацеп Open», «Новогодний зацеп», ночная трудность, боулдер-марафон', u: 'kids.html#competitions', k: 'турнир фестиваль' },
    { s: 'Детям', t: 'Вопросы родителей', d: 'Безопасность, медицинская справка, пропуски, семейные часы', u: 'kids.html#parents' },
    { s: 'Контакты', t: 'Как добраться', d: 'На метро, на машине, на велосипеде или самокате', u: 'contacts.html#routeAccordion', k: 'парковка маршрут' },
    { s: 'Контакты', t: 'Телефон и адрес', d: '+7 (964) 204-29-76 · Москва, 3-я Песчаная ул., 2с1', u: 'contacts.html#contacts', k: 'позвонить' },
    { s: 'Вопрос', t: 'Нужна ли физическая подготовка?', d: 'Нет — сила придёт сама, инструктор научит лазать ногами', u: 'index.html#faq' },
    { s: 'Вопрос', t: 'Боюсь высоты — подойдёт ли скалолазание?', d: 'Да, начните с боулдеринга над матами', u: 'index.html#faq' },
    { s: 'Вопрос', t: 'Можно ли заморозить абонемент?', d: 'Месячный — до 7 дней, годовой — до 30 дней', u: 'index.html#faq' },
    { s: 'Вопрос', t: 'С какого возраста можно лазать?', d: 'Детские секции — с 5 лет', u: 'index.html#faq' },
  ].map((e) => ({ ...e, hay: searchable([e.t, e.d, e.s, e.k || ''].join(' ')) }));

  document.body.insertAdjacentHTML('beforeend', `
  <div class="modal fade" id="searchModal" tabindex="-1" aria-labelledby="searchModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg">
      <div class="modal-content border-0 rounded-4">
        <div class="modal-header border-0 pb-2 gap-2">
          <h2 class="visually-hidden" id="searchModalLabel">Поиск по сайту</h2>
          <div class="faq-search position-relative flex-grow-1">
            <label class="visually-hidden" for="siteSearchInput">Что ищем?</label>
            <i class="bi bi-search" aria-hidden="true"></i>
            <input id="siteSearchInput" type="search" class="form-control search-input" placeholder="Абонемент, дети, правила…" autocomplete="off" aria-describedby="siteSearchStatus">
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
        </div>
        <div class="modal-body pt-0">
          <p class="small text-body-secondary mb-2" id="siteSearchStatus" aria-live="polite"></p>
          <div id="siteSearchResults" class="search-results d-grid gap-1"></div>
        </div>
        <div class="modal-footer border-0 pt-0 small text-body-secondary justify-content-start d-none d-md-flex">
          <span><kbd class="kbd-hint">↑</kbd> <kbd class="kbd-hint">↓</kbd> выбор</span>
          <span><kbd class="kbd-hint">Enter</kbd> открыть</span>
          <span><kbd class="kbd-hint">/</kbd> быстрый поиск</span>
          <span><kbd class="kbd-hint">Esc</kbd> закрыть</span>
        </div>
      </div>
    </div>
  </div>`);

  const searchModal = $('#searchModal');
  const searchInput = $('#siteSearchInput');
  const searchResults = $('#siteSearchResults');
  const searchStatus = $('#siteSearchStatus');

  function renderSearch() {
    const query = searchInput.value.trim();
    const words = queryWords(query);
    let results;
    if (!words.length) {
      results = SEARCH_INDEX.filter((e) => e.popular);
      searchStatus.textContent = 'Популярные разделы';
    } else {
      results = SEARCH_INDEX
        .filter((e) => hasWords(e.hay, words))
        .map((e) => ({ e, score: words.reduce((sum, w) => sum + (searchable(e.t).includes(' ' + w) ? 3 : 1), 0) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map((r) => r.e);
      searchStatus.textContent = results.length
        ? `Найдено: ${results.length}`
        : `По запросу «${query}» ничего не нашлось. Попробуйте другое слово.`;
    }
    searchResults.innerHTML = results.map((e) => `
      <a class="search-result" href="${e.u}">
        <span class="d-flex justify-content-between align-items-start gap-2">
          <span class="search-result-title">${highlight(e.t, words)}</span>
          <span class="badge rounded-pill text-bg-light flex-shrink-0">${escapeHtml(e.s)}</span>
        </span>
        <span class="d-block small text-body-secondary">${highlight(e.d, words)}</span>
      </a>`).join('');
  }

  searchInput.addEventListener('input', renderSearch);
  searchModal.addEventListener('shown.bs.modal', () => { renderSearch(); searchInput.focus(); searchInput.select(); });
  // Стрелки переключают результаты, Enter в поле открывает первый
  searchModal.addEventListener('keydown', (event) => {
    const links = $$('.search-result', searchResults);
    if (!links.length) return;
    const index = links.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      links[Math.min(links.length - 1, index + 1)].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (index <= 0) searchInput.focus(); else links[index - 1].focus();
    } else if (event.key === 'Enter' && document.activeElement === searchInput) {
      event.preventDefault();
      links[0].click();
    }
  });
  // Ссылка на эту же страницу: закрываем окно, якорь обработает браузер
  searchResults.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (link && link.pathname === location.pathname && link.search === location.search) {
      bootstrap.Modal.getOrCreateInstance(searchModal).hide();
    }
  });
  // «/» или Ctrl+K открывают поиск с любой страницы
  document.addEventListener('keydown', (event) => {
    const typing = event.target.closest('input, textarea, select, [contenteditable="true"]');
    const hotkey = (event.key === '/' && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k');
    if (!hotkey || $('.modal.show')) return;
    event.preventDefault();
    bootstrap.Modal.getOrCreateInstance(searchModal).show();
  });

  /* ================= Отзывы ================= */
  const reviewsList = $('#reviewsList');
  if (reviewsList) {
    const BASE_COUNTS = { 5: 118, 4: 8, 3: 2, 2: 0, 1: 0 }; // отзывы, собранные ранее
    const CAT_LABEL = { new: 'новичок', pro: 'опытный скалолаз', kids: 'родитель' };
    const moreBtn = $('#reviewsMore');
    const empty = $('#reviewsEmpty');
    const form = $('#reviewForm');
    const ratingFeedback = $('#ratingFeedback');
    let filter = 'all';
    let expanded = false;

    const renderSummary = () => {
      const counts = { ...BASE_COUNTS };
      store.get('zc-reviews', []).forEach((r) => { counts[r.rating] += 1; });
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const sum = Object.entries(counts).reduce((s, [star, n]) => s + star * n, 0);
      const avg = (sum / total).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      $$('[data-rating-avg]').forEach((el) => { el.textContent = avg; });
      $$('[data-rating-total]').forEach((el) => { el.textContent = `${total} ${plural(total, ['отзыв', 'отзыва', 'отзывов'])}`; });
      [5, 4, 3, 2, 1].forEach((star) => {
        const counter = $(`[data-rating-count-${star}]`);
        if (!counter) return;
        const row = counter.closest('.rating-row');
        const pct = Math.round((counts[star] / total) * 100);
        counter.textContent = counts[star];
        $('.progress', row).setAttribute('aria-valuenow', pct);
        $('.progress', row).setAttribute('aria-label', `Оценка ${star}: ${counts[star]} ${plural(counts[star], ['отзыв', 'отзыва', 'отзывов'])}`);
        $('.progress-bar', row).style.width = pct + '%';
      });
    };

    const userCard = (r) => {
      const initials = r.name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
      const date = new Date(r.date + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
      const stars = '★'.repeat(r.rating) + (r.rating < 5 ? `<span class="text-body-tertiary">${'★'.repeat(5 - r.rating)}</span>` : '');
      return `
              <div class="col-12 col-md-6 review-col is-user" data-review-cat="${escapeHtml(r.cat)}">
                <article class="card review-card is-new h-100 border shadow-sm">
                  <div class="card-body p-4 d-flex flex-column">
                    <div class="d-flex align-items-center gap-3 mb-3">
                      <span class="avatar bg-primary" aria-hidden="true">${escapeHtml(initials)}</span>
                      <div class="me-auto">
                        <h3 class="h6 mb-0">${escapeHtml(r.name)}</h3>
                        <div class="small text-body-secondary">${escapeHtml(CAT_LABEL[r.cat] || '')}</div>
                      </div>
                      <div class="stars small" role="img" aria-label="Оценка ${r.rating} из 5">${stars}</div>
                    </div>
                    <p class="mb-3">${escapeHtml(r.text)}</p>
                    <div class="mt-auto d-flex justify-content-between gap-2 small text-body-secondary">
                      <span class="badge rounded-pill text-bg-primary">Ваш отзыв</span>
                      <time datetime="${escapeHtml(r.date)}">${date}</time>
                    </div>
                  </div>
                </article>
              </div>`;
    };

    const renderUserReviews = () => {
      $$('.review-col.is-user', reviewsList).forEach((el) => el.remove());
      reviewsList.insertAdjacentHTML('afterbegin', store.get('zc-reviews', []).map(userCard).join(''));
    };

    const applyFilter = () => {
      let visible = 0; let hidden = 0;
      $$('.review-col', reviewsList).forEach((col) => {
        const match = filter === 'all' || col.dataset.reviewCat === filter;
        const show = match && (expanded || !col.classList.contains('review-extra'));
        col.classList.toggle('d-none', !show);
        if (show) visible += 1; else if (match) hidden += 1;
      });
      empty.classList.toggle('d-none', visible > 0);
      moreBtn.classList.toggle('d-none', hidden === 0);
      $$('[data-review-filter]').forEach((btn) => {
        const active = btn.dataset.reviewFilter === filter;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    };

    $$('[data-review-filter]').forEach((btn) => btn.addEventListener('click', () => {
      filter = btn.dataset.reviewFilter;
      applyFilter();
    }));
    moreBtn.addEventListener('click', () => { expanded = true; applyFilter(); });

    form.addEventListener('change', (event) => {
      if (event.target.name === 'rating') ratingFeedback.classList.remove('d-block');
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const rating = $('input[name="rating"]:checked', form);
      form.classList.add('was-validated');
      ratingFeedback.classList.toggle('d-block', !rating);
      if (!form.checkValidity() || !rating) {
        const firstInvalid = $(':invalid', form);
        if (firstInvalid) firstInvalid.focus();
        return;
      }
      const review = {
        id: Date.now(),
        name: form.elements.name.value.trim(),
        cat: form.elements.cat.value,
        rating: Number(rating.value),
        text: form.elements.text.value.trim(),
        date: new Date().toISOString().slice(0, 10),
      };
      store.set('zc-reviews', [review, ...store.get('zc-reviews', [])]);
      form.reset();
      form.classList.remove('was-validated');
      bootstrap.Modal.getOrCreateInstance($('#reviewModal')).hide();
      filter = 'all';
      renderUserReviews();
      renderSummary();
      applyFilter();
      showToast('Спасибо за отзыв!', `${review.name}, ваш отзыв опубликован на сайте.`);
    });

    renderUserReviews();
    renderSummary();
    applyFilter();
  }

  /* ================= Частые вопросы: поиск и темы ================= */
  const faqAccordion = $('#faqHome');
  if (faqAccordion && $('#faqSearch')) {
    const faqInput = $('#faqSearch');
    const faqItems = $$('.faq-item', faqAccordion).map((item) => {
      const button = $('.accordion-button', item);
      const body = $('.accordion-body', item);
      return { item, button, body, q: button.textContent.trim(), a: body.textContent.trim() };
    });
    const applyFaq = () => {
      const words = queryWords(faqInput.value);
      const cat = ($('input[name="faq-cat"]:checked') || {}).value || 'all';
      let count = 0; let first = null;
      faqItems.forEach((it) => {
        const ok = (cat === 'all' || it.item.dataset.faqCat === cat)
          && hasWords(searchable(it.q + ' ' + it.a), words);
        it.item.classList.toggle('is-hidden', !ok);
        it.button.innerHTML = '<span>' + highlight(it.q, words) + '</span>'; // кнопка — flex, без обёртки пробелы схлопнутся
        it.body.innerHTML = highlight(it.a, words);
        if (ok) { count += 1; if (!first) first = it; }
      });
      $('#faqCount').textContent = count;
      $('#faqEmpty').classList.toggle('d-none', count > 0);
      // при поиске сразу раскрываем первый подходящий ответ
      if (words.length && first) {
        bootstrap.Collapse.getOrCreateInstance($('.accordion-collapse', first.item), { toggle: false }).show();
      }
    };
    faqInput.addEventListener('input', applyFaq);
    $$('input[name="faq-cat"]').forEach((radio) => radio.addEventListener('change', applyFaq));
  }

  /* ================= Личный кабинет ================= */
  const dashboard = $('#accountDashboard');
  if (dashboard) {
    const loginBox = $('#accountLogin');
    const loginForm = $('#loginForm');
    const profileForm = $('#profileForm');
    const formatPhone = (value) => {
      const d = String(value).replace(/\D/g, '').slice(-10);
      return d.length === 10 ? `+7 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}` : value;
    };
    const todayIso = () => {
      const d = new Date();
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 10);
    };
    const validate = (form) => {
      form.classList.add('was-validated');
      if (form.checkValidity()) return true;
      const firstInvalid = $(':invalid', form);
      if (firstInvalid) firstInvalid.focus();
      return false;
    };

    const renderBookings = () => {
      const today = todayIso();
      const bookings = store.get('zc-bookings', []).slice()
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      const upcoming = bookings.filter((b) => b.date >= today).length;
      $$('[data-bookings-count]').forEach((el) => { el.textContent = upcoming; });
      $('#bookingsEmpty').classList.toggle('d-none', bookings.length > 0);
      $('#bookingsList').innerHTML = bookings.map((b) => {
        const d = new Date(b.date + 'T00:00');
        const past = b.date < today;
        const month = d.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '');
        const weekday = d.toLocaleDateString('ru-RU', { weekday: 'long' });
        const details = [weekday, b.time, `${b.people} ${plural(b.people, ['человек', 'человека', 'человек'])}`, b.total]
          .filter((x) => x && x !== '—').map(escapeHtml).join(' · ');
        return `
          <article class="card border-0 shadow-sm${past ? ' opacity-75' : ''}">
            <div class="card-body p-3 p-md-4 d-flex align-items-center gap-3">
              <div class="booking-date" aria-hidden="true"><strong>${d.getDate()}</strong><small>${escapeHtml(month)}</small></div>
              <div class="flex-grow-1" style="min-width: 0">
                <h3 class="h6 mb-1">${escapeHtml(b.service)}</h3>
                <p class="small text-body-secondary mb-0"><span class="visually-hidden">${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}, </span>${details}</p>
              </div>
              ${past
    ? '<span class="badge rounded-pill text-bg-secondary">Прошла</span>'
    : `<button class="btn btn-sm btn-outline-danger flex-shrink-0" type="button" data-cancel-booking="${b.id}">Отменить</button>`}
            </div>
          </article>`;
      }).join('');
    };

    const render = () => {
      const user = store.get('zc-user', null);
      loginBox.classList.toggle('d-none', Boolean(user));
      dashboard.classList.toggle('d-none', !user);
      if (!user) return;
      const initials = user.name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
      $$('[data-user-name]').forEach((el) => { el.textContent = user.name; });
      $$('[data-user-initials]').forEach((el) => { el.textContent = initials || '?'; });
      $$('[data-user-phone]').forEach((el) => { el.textContent = formatPhone(user.phone); });
      $$('[data-user-level]').forEach((el) => { el.textContent = user.level || 'новичок'; });
      profileForm.elements.name.value = user.name;
      profileForm.elements.phone.value = user.phone;
      profileForm.elements.email.value = user.email || '';
      profileForm.elements.level.value = user.level || 'новичок';
      profileForm.elements.remind.checked = Boolean(user.remind);
      profileForm.elements.news.checked = Boolean(user.news);
      renderBookings();
    };

    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!validate(loginForm)) return;
      const saved = store.get('zc-user', null);
      const user = {
        level: 'новичок', remind: true, news: false, email: '',
        ...(saved || {}),
        name: loginForm.elements.name.value.trim(),
        phone: loginForm.elements.phone.value.trim(),
      };
      store.set('zc-user', user);
      loginForm.reset();
      loginForm.classList.remove('was-validated');
      render();
      showToast('Добро пожаловать!', `${user.name}, вы вошли в личный кабинет.`);
      $('[data-user-name]').setAttribute('tabindex', '-1');
      $('[data-user-name]').focus();
    });

    $('#logoutBtn').addEventListener('click', () => {
      store.remove('zc-user');
      render();
      showToast('Вы вышли', 'Записи сохранены — войдите снова, чтобы их увидеть.');
      $('#login-name').focus();
    });

    profileForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!validate(profileForm)) return;
      store.set('zc-user', {
        ...store.get('zc-user', {}),
        name: profileForm.elements.name.value.trim(),
        phone: profileForm.elements.phone.value.trim(),
        email: profileForm.elements.email.value.trim(),
        level: profileForm.elements.level.value,
        remind: profileForm.elements.remind.checked,
        news: profileForm.elements.news.checked,
      });
      profileForm.classList.remove('was-validated');
      render();
      showToast('Профиль сохранён', 'Изменения применены.');
    });

    $('#bookingsList').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-cancel-booking]');
      if (!btn) return;
      const id = Number(btn.dataset.cancelBooking);
      store.set('zc-bookings', store.get('zc-bookings', []).filter((b) => b.id !== id));
      renderBookings();
      showToast('Запись отменена', 'Если передумаете — запишитесь снова в пару кликов.');
    });

    $('#freezeBtn').addEventListener('click', () => {
      showToast('Заявка на заморозку отправлена', 'Администратор подтвердит заморозку абонемента в течение дня.');
    });

    render();
  }

  /* ================= Анимации ================= */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Появление блоков при прокрутке ---------- */
  // Класс .reveal ставится только из JS: без скриптов контент виден сразу.
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const revealTargets = $$('main section:not(.hero):not(.page-header) h2, main section:not(.hero):not(.page-header) .row > [class*="col"]');
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    revealTargets.forEach((el) => {
      // вложенные колонки не анимируем повторно — их уже двигает родитель
      if (el.parentElement.closest('.reveal')) return;
      const index = Array.from(el.parentElement.children).indexOf(el);
      el.style.setProperty('--reveal-delay', Math.min(index, 4) * 90 + 'ms');
      el.classList.add('reveal');
      revealObserver.observe(el);
    });
  }

  /* ---------- Счётчики в блоке статистики ---------- */
  // Цифры стартуют с нуля, считают вверх по очереди, а в конце «подпрыгивают».
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const fmt = new Intl.NumberFormat('ru-RU');
    const counters = $$('.stat-value').map((el, index) => {
      const original = el.textContent.trim();
      const match = original.match(/^([\d\s ]+)(.*)$/);
      if (!match) return null;
      const space = match[1].match(/\s*$/)[0]; // пробел перед «м²», «м» сохраняем
      const counter = { el, original, index, target: Number(match[1].replace(/\D/g, '')), suffix: space + match[2] };
      el.textContent = '0' + counter.suffix;
      el.classList.add('is-counting');
      return counter;
    }).filter(Boolean);

    const countUp = ({ el, original, target, suffix }) => {
      const duration = 2200;
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(2, -10 * p); // быстро в начале, плавно в конце
        el.textContent = fmt.format(Math.round(target * eased)) + suffix;
        if (p < 1) { requestAnimationFrame(tick); return; }
        el.textContent = original;
        el.classList.remove('is-counting');
        el.classList.add('is-counted');
      };
      requestAnimationFrame(tick);
    };

    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        counterObserver.unobserve(entry.target);
        const counter = counters.find((c) => c.el === entry.target);
        // ждём, пока колонка проявится, и запускаем цифры по очереди
        setTimeout(() => countUp(counter), 400 + counter.index * 150);
      });
    }, { threshold: 0.6 });
    counters.forEach((c) => counterObserver.observe(c.el));
  }

  /* ---------- Тень у шапки при прокрутке ---------- */
  const navbar = $('.site-navbar');
  if (navbar) {
    let ticking = false;
    const onScroll = () => {
      navbar.classList.toggle('is-scrolled', window.scrollY > 10);
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
    }, { passive: true });
    onScroll();
  }
})();
