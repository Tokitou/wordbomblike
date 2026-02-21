/* settings.js
   Minimal settings persistence module for Wordbomb.
   - key: 'wb_app_settings_v1' in localStorage
   - saves: theme, showSystemMessages, leftSettings (spaceAsDashSubmit, extraTurnSeconds)
   - applies theme (adds body class), hides system messages in DOM, updates known toggles if present
   - exposes WBSettings API: load(), save(), get(), set(), applyAll(), setShowSystemMessages(), onChange(callback)
*/

(function (global) {
  'use strict';

  const STORAGE_KEY = 'wb_app_settings_v1';
  const DEFAULTS = {
    theme: 'theme-midnight',            // one of your theme class names
    showSystemMessages: true,           // true = visible
    leftSettings: {
      spaceAsDashSubmit: false,
      extraTurnSeconds: 0               // 0..10
    }
  };

  let settings = Object.assign({}, DEFAULTS);
  const listeners = [];

  function readStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      const parsed = JSON.parse(raw);
      return Object.assign({}, DEFAULTS, parsed || {});
    } catch (e) {
      console.warn('WBSettings.readStorage error', e);
      return Object.assign({}, DEFAULTS);
    }
  }

  function writeStorage(s) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (e) {
      console.warn('WBSettings.writeStorage error', e);
    }
  }

  function load() {
    settings = readStorage();
    return settings;
  }

  function save() {
    // ensure we persist the current in-memory settings
    try {
      writeStorage(settings);
      _emitChange();
    } catch (e) {
      console.warn('WBSettings.save error', e);
    }
  }

  function get() {
    return JSON.parse(JSON.stringify(settings)); // shallow copy
  }

  function set(patch) {
    // merge top-level; special handling for leftSettings nested merge
    settings = Object.assign({}, settings, patch || {});
    if (patch && patch.leftSettings) {
      settings.leftSettings = Object.assign({}, DEFAULTS.leftSettings, settings.leftSettings, patch.leftSettings);
    }
    // if showSystemMessages is provided, coerce to boolean
    if (typeof patch.showSystemMessages !== 'undefined') {
      settings.showSystemMessages = !!patch.showSystemMessages;
    }
    save();
  }

  // UPDATED applyTheme:
  // - removes the full list of known theme classes before adding the requested one
  // - persists the chosen theme value (without triggering set() to avoid re-entrant applyAll)
  function applyTheme(themeName) {
    // complete list of theme classes defined in style.css
    const themeList = [
      'theme-glacier','theme-ember','theme-forest','theme-midnight','theme-cobalt',
      'theme-aurora','theme-slate','theme-sunrise','theme-neon','theme-ocean',
      'theme-crimson','theme-matrix','theme-lavender'
    ];
    try {
      themeList.forEach(t => document.body.classList.remove(t));
      if (themeName) document.body.classList.add(themeName);

      // persist the chosen theme in our settings object and storage
      settings.theme = themeName || DEFAULTS.theme;
      writeStorage(settings);
      // emit change so external listeners can react
      _emitChange();
    } catch (e) {
      console.warn('WBSettings.applyTheme error', e);
    }
  }

  function applyShowSystemMessages(visible) {
    // persist the preference immediately and then update DOM
    try {
      settings.showSystemMessages = !!visible;
      writeStorage(settings); // persist
    } catch (e) {
      console.warn('WBSettings.applyShowSystemMessages persist error', e);
    }

    // toggle existing system message elements
    try {
      const nodes = document.querySelectorAll('.chat-message.chat-system');
      nodes.forEach(n => { n.style.display = visible ? '' : 'none'; });
      // update any UI toggle button(s) if present
      const leftBtn = document.getElementById('sysToggleLeft');
      const rightBtn = document.getElementById('toggleSystemBtn');
      if (leftBtn) { leftBtn.setAttribute('aria-pressed', String(visible)); leftBtn.textContent = visible ? 'S' : 'S✕'; }
      if (rightBtn) { rightBtn.setAttribute('aria-pressed', String(visible)); rightBtn.textContent = visible ? 'S' : 'S✕'; }
    } catch (e) { console.warn('WBSettings.applyShowSystemMessages', e); }
  }

  function applyLeftSettingsUI(left) {
    try {
      const chk = document.getElementById('spaceAsDashSubmit');
      const ns = document.getElementById('extraTurnSeconds');
      if (chk) chk.checked = !!left.spaceAsDashSubmit;
      if (ns) ns.value = (typeof left.extraTurnSeconds === 'number') ? left.extraTurnSeconds : 0;
    } catch (e) { console.warn('WBSettings.applyLeftSettingsUI', e); }
  }

  function applyAll() {
    // apply theme
    try {
      applyTheme(settings.theme);
    } catch (e) { }

    // apply system messages show/hide
    try {
      applyShowSystemMessages(!!settings.showSystemMessages);
    } catch (e) { }

    // apply left settings to UI controls
    try {
      applyLeftSettingsUI(settings.leftSettings || {});
    } catch (e) { }

    _emitChange();
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  function _emitChange() {
    try {
      listeners.forEach(fn => {
        try { fn(get()); } catch (e) { console.warn('WBSettings listener error', e); }
      });
    } catch (e) {}
  }

  // helper: wire basic UI controls (if they exist) to update settings automatically
  function autoWireUI() {
    // theme selection (theme tiles with data-theme attribute)
    try {
      document.addEventListener('click', (ev) => {
        const el = ev.target && (ev.target.closest && ev.target.closest('.theme-tile'));
        if (!el) return;
        const theme = el.getAttribute('data-theme');
        if (!theme) return;
        // update in-memory and persist + apply
        settings.theme = theme;
        writeStorage(settings);
        applyTheme(theme);
      });
    } catch (e) {}

    // system messages toggle(s)
    try {
      const leftBtn = document.getElementById('sysToggleLeft');
      const rightBtn = document.getElementById('toggleSystemBtn');
      const toggleFn = () => {
        const newVal = !settings.showSystemMessages;
        settings.showSystemMessages = !!newVal;
        writeStorage(settings);
        applyShowSystemMessages(newVal);
        _emitChange();
      };
      if (leftBtn) leftBtn.addEventListener('click', toggleFn);
      if (rightBtn) rightBtn.addEventListener('click', toggleFn);
    } catch (e) {}

    // left-settings apply button
    try {
      const applyBtn = document.querySelector('[onclick="applyLeftSettings()"], [data-action="apply-left-settings"]') || document.querySelector('.left-settings-modal .pill-btn');
      // explicit inputs
      const chk = document.getElementById('spaceAsDashSubmit');
      const ns = document.getElementById('extraTurnSeconds');
      if (chk) {
        chk.addEventListener('change', () => {
          settings.leftSettings.spaceAsDashSubmit = !!chk.checked;
          writeStorage(settings);
          _emitChange();
        });
      }
      if (ns) {
        ns.addEventListener('change', () => {
          let v = Number(ns.value || 0); if (isNaN(v)) v = 0; v = Math.max(0, Math.min(10, Math.floor(v)));
          settings.leftSettings.extraTurnSeconds = v;
          writeStorage(settings);
          _emitChange();
        });
      }
      if (applyBtn) {
        applyBtn.addEventListener('click', () => {
          // re-read values and persist (safer)
          const space = (chk && chk.checked) || false;
          let v = Number(ns && ns.value ? ns.value : 0); if (isNaN(v)) v = 0; v = Math.max(0, Math.min(10, Math.floor(v)));
          settings.leftSettings = Object.assign({}, settings.leftSettings || {}, { spaceAsDashSubmit: space, extraTurnSeconds: v });
          writeStorage(settings);
          _emitChange();
        });
      }
    } catch (e) {}
  }

  // convenience method: programmatically set showSystemMessages (persists + applies)
  function setShowSystemMessages(val) {
    try {
      settings.showSystemMessages = !!val;
      writeStorage(settings);
      applyShowSystemMessages(!!val);
      _emitChange();
    } catch (e) { console.warn('WBSettings.setShowSystemMessages error', e); }
  }

  // initialize immediately (load & apply) but allow consumers to call load/apply themselves
  function init() {
    settings = readStorage();
    // apply on next tick so DOM elements present
    window.addEventListener('DOMContentLoaded', () => {
      try { applyAll(); autoWireUI(); } catch (e) { console.warn('WBSettings.init apply error', e); }
    });
    return get();
  }

  // expose API
  global.WBSettings = {
    init,
    load,
    save,
    get,
    set,
    applyAll,
    setShowSystemMessages,
    onChange
  };

  // auto-init
  init();

})(window);