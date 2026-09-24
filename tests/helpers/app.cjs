const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).filter(Boolean).join('\n');

// A DOM-only harness. No browser, real account, network, or user storage is used.
function app(storage = new Map()) {
  const { document } = parseHTML(html);
  const timers = new Map();
  let nextTimer = 1;
  const window = { navigator:{onLine:true}, __EJU_TEST__: true, scrollY: 0, addEventListener() {}, scrollTo({top}) { this.scrollY = top; } };
  const context = vm.createContext({ document, window, console: {...console,error(){}},
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

module.exports = { app };
