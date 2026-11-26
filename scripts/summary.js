#!/usr/bin/env node
/* Текст push-сводки (PRD §4.7). Только читает задачи и ничего не меняет.
   Использование:
     node scripts/summary.js morning [tasks.json]
     node scripts/summary.js evening [tasks.json]
   tasks.json — экспорт из планировщика (кнопка «Экспорт JSON») или массив документов коллекции `tasks`.
   Часовой пояс — Asia/Qyzylorda (UTC+5), можно переопределить переменной PLANNER_TZ. */
'use strict';
process.env.TZ = process.env.PLANNER_TZ || 'Asia/Qyzylorda';

const fs = require('fs');
const path = require('path');
const P = require('../js/model.js');

const PLANNER_URL = process.env.PLANNER_URL || 'https://claude.ai/artifact/Xtd7TAgsD1gyDzuFDLj7ms';

function load(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  // поддерживаем и массив, и {docs:[{id,data}]} / {id: doc}
  let list = Array.isArray(raw) ? raw : Array.isArray(raw.docs) ? raw.docs : Object.entries(raw).map(([id, d]) => ({ id, ...d }));
  list = list.map(d => d && d.data && typeof d.data === 'object' ? { ...d.data, id: d.id } : d);
  return P.migrate(list.filter(t => t && t.title)).tasks;
}

function build(mode, tasks) {
  const M = P.make(() => tasks);
  const tk = P.todayK(), tm = P.shift(tk, 1);
  const pct = (d, n) => n ? Math.round(d / n * 100) + '%' : '—';
  const fmtDate = k => P.parse(k).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const line = (t, k) => {
    const p = M.parentOf(t);
    return '• ' + (t.time || '--:--') + ' ' + t.title + ' (' + (P.CAT[t.cat] || '') + ')' +
      (p ? ' ↳ из: ' + p.title : '') + (P.isDone(t, k) ? ' ✓' : M.isLate(t, k) ? ' — срок прошёл' : '');
  };
  const byTime = (a, b) => (a.time || '99') < (b.time || '99') ? -1 : 1;
  const today = M.dayTasks(tk).sort(byTime);
  const tomorrow = M.dayTasks(tm).filter(t => !P.isDone(t, tm)).sort(byTime);
  const over = M.overdue().sort((a, b) => a.date < b.date ? -1 : 1);
  const out = [];

  if (mode === 'morning') {
    out.push('☀️ План на сегодня, ' + P.parse(tk).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }));
    if (!today.length) out.push('На сегодня задач нет.');
    for (const q of ['q1', 'q2', 'q3', 'q4']) {
      const l = today.filter(t => P.quad(t) === q);
      if (!l.length) continue;
      out.push('', P.Q[q].n + ' (' + l.length + '):', ...l.map(t => line(t, tk)));
    }
    if (tomorrow.length) out.push('', '⏰ На подходе (завтра):', ...tomorrow.map(t => line(t, tm)));
    if (over.length) out.push('', '⚠️ Просрочено (' + over.length + '):', ...over.map(t => '• ' + fmtDate(t.date) + ' ' + (t.time || '') + ' ' + t.title));
  } else {
    const st = M.dayStat(tk);
    const part = f => { const l = st.l.filter(f); return l.filter(t => P.isDone(t, tk)).length + ' из ' + l.length; };
    out.push('🌙 Итоги дня: выполнено ' + st.d + ' из ' + st.n + ' (' + pct(st.d, st.n) + ')');
    out.push('Работа: ' + part(t => t.cat !== 'pers') + ' · Личное: ' + part(t => t.cat === 'pers') + ' · Сделать сейчас: ' + part(t => P.quad(t) === 'q1'));
    const open = st.l.filter(t => !P.isDone(t, tk));
    if (open.length) out.push('', 'Не выполнено сегодня (' + open.length + '):', ...open.map(t => line(t, tk)));
    if (tomorrow.length) out.push('', '⏰ Завтра:', ...tomorrow.map(t => line(t, tm)));
    if (over.length) out.push('', '⚠️ Просрочено за прошлые дни: ' + over.length);
    const tip = !st.n ? 'Запланируйте завтрашний день с вечера — утром будет проще начать.'
      : st.d === st.n ? 'Отличный день — всё закрыто. Так держать!'
        : open.some(t => P.quad(t) === 'q1') ? 'Начните завтра с невыполненных задач «Сделать сейчас».'
          : over.length ? 'Перенесите хвосты на завтра или удалите неактуальные.'
            : 'Перенесите оставшееся на завтра и выберите одну главную задачу.';
    out.push('', '💡 ' + tip);
  }
  out.push('', 'Планировщик: ' + PLANNER_URL);
  return out.join('\n');
}

if (require.main === module) {
  const mode = process.argv[2];
  if (mode !== 'morning' && mode !== 'evening') {
    console.error('Использование: node scripts/summary.js morning|evening [tasks.json]');
    process.exit(1);
  }
  const file = path.resolve(process.argv[3] || 'tasks.json');
  console.log(build(mode, load(file)));
}

module.exports = { build, load };
