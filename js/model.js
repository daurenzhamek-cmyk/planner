/* Модель данных и правила планировщика (PRD §5).
   Чистая логика без DOM: работает и в браузере (window.Planner), и в Node (require). */
(function (root) {
  'use strict';

  const pad = n => String(n).padStart(2, '0');
  const key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const shift = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return key(d); };
  const todayK = () => key(new Date());
  const nowHM = () => { const n = new Date(); return pad(n.getHours()) + ':' + pad(n.getMinutes()); };

  const REP = { none: '', daily: 'каждый день', weekdays: 'по будням', weekly: 'каждую неделю' };
  const CAT = { work: 'Работа', pers: 'Личное' };
  const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const Q = {
    q1: { n: 'Сделать сейчас', d: 'срочно и важно' },
    q2: { n: 'Запланировать', d: 'важно, не срочно' },
    q3: { n: 'Делегировать', d: 'срочно, не важно' },
    q4: { n: 'Отложить', d: 'не срочно, не важно' }
  };
  const Q_RANK = { q1: 0, q2: 1, q3: 2, q4: 3 };
  const MAX_LEVEL = 3;

  const rec = t => (t.repeat || 'none') !== 'none';
  // Устаревшее поле prio: 3 = срочно и важно, 2 = важно
  const urg = t => t.urgent !== undefined ? !!t.urgent : (t.prio || 1) >= 3;
  const imp = t => t.important !== undefined ? !!t.important : (t.prio || 1) >= 2;
  const quad = t => urg(t) ? (imp(t) ? 'q1' : 'q3') : (imp(t) ? 'q2' : 'q4');
  const isDone = (t, k) => !!(t.doneDates && t.doneDates[k] === true);

  // Задача приходится на день k
  function occurs(t, k) {
    if (!t.date) return false;
    if (!rec(t)) return t.date === k;
    if (k < t.date) return false;
    const dw = parse(k).getDay();
    if (t.repeat === 'daily') return true;
    if (t.repeat === 'weekdays') return dw > 0 && dw < 6;
    if (t.repeat === 'weekly') return dw === parse(t.date).getDay();
    return false;
  }

  // Минут до срока задачи в день k (отрицательное — срок прошёл)
  function minsTo(t, k) {
    if (!t.time || !k) return null;
    const [h, m] = t.time.split(':').map(Number);
    const d = parse(k); d.setHours(h, m, 0, 0);
    return Math.round((d - new Date()) / 60000);
  }
  const fmtIn = m => m < 60 ? m + ' мин' : Math.floor(m / 60) + ' ч' + (m % 60 ? ' ' + (m % 60) + ' мин' : '');

  function dayLabel(k) {
    const tk = todayK();
    if (k === tk) return 'сегодня';
    if (k === shift(tk, 1)) return 'завтра';
    return parse(k).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  /* Операции над набором задач */
  function make(getTasks) {
    const all = () => getTasks();
    const byId = id => all().find(t => t.id === id);
    const parentOf = t => t && t.parentId ? byId(t.parentId) : null;
    const kids = t => all().filter(x => x.parentId === t.id);
    const level = t => { let l = 0, p = parentOf(t); while (p && l < 10) { l++; p = parentOf(p); } return l; };
    const isRoot = t => !parentOf(t);
    const isSub = t => !!parentOf(t);
    const dayTasks = k => all().filter(t => occurs(t, k));
    const overdue = () => { const tk = todayK(); return all().filter(t => !rec(t) && t.date && t.date < tk && !isDone(t, t.date)); };
    const dayStat = k => { const l = dayTasks(k); return { l, n: l.length, d: l.filter(t => isDone(t, k)).length }; };
    const isLate = (t, k) => !isDone(t, k) && k === todayK() && !!t.time && t.time < nowHM();
    function nextOcc(t) {
      const tk = todayK();
      for (let i = 0; i < 400; i++) { const k = shift(tk, i); if (occurs(t, k) && !isDone(t, k)) return k; }
      return null;
    }
    // Эффективная дата: свой срок (разовая) или ближайшая невыполненная (повторяющаяся)
    const effK = t => rec(t) ? nextOcc(t) : t.date;
    const openT = t => rec(t) ? !!nextOcc(t) : !isDone(t, t.date);
    function family(t, acc = []) { acc.push(t); if (acc.length < 500) for (const c of kids(t)) family(c, acc); return acc; }
    const kidsDone = t => { const c = kids(t); return { n: c.length, d: c.filter(x => !openT(x)).length }; };
    const dl = (t, k) => (k || '') + ' ' + (t.time || '99');
    const sortByTime = k => (a, b) =>
      (isDone(a, k) - isDone(b, k)) ||
      ((a.time || '99') < (b.time || '99') ? -1 : (a.time || '99') > (b.time || '99') ? 1 : 0) ||
      (Q_RANK[quad(a)] - Q_RANK[quad(b)]);
    const sortByDeadline = (a, b) => {
      const x = dl(a, effK(a) || a.date), y = dl(b, effK(b) || b.date);
      return x < y ? -1 : x > y ? 1 : Q_RANK[quad(a)] - Q_RANK[quad(b)];
    };
    return { byId, parentOf, kids, level, isRoot, isSub, dayTasks, overdue, dayStat, isLate,
      nextOcc, effK, openT, family, kidsDone, dl, sortByTime, sortByDeadline };
  }

  const newId = p => (p || 't') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* Миграция устаревших встроенных подзадач subs/subDone в отдельные документы (PRD §5).
     Возвращает { tasks, changed }. */
  function migrate(list) {
    let changed = false;
    const out = [];
    for (const t0 of list) {
      const t = { ...t0 };
      if (Array.isArray(t.subs) && t.subs.length) {
        const doneMap = t.subDone || {};
        t.subs.forEach((s, i) => {
          const title = typeof s === 'string' ? s : (s && s.title) || '';
          if (!title) return;
          const done = Array.isArray(doneMap) ? !!doneMap[i] : !!(doneMap[i] || doneMap[title]);
          out.push({ id: newId('s'), title: title.slice(0, 200), parentId: t.id, cat: t.cat || 'work',
            date: t.date, time: t.time, urgent: urg(t), important: imp(t), repeat: 'none',
            doneDates: done && t.date ? { [t.date]: true } : {}, created: new Date().toISOString() });
        });
        changed = true;
      }
      if ('subs' in t || 'subDone' in t) { delete t.subs; delete t.subDone; changed = true; }
      out.push(t);
    }
    return { tasks: out, changed };
  }

  const api = { pad, key, parse, shift, todayK, nowHM, REP, CAT, DOW, Q, Q_RANK, MAX_LEVEL,
    rec, urg, imp, quad, isDone, occurs, minsTo, fmtIn, dayLabel, make, newId, migrate };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Planner = api;
})(typeof window !== 'undefined' ? window : globalThis);
