/* «Зацеп» — светлая и тёмная тема.
   Подключается в <head> БЕЗ defer: тема ставится до отрисовки страницы,
   поэтому нет «вспышки» светлой темы. Используется встроенный механизм
   цветовых режимов Bootstrap 5.3 — атрибут data-bs-theme на <html>. */
(function () {
  'use strict';

  const KEY = 'zc-theme';
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  const stored = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const store = (value) => { try { localStorage.setItem(KEY, value); } catch (e) { /* приватный режим */ } };
  // Если пользователь сам тему не выбирал — берём системную настройку
  const preferred = () => stored() || (media.matches ? 'dark' : 'light');

  function apply(theme) {
    document.documentElement.setAttribute('data-bs-theme', theme);
    const dark = theme === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(dark));
      btn.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
      btn.title = dark ? 'Светлая тема' : 'Тёмная тема';
      const icon = btn.querySelector('i');
      if (icon) icon.className = 'bi ' + (dark ? 'bi-sun' : 'bi-moon-stars');
    });
    document.querySelectorAll('input[name="theme-choice"]').forEach((input) => {
      input.checked = input.value === theme;
    });
  }

  function set(theme) {
    store(theme);
    apply(theme);
  }

  apply(preferred());
  media.addEventListener('change', () => { if (!stored()) apply(preferred()); });

  document.addEventListener('DOMContentLoaded', () => {
    apply(preferred()); // обновить иконки кнопок, которых ещё не было в DOM
    document.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-theme-toggle]');
      if (!btn) return;
      set(document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark');
    });
    document.addEventListener('change', (event) => {
      if (event.target.matches('input[name="theme-choice"]')) set(event.target.value);
    });
  });

  window.zcTheme = { set, get: () => document.documentElement.getAttribute('data-bs-theme') };
})();
