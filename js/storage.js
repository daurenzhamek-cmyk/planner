/* Хранилище (PRD §6, §7).
   1) Облачная база артефакта Claude (window.claude.use('db')), коллекция `tasks`, синхронизация в реальном времени.
   2) Резерв — localStorage браузера с предупреждением.
   Запись — очередь: по одной операции на документ за раз; set — создание/редактирование, update — отметки и перенос. */
(function (root) {
  'use strict';
  const LS_KEY = 'planner-tasks';
  const LOAD_TIMEOUT = 10000;

  function deepMerge(a, b) {
    for (const k in b) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) a[k] = deepMerge({ ...(a[k] || {}) }, b[k]);
      else a[k] = b[k];
    }
    return a;
  }

  function createStore({ onChange, onNote }) {
    let tasks = [];
    let col = null;
    const queue = {};

    const err = e => onNote('Не удалось сохранить: ' + ((e && (e.code || e.message)) || e));
    const enqueue = (id, fn) => (queue[id] = (queue[id] || Promise.resolve()).then(fn).catch(err));
    const saveLocal = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(tasks)); } catch (e) { /* нет доступа */ } };
    const commitLocal = () => { saveLocal(); onChange(tasks); };

    function put(t) {
      const { id, ...body } = t;
      if (col) return enqueue(id, () => col.doc(id).set(body));
      const i = tasks.findIndex(x => x.id === id);
      if (i < 0) tasks.push(t); else tasks[i] = t;
      commitLocal();
    }
    function patch(id, obj) {
      if (col) return enqueue(id, () => col.doc(id).update(obj));
      const t = tasks.find(x => x.id === id);
      if (!t) return;
      deepMerge(t, obj);
      commitLocal();
    }
    function remove(id) {
      if (col) return enqueue(id, () => col.doc(id).delete());
      tasks = tasks.filter(x => x.id !== id);
      commitLocal();
    }

    function loadLocal(msg) {
      try { tasks = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { tasks = []; }
      const m = root.Planner.migrate(tasks);
      tasks = m.tasks;
      if (m.changed) saveLocal();
      onNote(msg);
      onChange(tasks, true);
    }

    async function boot() {
      let db = null;
      try { db = root.claude && root.claude.use ? await root.claude.use('db') : null; } catch (e) { db = null; }
      if (!db) {
        loadLocal('Облачное хранилище недоступно — задачи сохраняются только в этом браузере.');
        return;
      }
      col = db.collection('tasks');
      let migrated = false;
      const timer = setTimeout(() => {
        onNote('Хранилище пока не отвечает — данные могут быть неактуальны.');
        onChange(tasks, true);
      }, LOAD_TIMEOUT);
      col.onSnapshot(s => {
        if (!s.metadata || !s.metadata.fromCache) { clearTimeout(timer); onNote(''); }
        tasks = s.docs.map(x => ({ ...x.data(), id: x.id }));
        if (!migrated) {
          migrated = true;
          const m = root.Planner.migrate(tasks);
          if (m.changed) m.tasks.forEach(put);
        }
        onChange(tasks, true);
      }, e => {
        clearTimeout(timer);
        onNote('Хранилище недоступно (' + (e && e.code) + '). Изменения могут не сохраниться.');
        onChange(tasks, true);
      });
    }

    return { boot, put, patch, remove, get tasks() { return tasks; }, get cloud() { return !!col; } };
  }

  root.PlannerStore = { createStore };
})(window);
