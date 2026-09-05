const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).filter(Boolean).join('\n');

// A DOM-only harness. No browser, real account, network, or user storage is used.
function app(storage = new Map()) {
  const { document } = parseHTML(html);
  const timers = new Map();
  let nextTimer = 1;
  const window = { __EJU_TEST__: true, addEventListener() {}, scrollTo() {} };
  const context = vm.createContext({ document, window, console,
    navigator: { onLine: true }, performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
    setTimeout: (fn, delay) => { const id = nextTimer++; timers.set(id, {fn, delay}); return id; },
    clearTimeout: id => timers.delete(id), setInterval: () => 0, clearInterval() {},
    localStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    alert() {}, confirm: () => false,
  });
  vm.runInContext(script, context);
  const run = code => vm.runInContext(code, context);
  const json = code => JSON.parse(run(`JSON.stringify(${code})`));
  const flush = delay => {
    for (const [id, timer] of [...timers]) {
      if (timer.delay === delay) { timers.delete(id); timer.fn(); }
    }
  };
  run(`state.books = {'mondai|数学':['数学の本'], 'mondai|物理':['物理の本']};`);
  const input = (id, field, value) => {
    document.getElementById(id).value = value;
    context.testValue = value;
    run(`updateEntryDraft('${field}',testValue)`);
  };
  return { run, json, document, storage, flush, input };
}

test('draft survives subject, book, page changes, cloud rerender and reload', () => {
  const a = app();
  a.run(`state.view='entry';render();`);
  a.input('entry-source', 'source', '原书 p.10');
  a.input('entry-note', 'note', '先画受力图\n不要漏掉摩擦力');
  a.run(`setEntrySubject('物理');selectBook('物理の本');`);
  a.input('entry-num', 'num', '12');
  a.run(`navigate('library');navigate('entry');render();`);
  assert.equal(a.document.getElementById('entry-note').value, '先画受力图\n不要漏掉摩擦力');
  assert.equal(a.document.getElementById('entry-num').value, '12');
  a.run(`setEntrySubject('数学');`);
  assert.equal(a.document.getElementById('entry-source').value, '原书 p.10');
  a.run(`setEntrySubject('物理');`);
  const b = app(a.storage);
  b.run(`restoreEntryDraft();state.view='entry';render();`);
  assert.equal(b.run('state.entryBook'), '物理の本');
  assert.equal(b.document.getElementById('entry-num').value, '12');
  assert.equal(b.document.getElementById('entry-note').value, '先画受力图\n不要漏掉摩擦力');
});

test('batch preview expands ranges, skips duplicates, preserves draft on invalid range', () => {
  const a = app();
  a.run(`state.view='entry';selectBook('数学の本');state.entryDraft.batch=true;render();`);
  a.input('entry-num','num','1, 3, 5-7, 1');
  assert.deepEqual(a.json('entrySources()'), ['数学の本 1','数学の本 3','数学の本 5','数学の本 6','数学の本 7']);
  a.run(`addItem();`);
  assert.equal(a.run('state.items.length'), 5);
  assert.ok(a.json('state.items').every(item => item.dueDate === a.run('addDaysStr(todayStr(),1)')));
  assert.equal(a.run('state.entryBook'), '数学の本');
  assert.equal(a.run('state.entryDraft.num'), '');
  a.input('entry-num','num','1,8');
  assert.match(a.document.getElementById('entry-preview').textContent, /跳过 1/);
  a.run('addItem()');
  assert.equal(a.run('state.items.length'), 6);
  a.input('entry-num','num','9-2');
  a.run('addItem()');
  assert.equal(a.run('state.items.length'), 6);
  assert.equal(a.run('state.entryDraft.num'), '9-2');
});

test('duplicate identity normalizes width and whitespace but keeps subjects separate', () => {
  const a = app();
  a.run(`state.items=[createItem('数学','数学の本 12','','2026-09-01')];`);
  assert.ok(a.run(`entryDuplicate('数学の本   １２')`));
  a.run(`state.entrySubject='物理';`);
  assert.equal(a.run(`entryDuplicate('数学の本 12')`), undefined);
});

test('failed storage does not clear a draft or pretend batch save succeeded', () => {
  const a = app();
  a.run(`state.view='entry';state.entryDraft.source='数学 p.5';render();localStorage.setItem=()=>{throw Error('quota');};`);
  a.run('addItem()');
  assert.equal(a.run('state.items.length'), 0);
  assert.equal(a.run('state.entryDraft.source'), '数学 p.5');
});

test('graduated failure returns tomorrow, slow returns in seven days, old events retain old rules', () => {
  const a = app();
  a.run(`const original={...createItem('数学','本 1','','2026-01-01'),status:'graduated',intervalIndex:4};`);
  for (const [rating, days] of [['×',1],['△',7],['○',30]]) {
    a.run(`var item=JSON.parse(JSON.stringify(original));applyRating(item,'${rating}','2026-09-05');`);
    assert.equal(a.run(`diffDays(item.dueDate,'2026-09-05')`), days);
    assert.equal(a.run('normalizeItem(item).history[0].scheduleVersion'), 2);
  }
  a.run(`var old=JSON.parse(JSON.stringify(original));applyRating(old,'×','2026-09-05',false,1);`);
  assert.equal(a.run(`diffDays(old.dueDate,'2026-09-05')`), 7);
  a.run(`var oldSlow=JSON.parse(JSON.stringify(original));applyRating(oldSlow,'△','2026-09-05',false,1);`);
  assert.equal(a.run(`diffDays(oldSlow.dueDate,'2026-09-05')`), 30);
  assert.deepEqual(a.json(`seqFor('化学・暗記')`), [1,2,4,7,14,30]);
});

