/* Интерфейс планировщика (PRD §3–4). */
(function () {
  'use strict';
  const P = window.Planner;
  const { key, parse, shift, todayK, REP, CAT, DOW, Q, Q_RANK, MAX_LEVEL,
    rec, urg, imp, quad, isDone, minsTo, fmtIn, dayLabel, newId } = P;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VIEW_KEY = 'planner-view';
  const SUBS_HINT = 'Быстрые подзадачи — каждая с новой строки (получат срок и параметры этой задачи, потом их можно изменить)';

  let view = 'all';
  try { view = localStorage.getItem(VIEW_KEY) || 'all'; } catch (e) { /* нет доступа */ }
  let sel = todayK(), filt = 'all', qf = null, cat = 'work', editing = null, parentFor = null, loaded = false;
  const collapsed = new Set();

  const store = window.PlannerStore.createStore({
    onChange: (_, isLoaded) => { if (isLoaded) loaded = true; render(); },
    onNote: t => { $('note').textContent = t; }
  });
  const M = P.make(() => store.tasks);
  const pass = t => (filt === 'all' || t.cat === filt) && (!qf || quad(t) === qf);
  const saveView = () => { try { localStorage.setItem(VIEW_KEY, view); } catch (e) { /* нет доступа */ } };

  /* ---------- Строка задачи ---------- */
  function row(t, k, o = {}) {
    const done = isDone(t, k), late = M.isLate(t, k), q = quad(t), kd = M.kidsDone(t);
    const mt = done ? null : minsTo(t, k), soon = mt !== null && mt > 0 && mt <= 1440, hot = soon && mt <= 120;
    const over = !done && !rec(t) && k < todayK();
    const sub = M.isSub(t), lv = o.lv || 0;
    const meta = [];
    if (soon) meta.push('<span class="soonL">⏰ через ' + fmtIn(mt) + '</span>');
    meta.push('<span class="qt ' + q + '">' + Q[q].n + '</span>');
    const dtxt = over
      ? 'срок был ' + parse(k).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + (t.time ? ' ' + t.time : '')
      : (o.showDay ? dayLabel(k) + ', ' : '') + (t.time ? 'до ' + t.time : 'время не задано');
    meta.push('<span class="' + (late || over ? 'late' : '') + '">' + esc(dtxt) + (late ? ' · срок прошёл' : '') + '</span>');
    meta.push('<span class="tag ' + esc(t.cat) + '">' + esc(CAT[t.cat] || '') + '</span>');
    if (REP[t.repeat]) meta.push('<span>↻ ' + esc(REP[t.repeat]) + '</span>');
    if (kd.n) meta.push('<button class="sbtn" data-a="fold" aria-expanded="' + !collapsed.has(t.id) + '">подзадачи ' + kd.d + '/' + kd.n +
      (o.nested ? (collapsed.has(t.id) ? ' ▾' : ' ▴') : '') + '</button>');
    const p = o.showParent && M.parentOf(t);
    const canSub = !rec(t) && M.level(t) < MAX_LEVEL; // до 3 уровней подзадач
    const cls = ['task', 'lv' + Math.min(lv || (sub ? M.level(t) : 0), 3), t.cat === 'pers' ? 'pers' : 'work'];
    if (sub) cls.push('isSub');
    if (kd.n) cls.push('hasKids');
    if (done) cls.push('done');
    if (soon) cls.push('soon');
    if (hot) cls.push('hot');
    return '<li class="' + cls.join(' ') + '" data-id="' + esc(t.id) + '" data-k="' + esc(k) + '">' +
      '<button class="chk" data-a="tog" aria-label="' + (done ? 'Снять отметку' : 'Отметить выполненной') + ': ' + esc(t.title) + '"><span></span></button>' +
      '<div class="body">' + (p ? '<div class="par">↳ ' + esc(p.title) + '</div>' : '') +
      '<div class="ttl">' + (sub ? '<span class="subpill">подзадача</span>' : '') + esc(t.title) + '</div>' +
      '<div class="meta">' + meta.join('') + '</div></div>' +
      '<div class="acts">' + (o.move ? '<button class="ghost" data-a="move">На сегодня</button>' : '') +
      (canSub ? '<button class="ic" data-a="sub" aria-label="Добавить подзадачу" title="Добавить подзадачу">＋</button>' : '') +
      '<button class="ic" data-a="edit" aria-label="Изменить" title="Изменить">✎</button>' +
      '<button class="ic" data-a="del" aria-label="Удалить" title="Удалить">✕</button></div></li>';
  }

  function tree(t, lv, showDay) {
    const k = M.effK(t) || t.date;
    let h = row(t, k, { lv, showDay, nested: true, move: !rec(t) && !isDone(t, k) && k < todayK() });
    if (!collapsed.has(t.id)) {
      for (const c of M.kids(t).sort((a, b) => M.openT(b) - M.openT(a) || M.sortByDeadline(a, b))) h += tree(c, lv + 1, showDay);
    }
    return h;
  }

  /* ---------- Режим «Все задачи» ---------- */
  function allList() {
    const tk = todayK(), tm = shift(tk, 1), wk = shift(tk, 7);
    const fams = [];
    for (const r of store.tasks.filter(M.isRoot)) {
      const f = M.family(r), op = f.filter(M.openT);
      if (!op.length || !f.some(pass)) continue;
      // группа семейства — по самому раннему открытому сроку
      const first = op.map(x => M.dl(x, M.effK(x))).sort()[0];
      fams.push({ r, k: first.split(' ')[0], sk: first });
    }
    fams.sort((a, b) => a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : Q_RANK[quad(a.r)] - Q_RANK[quad(b.r)]);
    const G = [
      ['Просрочено', x => x.k < tk, 'bad'],
      ['Сегодня', x => x.k === tk],
      ['Завтра', x => x.k === tm],
      ['На этой неделе', x => x.k > tm && x.k <= wk],
      ['Позже', x => x.k > wk]
    ];
    let h = '';
    for (const [name, f, c] of G) {
      const l = fams.filter(f);
      if (!l.length) continue;
      const open = l.flatMap(x => M.family(x.r)).filter(M.openT);
      const sn = open.filter(x => { const m = minsTo(x, M.effK(x)); return m !== null && m > 0 && m <= 1440; }).length;
      h += '<li class="grp ' + (c || '') + '">' + name + ' <span>' + open.length + (sn ? ' · на подходе: ' + sn : '') + '</span></li>' +
        l.map(x => tree(x.r, 0, true)).join('');
    }
    $('list').innerHTML = !loaded ? '<li class="empty">Загрузка…</li>'
      : h || '<li class="empty">' + (store.tasks.length ? 'Под выбранный фильтр открытых задач нет.' : 'Задач пока нет. Добавьте первую в поле выше.') + '</li>';
    const dn = store.tasks
      .filter(t => M.isRoot(t) && !rec(t) && M.family(t).every(x => !M.openT(x)) && M.family(t).some(pass))
      .sort((a, b) => a.date < b.date ? 1 : -1);
    $('doneBox').hidden = !dn.length;
    $('doneSum').textContent = 'Выполненные — ' + dn.length;
    $('doneList').innerHTML = dn.slice(0, 100).map(t => tree(t, 0, true)).join('');
  }

  /* ---------- Матрица Эйзенхауэра ---------- */
  function matrix() {
    const tk = todayK();
    let items = view === 'all'
      ? store.tasks.filter(M.openT).map(t => ({ t, k: M.effK(t) }))
      : M.dayStat(sel).l.map(t => ({ t, k: sel })).concat(sel === tk ? M.overdue().map(t => ({ t, k: t.date })) : []);
    items = items.filter(x => filt === 'all' || x.t.cat === filt);
    const cell = q => {
      const l = items.filter(x => quad(x.t) === q), op = l.filter(x => !isDone(x.t, x.k));
      const shown = op.concat(l.filter(x => isDone(x.t, x.k))).slice(0, 4);
      return '<button class="q ' + q + '" data-q="' + q + '" aria-pressed="' + (qf === q) + '">' +
        '<h3>' + Q[q].n + '</h3><span class="qs">' + Q[q].d + '</span><span class="qn">' + op.length + '</span>' +
        '<span class="qs">' + (l.length ? 'открыто из ' + l.length : 'нет задач') + '</span><ul>' +
        shown.map(x => '<li class="' + (isDone(x.t, x.k) ? 'dn' : '') + '">' + (M.isSub(x.t) ? '↳ ' : '') + esc(x.t.title) + '</li>').join('') +
        '</ul></button>';
    };
    $('mx').innerHTML = '<span></span><span class="ax">Срочно</span><span class="ax">Не срочно</span>' +
      '<span class="ax ay">Важно</span>' + cell('q1') + cell('q2') +
      '<span class="ax ay">Не важно</span>' + cell('q3') + cell('q4');
    $('mxNote').textContent = view === 'all' ? 'Все открытые задачи и подзадачи.' : 'Задачи выбранного дня и хвосты.';
  }

  /* ---------- Итоги ---------- */
  function results(rel, d) {
    const tk = todayK(), st = M.dayStat(sel);
    $('resH').textContent = 'Итоги — ' + (rel ? rel.toLowerCase() : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }));
    const C = 326.7, w = st.l.filter(t => t.cat !== 'pers'), p = st.l.filter(t => t.cat === 'pers');
    const wd = w.filter(t => isDone(t, sel)).length, pd = p.filter(t => isDone(t, sel)).length;
    const fw = st.n ? wd / st.n : 0, fp = st.n ? pd / st.n : 0;
    $('rWork').style.strokeDashoffset = C * (1 - fw);
    const rp = $('rPers');
    rp.style.strokeDashoffset = C * (1 - fp);
    rp.style.transformOrigin = '60px 60px';
    rp.style.transform = 'rotate(' + (fw * 360) + 'deg)';
    $('pct').textContent = st.n ? Math.round(st.d / st.n * 100) + '%' : '—';
    $('of').textContent = st.n ? st.d + ' из ' + st.n + ' выполнено' : 'нет задач';
    const bar = (name, c, dn, n) => '<div class="bar"><div class="l"><span>' + name + '</span><span>' + dn + ' / ' + n + '</span></div>' +
      '<div class="t"><div class="f" style="width:' + (n ? dn / n * 100 : 0) + '%;background:var(' + c + ')"></div></div></div>';
    const q1 = st.l.filter(t => quad(t) === 'q1'), q1d = q1.filter(t => isDone(t, sel)).length;
    $('bars').innerHTML = bar('Работа', '--work', wd, w.length) + bar('Личное', '--pers', pd, p.length) + bar('Срочно и важно', '--bad', q1d, q1.length);

    let wn = 0, wdn = 0, h = '';
    for (let i = 6; i >= 0; i--) {
      const k = shift(sel, -i), s = M.dayStat(k), r = s.n ? s.d / s.n : 0;
      wn += s.n; wdn += s.d;
      const bad = r < 1 && k < tk && s.n;
      h += '<button class="wk' + (k === sel ? ' sel' : '') + '" data-k="' + k + '" aria-label="' +
        parse(k).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }) + (s.n ? ': ' + s.d + ' из ' + s.n : '') + '">' +
        '<span>' + (s.n ? s.d + '/' + s.n : '') + '</span><div class="col"><i class="' + (bad ? 'bad' : '') + '" style="height:' + (r * 100) + '%"></i></div>' +
        '<span>' + DOW[parse(k).getDay()] + '</span></button>';
    }
    $('week').innerHTML = h;
    $('sWeek').textContent = wn ? Math.round(wdn / wn * 100) + '%' : '—';

    let streak = 0;
    for (let i = 1; i < 120; i++) {
      const s = M.dayStat(shift(tk, -i));
      if (!s.n) { if (i > 60) break; continue; }
      if (s.d < s.n) break;
      streak++;
    }
    const td = M.dayStat(tk);
    if (td.n && td.d === td.n) streak++;
    $('sStreak').textContent = streak;
    $('sOver').textContent = M.overdue().length;
  }

  /* ---------- Плашка-напоминание ---------- */
  function alertBar() {
    const tk = todayK(), allOver = M.overdue().length;
    const late = M.dayStat(tk).l.filter(t => M.isLate(t, tk));
    const a = $('alert');
    if (loaded && (allOver || late.length)) {
      const parts = [];
      if (late.length) parts.push('<b>Срок прошёл:</b> ' + late.map(t => esc(t.time + ' ' + t.title)).join(', '));
      if (allOver) parts.push('<b>Просрочено:</b> ' + allOver + ' — ' + (view === 'all' ? 'см. группу «Просрочено»' : 'список «Хвосты» внизу') + ', их можно перенести на сегодня');
      a.innerHTML = parts.join('<br>');
      a.classList.add('on');
    } else a.classList.remove('on');
  }

  /* ---------- Отрисовка ---------- */
  function render() {
    const tk = todayK(), d = parse(sel);
    const rel = sel === tk ? 'Сегодня' : sel === shift(tk, -1) ? 'Вчера' : sel === shift(tk, 1) ? 'Завтра' : '';
    $('dTitle').textContent = rel || d.toLocaleDateString('ru-RU', { weekday: 'long' });
    $('dSub').textContent = d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('today').hidden = sel === tk;
    if (!editing && !parentFor && document.activeElement !== $('fDate')) $('fDate').value = sel;
    document.querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === view));
    $('listH').textContent = view === 'all' ? 'Все задачи' : (rel ? rel + ' — ' : '') + 'задачи на день';
    $('qInfo').classList.toggle('on', !!qf);
    $('qInfoT').textContent = qf ? 'Квадрант: ' + Q[qf].n + ' (' + Q[qf].d + ')' : '';

    if (view === 'all') allList();
    else {
      $('doneBox').hidden = true;
      const st = M.dayStat(sel), vis = st.l.filter(pass).sort(M.sortByTime(sel));
      $('list').innerHTML = !loaded ? '<li class="empty">Загрузка…</li>'
        : vis.length ? vis.map(t => row(t, sel, { showParent: true })).join('')
          : '<li class="empty">' + (st.n ? 'Под выбранный фильтр задач нет.' : 'На этот день задач нет. Добавьте первую в поле выше.') + '</li>';
    }

    const ov = M.overdue().filter(pass).sort((a, b) => a.date < b.date ? -1 : 1);
    $('overSec').hidden = !(view === 'day' && sel === tk && ov.length);
    $('overN').textContent = ov.length;
    $('over').innerHTML = ov.map(t => row(t, t.date, { showParent: true, move: true })).join('');

    matrix();
    results(rel, d);
    alertBar();
  }

  /* ---------- Форма ---------- */
  function setCat(c) {
    cat = c;
    document.querySelectorAll('[data-cat]').forEach(b => b.setAttribute('aria-pressed', b.dataset.cat === c));
  }
  function syncSubsField() {
    const off = $('fRep').value !== 'none';
    $('fSubs').disabled = off;
    $('fSubs').placeholder = off ? 'У повторяющихся задач подзадач нет' : SUBS_HINT;
  }
  function modeBanner() {
    const m = $('fMode');
    const pt = parentFor ? M.byId(parentFor) : editing ? M.parentOf(M.byId(editing)) : null;
    $('fRep').disabled = !!pt;
    if (pt) $('fRep').value = 'none';
    if (parentFor && pt) {
      m.hidden = false;
      m.innerHTML = 'Новая подзадача для «<b>' + esc(pt.title) + '</b>»' + (pt.time ? ' · срок задачи: ' + esc(dayLabel(pt.date)) + ' до ' + esc(pt.time) : '');
    } else if (editing) {
      m.hidden = false;
      m.innerHTML = 'Редактирование' + (pt ? ' подзадачи задачи «<b>' + esc(pt.title) + '</b>»' : ' задачи');
    } else m.hidden = true;
    $('fBtn').textContent = editing ? 'Сохранить' : parentFor ? 'Добавить подзадачу' : 'Добавить';
    $('fCancel').hidden = !(editing || parentFor);
    // уровень вложенности: у подзадачи 3-го уровня своих подзадач быть не может
    const lvl = parentFor ? M.level(pt) + 1 : editing ? M.level(M.byId(editing)) : 0;
    if (lvl >= MAX_LEVEL) { $('fSubs').disabled = true; $('fSubs').placeholder = 'Достигнута максимальная вложенность (3 уровня)'; }
    else syncSubsField();
  }
  function resetForm() {
    editing = null; parentFor = null;
    $('form').reset();
    $('fDate').value = sel;
    $('fErr').textContent = '';
    $('fRep').disabled = false;
    setCat('work');
    modeBanner();
  }
  function fillForm(t, asParent) {
    $('fErr').textContent = '';
    $('fTitle').value = asParent ? '' : t.title;
    setCat(t.cat === 'pers' ? 'pers' : 'work');
    $('fDate').value = t.date || sel;
    $('fTime').value = t.time || '';
    $('fUrg').checked = urg(t);
    $('fImp').checked = imp(t);
    $('fRep').value = asParent ? 'none' : (t.repeat || 'none');
    $('fSubs').value = '';
    modeBanner();
    $('fTitle').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function onSubmit(e) {
    e.preventDefault();
    const title = $('fTitle').value.trim(), date = $('fDate').value, time = $('fTime').value;
    if (!title || !date || !time) {
      $('fErr').textContent = 'Укажите название, дату и время завершения.';
      $(!title ? 'fTitle' : !date ? 'fDate' : 'fTime').focus();
      return;
    }
    const base = editing ? M.byId(editing) : null;
    const pid = parentFor || (base && base.parentId) || null, pt = pid ? M.byId(pid) : null;
    if (pt && !rec(pt) && pt.time && (date + ' ' + time) > (pt.date + ' ' + pt.time)) {
      $('fErr').textContent = 'Срок подзадачи не может быть позже срока задачи (' + dayLabel(pt.date) + ' до ' + pt.time + ').';
      $('fDate').focus();
      return;
    }
    const repeat = pt ? 'none' : $('fRep').value;
    if (base && repeat !== 'none' && M.kids(base).length) {
      $('fErr').textContent = 'У задачи есть подзадачи — сделать её повторяющейся нельзя.';
      $('fRep').focus();
      return;
    }
    if (base && repeat === 'none') {
      // при сокращении срока родителя подзадачи не должны оказаться позже него
      const lateKid = M.family(base).slice(1).find(x => (x.date + ' ' + x.time) > (date + ' ' + time));
      if (lateKid) {
        $('fErr').textContent = 'Срок подзадачи «' + lateKid.title.slice(0, 40) + '» позже нового срока задачи — сначала измените её.';
        return;
      }
    }
    const t = {
      ...(base || { doneDates: {}, created: new Date().toISOString() }),
      id: base ? base.id : newId(),
      title, cat, date, time,
      urgent: $('fUrg').checked, important: $('fImp').checked, repeat
    };
    if (pid) t.parentId = pid;
    delete t.prio; delete t.subs; delete t.subDone;
    store.put(t);
    const lvl = pt ? M.level(pt) + 1 : 0;
    if (repeat === 'none' && lvl < MAX_LEVEL && !$('fSubs').disabled) {
      for (const x of $('fSubs').value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 30)) {
        store.put({ id: newId(), title: x.slice(0, 200), cat, date, time, urgent: t.urgent, important: t.important,
          repeat: 'none', parentId: t.id, doneDates: {}, created: new Date().toISOString() });
      }
    }
    if (!base && date !== sel && view === 'day') sel = date;
    resetForm();
    $('fTitle').focus();
    render();
  }

  /* ---------- Тост с отменой ---------- */
  let lastDel = null, toastTimer;
  function toast(msg, undo) {
    $('toastT').textContent = msg;
    $('undo').hidden = !undo;
    $('toast').classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').classList.remove('on'); lastDel = null; }, 6000);
  }

  // Статусы независимы: только подсказка, когда закрыта последняя подзадача
  function hintParent(t, nowDone) {
    const p = M.parentOf(t);
    if (!p || !nowDone || rec(p) || isDone(p, p.date)) return;
    if (M.kids(p).every(x => x.id === t.id || !M.openT(x))) toast('Все подзадачи «' + p.title.slice(0, 40) + '» выполнены — можно закрыть задачу');
  }

  function onList(e) {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const li = b.closest('[data-id]'), id = li.dataset.id, k = li.dataset.k, t = M.byId(id);
    if (!t) return;
    switch (b.dataset.a) {
      case 'tog': {
        const nv = !isDone(t, k);
        store.patch(id, { doneDates: { [k]: nv } });
        if (!rec(t)) hintParent(t, nv);
        break;
      }
      case 'fold':
        collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
        if (view !== 'all') { view = 'all'; saveView(); }
        render();
        break;
      case 'move': store.patch(id, { date: todayK() }); break;
      case 'del': {
        const f = M.family(t);
        lastDel = f.map(x => JSON.parse(JSON.stringify(x)));
        f.forEach(x => store.remove(x.id));
        if (editing && f.some(x => x.id === editing) || parentFor && f.some(x => x.id === parentFor)) resetForm();
        toast(f.length > 1 ? 'Задача и подзадачи (' + (f.length - 1) + ') удалены' : 'Задача удалена', true);
        break;
      }
      case 'sub':
        editing = null; parentFor = id;
        $('form').reset();
        fillForm(t, true);
        break;
      case 'edit':
        parentFor = null; editing = id;
        fillForm(t, false);
        break;
    }
  }

  /* ---------- События ---------- */
  document.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => setCat(b.dataset.cat)));
  $('fCancel').addEventListener('click', resetForm);
  $('fRep').addEventListener('change', syncSubsField);
  $('form').addEventListener('submit', onSubmit);
  document.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => {
    filt = b.dataset.f;
    document.querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', x === b));
    render();
  }));
  $('mx').addEventListener('click', e => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    qf = qf === b.dataset.q ? null : b.dataset.q;
    render();
    $('listH').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('qReset').addEventListener('click', () => { qf = null; render(); });
  $('undo').addEventListener('click', () => {
    if (!lastDel) return;
    lastDel.forEach(store.put);
    lastDel = null;
    $('toast').classList.remove('on');
  });
  for (const el of [$('list'), $('over'), $('doneList')]) el.addEventListener('click', onList);
  document.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { view = b.dataset.v; saveView(); render(); }));
  $('moveAll').addEventListener('click', () => { const tk = todayK(); M.overdue().forEach(t => store.patch(t.id, { date: tk })); });
  $('week').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) { sel = b.dataset.k; render(); } });
  $('prev').addEventListener('click', () => { sel = shift(sel, -1); render(); });
  $('next').addEventListener('click', () => { sel = shift(sel, 1); render(); });
  $('today').addEventListener('click', () => { sel = todayK(); render(); });
  document.addEventListener('keydown', e => {
    if (e.target.closest('input,select,textarea') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft') $('prev').click();
    if (e.key === 'ArrowRight') $('next').click();
  });

  /* ---------- Экспорт / импорт (резервная копия и данные для scripts/summary.js) ---------- */
  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store.tasks, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tasks-' + todayK() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data)) throw new Error('ожидается массив задач');
      const valid = data.filter(t => t && typeof t.id === 'string' && typeof t.title === 'string');
      if (!confirm('Импортировать задач: ' + valid.length + '? Задачи с теми же id будут заменены.')) return;
      P.migrate(valid).tasks.forEach(store.put);
      toast('Импортировано задач: ' + valid.length);
    } catch (err) {
      toast('Не удалось импортировать: ' + err.message);
    }
  });

  /* ---------- Отсчёт раз в минуту и переход на новый день в полночь ---------- */
  let lastToday = todayK();
  setInterval(() => {
    const tk = todayK();
    if (tk !== lastToday) { if (sel === lastToday) sel = tk; lastToday = tk; }
    render();
  }, 60000);

  $('fDate').value = sel;
  syncSubsField();
  render();
  store.boot();
})();