test('mixed old/new history produces the same schedule after normalize, merge and replay', () => {
  const a = app();
  a.run(`var mixed=createItem('数学','本 1','','2026-01-01');
    for(const day of ['2026-01-02','2026-01-05','2026-01-12','2026-01-26','2026-02-25']) applyRating(mixed,'○',day,true,1);
    applyRating(mixed,'×','2026-09-05');
    var expected=JSON.parse(JSON.stringify(mixed));
    var replayed=recomputeItem(normalizeItem(mixed));`);
  assert.equal(a.run('replayed.dueDate'), '2026-09-06');
  assert.equal(a.run('replayed.intervalIndex'), a.run('expected.intervalIndex'));
  assert.equal(a.run('mergeItems(expected,replayed).dueDate'), '2026-09-06');
});

test('hints are escaped and collapsed in both review surfaces; button intervals match actual scheduling', () => {
  const a = app();
  a.run(`state.items=[createItem('数学','本 1','<b>关键提示</b>',addDaysStr(todayStr(),-1))];renderReview();`);
  let hint = a.document.querySelector('.review-hint');
  assert.ok(hint && !hint.hasAttribute('open'));
  assert.equal(hint.querySelector('b'), null);
  assert.match(hint.textContent, /<b>关键提示<\/b>/);
  assert.deepEqual([...a.document.querySelectorAll('.rate-next')].map(el=>el.textContent), ['3 天后','明天','明天']);
  a.run('startSession()');
  hint = a.document.querySelector('#session-root .review-hint');
  assert.ok(hint && !hint.hasAttribute('open'));
  assert.match(a.document.querySelector('.rating-guide').textContent, /提示/);
});

test('last-card undo remains on summary, stays unsent while undoable and cannot be resurrected by stale cloud history', () => {
  const a = app();
  a.run(`state.items=[createItem('数学','本 1','提示',addDaysStr(todayStr(),-1))];startSession();sessionRate('×');`);
  a.flush(110);
  assert.ok([...a.document.querySelectorAll('.session-summary button')].some(b=>b.textContent==='撤销上一题'));
  a.run(`var stale=JSON.parse(JSON.stringify(state.items[0]));var ratedEvent=state.items[0].history[0];`);
  assert.equal(a.run('learningOsPastUndoWindow(ratedEvent,Date.now()+60000)'), false);
  a.run('sessionUndo()');
  assert.equal(a.run('state.items[0].history.length'), 0);
  assert.equal(a.run('state.items[0].dueDate'), a.run('todayStr()'));
  a.run(`var merged=mergeItems(normalizeItem(state.items[0]),normalizeItem(stale));`);
  assert.equal(a.run('merged.history.length'), 0);
  assert.equal(a.run('merged.dueDate'), a.run('todayStr()'));
  a.run(`sessionRate('○');`);a.flush(110);
  a.run(`var finalEvent=state.items[0].history[0];endSession();`);a.flush(280);
  assert.equal(a.run('learningOsPastUndoWindow(finalEvent,Date.now()+60000)'), true);
});

test('rapid double-tap rates only one question and a five-question session respects its subject', () => {
  const a = app();
  a.run(`state.items=Array.from({length:12},(_,n)=>createItem(n<6?'数学':'物理','题 '+n,'',addDaysStr(todayStr(),-1)));startSession(5,'物理');`);
  assert.equal(a.run('session.queue.length'), 5);
  assert.ok(a.run(`session.queue.every(id=>state.items.find(i=>i.id===id).subject==='物理')`));
  a.run(`sessionRate('○');sessionRate('×');`);
  assert.equal(a.run('state.items.flatMap(i=>i.history).length'), 1);
});

test('empty states distinguish onboarding from a scheduled rest day and filters update counts', () => {
  const a = app();
  a.run('renderReview()');
  assert.match(a.document.getElementById('main').textContent, /添加第一题/);
  a.run(`state.items=[createItem('数学','本 1','','2026-12-01')];renderReview();`);
  assert.match(a.document.getElementById('main').textContent, /下次复习/);
  assert.doesNotMatch(a.document.getElementById('main').textContent, /添加第一题/);
  a.run(`renderLibrary();state.libSearch='不存在';renderLibraryListOnly();`);
  assert.equal(a.document.getElementById('lib-count').textContent, '共 0 题');
});

test('all five pages render, and focused mobile controls retain semantic labels', () => {
  const a = app();
  a.run(`state.items=[createItem('数学','很长的书名'.repeat(15),'提示',addDaysStr(todayStr(),-1))];`);
  for (const view of ['review','entry','library','stats','data']) {
    a.run(`navigate('${view}')`);
    assert.ok(a.document.getElementById('main').textContent.trim());
    assert.equal(a.document.querySelector('button[aria-current="page"]').getAttribute('data-view'), view);
  }
  a.run(`navigate('entry')`);
  assert.ok(a.document.querySelector('label[for="entry-note"]'));
  a.run(`navigate('library')`);
  assert.equal(a.document.querySelectorAll('.library-filters select[aria-label]').length, 3);
});
