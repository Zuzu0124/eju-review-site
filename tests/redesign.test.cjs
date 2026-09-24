const {test}=require('node:test');
const assert=require('node:assert/strict');
const {app}=require('./helpers/app.cjs');
function due(a,n=3){a.run(`state.items=Array.from({length:${n}},(_,n)=>createItem('数学','数学の本 '+(n+1),'先独立完成',addDaysStr(todayStr(),-2)));saveItems(state.items);`);}
function reload(a){const b=app(a.storage);b.run('readLatestReviewItems();restoreSession();');return b;}

function installedViewport(a) {
 a.run(`window.navigator.standalone=true;window.innerHeight=812;window.screen={width:402,height:874};
  var layoutHeight=812;Object.defineProperty(document.documentElement,'clientHeight',{get:()=>layoutHeight});
  window.visualViewport={height:812,scale:1};var shellEvents={};window.addEventListener=(name,fn)=>shellEvents[name]=fn;
  initStandaloneShell();`);
}
function diagnosticViewport(a) {
 installedViewport(a);
 a.run(`window.getComputedStyle=el=>({position:'static',paddingTop:'9px',paddingRight:'0px',paddingBottom:el===document.querySelector('.nav-bar')?'105px':'96px',paddingLeft:'0px',getPropertyValue:()=> '"2026-09-24.4"'});
  document.body.getBoundingClientRect=()=>({top:0,bottom:812,height:812,width:402});
  document.querySelector('.nav-bar').getBoundingClientRect=()=>({top:643,bottom:812,height:169,width:402});`);
}
test('display diagnostics distinguish excess safe padding from a gap outside the footer',()=>{
 const a=app();diagnosticViewport(a);
 let d=a.json('collectDisplayDiagnostics()');
 assert.equal(d.safeArea.bottom,96);assert.equal(d.navStyle.paddingBottom,'105px');assert.equal(d.gapWithinBody,0);
 a.run(`document.querySelector('.nav-bar').getBoundingClientRect=()=>({top:643,bottom:750,height:107,width:402});`);
 d=a.json('collectDisplayDiagnostics()');assert.equal(d.gapWithinBody,62);
 assert.equal(d.screen.height,874);assert.equal(d.layout.height,812);
});
test('diagnostics expose mismatched CSS versions without collecting private app data',()=>{
 const a=app();diagnosticViewport(a);
 a.run(`state.items=[createItem('数学','PRIVATE_BOOK_ABC','PRIVATE_NOTE_DEF',todayStr())];
  window.location={href:'https://example.test/?token=PRIVATE_TOKEN_GHI'};
  localStorage.getItem=()=>{throw Error('Diagnostics must not read storage');};
  var oldComputed=window.getComputedStyle;window.getComputedStyle=el=>({...oldComputed(el),getPropertyValue:()=> '"2026-09-24.3"'});`);
 const d=a.json('collectDisplayDiagnostics()');
 assert.equal(d.version,'2026-09-24.4');assert.equal(d.cssVersion,'2026-09-24.3');
 assert.doesNotMatch(JSON.stringify(d),/PRIVATE_|token|items|email/);
 assert.equal(a.document.querySelectorAll('[aria-hidden="true"]').length,0);
});
test('display info remains selectable when clipboard access is unavailable',async()=>{
 const a=app();diagnosticViewport(a);a.run(`state.view='data';renderData();window.navigator.clipboard={writeText:async()=>{throw Error('denied');}};`);
 await a.run('copyDisplayDiagnostics()');
 assert.match(a.document.querySelector('#display-diagnostic').textContent,/"version": "2026-09-24.4"/);
 assert.match(a.document.querySelector('.toast').textContent,/自动复制不可用/);
});
test('reload preserves saved records and stops for unsaved edits or failed checkpoints',()=>{
 const a=app();due(a);
 const savedItems=a.storage.get('eju.items.v2');
 a.run(`window.location={href:'https://example.test/eju/?v=3',replace:url=>{window.reloadedTo=url;}};
  libraryEdits.set('draft',{source:'未保存'});reloadForUpdate();`);
 assert.equal(a.run('window.reloadedTo'),undefined);
 a.run(`libraryEdits.clear();startSession();var originalSet=localStorage.setItem;localStorage.setItem=()=>{throw Error('quota');};reloadForUpdate();`);
 assert.equal(a.run('window.reloadedTo'),undefined);
 a.run(`localStorage.setItem=originalSet;reloadForUpdate();`);
 const target=new URL(a.run('window.reloadedTo'));
 assert.equal(target.origin,'https://example.test');assert.equal(target.pathname,'/eju/');assert.ok(target.searchParams.get('eju_reload'));
 assert.equal(a.storage.get('eju.items.v2'),savedItems);
 assert.ok(a.storage.has('eju.session.v1'));
});
test('installed shell uses available web height when the OS owns part of the screen',()=>{
 const a=app();installedViewport(a);
 const height=()=>a.document.documentElement.style.getPropertyValue('--standalone-app-height');
 assert.equal(height(),'812px');
 a.run(`layoutHeight=600;window.innerHeight=600;shellEvents.resize();`);a.flush(0);
 assert.equal(height(),'600px');
 a.run(`layoutHeight=360;window.innerHeight=360;shellEvents.orientationchange();`);a.flush(150);
 assert.equal(height(),'360px');
 a.run(`layoutHeight=812;window.innerHeight=812;shellEvents.pageshow();`);a.flush(500);
 assert.equal(height(),'812px');
});
test('keyboard resizes the installed scroll area and closing it restores the footer state',()=>{
 const a=app();installedViewport(a);
 a.run(`var activeInput=document.createElement('input');Object.defineProperty(document,'activeElement',{configurable:true,get:()=>activeInput});
  window.innerHeight=440;window.visualViewport.height=440;updateKeyboardViewport();`);
 assert.ok(a.document.documentElement.classList.contains('keyboard-open'));
 assert.equal(a.document.documentElement.style.getPropertyValue('--standalone-app-height'),'440px');
 a.run(`window.visualViewport.height=812;window.innerHeight=812;updateKeyboardViewport();`);
 assert.equal(a.document.documentElement.classList.contains('keyboard-open'),false);
 assert.equal(a.document.documentElement.style.getPropertyValue('--standalone-app-height'),'812px');
 // Some iOS returns from the app switcher omit visualViewport.resize.
 a.run(`window.visualViewport.height=440;updateKeyboardViewport();window.visualViewport.height=812;shellEvents.pageshow();`);
 a.flush(500);
 assert.equal(a.document.documentElement.classList.contains('keyboard-open'),false);
 assert.equal(a.document.documentElement.style.getPropertyValue('--standalone-app-height'),'812px');
});
test('pinch zoom and a smaller visual viewport without input do not trigger keyboard layout',()=>{
 const a=app();installedViewport(a);
 a.run(`Object.defineProperty(document,'activeElement',{get:()=>document.createElement('input')});
  window.visualViewport.height=406;window.visualViewport.scale=2;updateKeyboardViewport();`);
 assert.equal(a.document.documentElement.classList.contains('keyboard-open'),false);
 assert.equal(a.document.documentElement.style.getPropertyValue('--standalone-app-height'),'812px');
 const b=app();installedViewport(b);b.run(`window.visualViewport.height=600;updateKeyboardViewport();`);
 assert.equal(b.document.documentElement.classList.contains('keyboard-open'),false);
 assert.equal(b.document.documentElement.style.getPropertyValue('--standalone-app-height'),'812px');
});
test('browser mode keeps native layout and invalid startup metrics cannot write NaN heights',()=>{
 const a=app();a.run('initStandaloneShell()');
 assert.equal(a.document.documentElement.classList.contains('standalone-shell'),false);
 assert.equal(a.document.documentElement.style.getPropertyValue('--standalone-app-height')||'','');
 a.run(`window.navigator.standalone=true;initStandaloneShell();`);
 assert.equal(a.document.documentElement.style.getPropertyValue('--standalone-app-height')||'','');
 a.run(`window.innerHeight=700;updateStandaloneShellHeight();`);
 assert.equal(a.document.documentElement.style.getPropertyValue('--standalone-app-height'),'700px');
});

test('home prioritizes five questions and lazily groups 1000 overdue items',()=>{
 const a=app();due(a,1000);a.run('renderReview()');
 assert.equal(a.document.querySelectorAll('.task-card').length,0);
 assert.match(a.document.querySelector('.plan-count').textContent,/5/);
 assert.match(a.document.querySelector('.home-ledger').textContent,/1000/);
 a.run(`fillSubjectGroup(document.querySelector('.subject-group'));`);
 assert.equal(a.document.querySelectorAll('.book-group').length,1);
 a.run(`document.querySelector('.book-group').__fill();`);
 assert.equal(a.document.querySelectorAll('.task-card').length,1000);
});

test('source parsing is display-only, preserves fullwidth source and unsplittable title',()=>{
 const a=app();a.run(`var raw=createItem('数学','数学の本 p.１２ 例３','',todayStr());var original=JSON.stringify(raw);`);
 assert.deepEqual(a.json('sourceParts(raw)'),{book:'数学の本',location:'p.１２ 例３'});
 assert.equal(a.run('JSON.stringify(raw)'),a.run('original'));
 a.run(`raw.source='長い書名だけ'.repeat(30);`);
 assert.equal(a.run('sourceParts(raw).location'),'');
});

test('paused session survives reload and retains undo protection before Sheets recovery',()=>{
 const a=app();due(a);a.run(`startSession(3,'数学');sessionRate('○');`);a.flush(110);a.run('endSession()');a.flush(220);
 assert.match(a.document.querySelector('.cta').textContent,/继续复习/);
 const b=reload(a);assert.equal(b.run('session.idx'),1);assert.equal(b.run(`session.counts['○']`),1);
 assert.equal(b.run('learningOsReadyAt(state.items[0].history[0])'),Infinity);
 b.run('resumeSession()');assert.match(b.document.querySelector('.session-question').textContent,/2/);
 b.run('sessionUndo()');assert.equal(b.run('state.items[0].history.length'),0);
});

test('reload between item commit and final checkpoint recovers one real result',()=>{
 const a=app();due(a);a.run(`startSession();var originalSet=localStorage.setItem;var writes=0;localStorage.setItem=(k,v)=>{if(++writes===3)throw Error('interrupted');originalSet(k,v);};sessionRate('△');`);
 const b=reload(a);assert.equal(b.run('session.results.length'),1);assert.equal(b.run('session.idx'),1);
 b.run(`resumeSession();sessionRate('○');`);b.flush(110);
 assert.equal(b.run('state.items.flatMap(i=>i.history).length'),2);
});

test('failed item write after checkpoint neither records nor advances on reload',()=>{
 const a=app();due(a);a.run(`startSession();var originalSet=localStorage.setItem;localStorage.setItem=(k,v)=>{if(k===KEYS.ITEMS)throw Error('quota');originalSet(k,v);};sessionRate('×');`);
 assert.equal(a.run('session.idx'),0);assert.equal(a.run('state.items[0].history.length'),0);
 const b=reload(a);assert.equal(b.run('session.idx'),0);assert.equal(b.run('session.results.length'),0);
});

test('restore skips deleted or newly reviewed questions, even if latest due date is past',()=>{
 const a=app();due(a);a.run(`startSession();endSession();`);a.flush(220);
 a.run(`state.items.splice(0,1);applyRating(state.items[0],'×',addDaysStr(todayStr(),-2));saveItems(state.items);`);
 const b=reload(a);b.run('resumeSession()');
 assert.equal(b.run('session.idx'),2);assert.match(b.document.querySelector('.session-question').textContent,/3/);
 assert.equal(b.run('session.results.length'),0);
});

test('stale displayed question is reconciled at scoring time, without rating the next question',()=>{
 const a=app();due(a);a.run(`startSession();var changed=JSON.parse(localStorage.getItem(KEYS.ITEMS));applyRating(changed[0],'×',addDaysStr(todayStr(),-2));localStorage.setItem(KEYS.ITEMS,JSON.stringify(changed));sessionRate('○');`);
 assert.equal(a.run('session.idx'),1);assert.equal(a.run('session.results.length'),0);
 assert.equal(a.run('state.items[1].history.length'),0);
});

test('undo failure preserves event, schedule and cancellation IDs',()=>{
 const a=app();due(a);a.run(`startSession();sessionRate('×');`);a.flush(110);
 a.run(`var before=JSON.stringify(state.items);var originalSet=localStorage.setItem;localStorage.setItem=(k,v)=>{if(k===KEYS.ITEMS)throw Error('quota');originalSet(k,v);};sessionUndo();`);
 assert.deepEqual(a.json('state.items'),JSON.parse(a.run('before')));assert.equal(a.run('session.results.length'),1);
});

test('undo tombstone survives reload and an older cloud merge',()=>{
 const a=app();due(a,1);a.run(`startSession();sessionRate('×');`);a.flush(110);
 a.run(`var stale=JSON.parse(JSON.stringify(state.items));sessionUndo();`);
 const stale=a.json('stale'),b=reload(a);b.run(`applyMergedCloudData(${JSON.stringify({items:stale})});`);
 assert.equal(b.run('state.items[0].history.length'),0);assert.equal(b.run('state.items[0].removedReviewIds.length'),1);
});

test('reduced motion still guards rapid scoring; scripted duplicate click detail is ignored',()=>{
 const a=app();due(a);a.run(`state.preferences.motion='reduced';startSession();sessionRate('○');sessionRate('×');`);
 assert.equal(a.run('session.results.length'),1);a.flush(110);
 a.run(`sessionRate('○',{detail:2});`);assert.equal(a.run('session.results.length'),1);
 a.run(`sessionRate('△',{detail:1});`);assert.equal(a.run('session.results.length'),2);
});

test('completion shows actual ratings, excludes skipped items and supports the next group',()=>{
 const a=app();due(a,7);a.run(`startSession(2);sessionRate('○');`);a.flush(110);a.run(`sessionRate('×');`);a.flush(110);
 const text=a.document.querySelector('.session-summary').textContent;
 assert.match(text,/本轮实际记录 2 题/);assert.match(text,/继续一组/);assert.match(text,/今天到这里/);
 assert.doesNotMatch(text,/\d+%|用时约/);
 a.run('continueSessionGroup()');assert.equal(a.run('session.queue.length'),2);assert.equal(a.run('session.results.length'),0);
 assert.equal(a.run('state.items.flatMap(i=>i.history).length'),2);
});

test('entry success preserves the same input DOM, context and unused manual draft',()=>{
 const a=app();a.run(`state.view='entry';selectBook('数学の本');state.entryDraft.source='其他手动草稿';state.entryDraft.num='10';renderEntry();`);
 const input=a.document.getElementById('entry-num');a.run('addItem()');
 assert.equal(a.document.getElementById('entry-num'),input);assert.equal(input.value,'');
 assert.equal(a.run('state.entryDraft.source'),'其他手动草稿');assert.equal(a.run('state.entryBook'),'数学の本');
 assert.match(a.document.getElementById('entry-success').textContent,/本机已添加 1 题/);
});

test('batch entry undo survives a stale cloud copy and preserves the next draft',()=>{
 const a=app();a.run(`state.view='entry';selectBook('数学の本');state.entryDraft.num='1-3';state.entryDraft.batch=true;renderEntry();addItem();var stale=JSON.parse(JSON.stringify(state.items));state.entryDraft.num='4';cancelAddedItems(state.items.map(i=>i.id));applyMergedCloudData({items:stale});`);
 assert.equal(a.run('state.items.length'),0);assert.equal(a.run('state.deletedItemIds.length'),3);assert.equal(a.run('state.entryDraft.num'),'4');
 const b=reload(a);assert.equal(b.run('state.items.length'),0);
});

test('cancelled entry write failure does not delete recorded items',()=>{
 const a=app();a.run(`state.view='entry';selectBook('数学の本');state.entryDraft.num='1';renderEntry();addItem();localStorage.setItem=()=>{throw Error('quota');};cancelAddedItems(state.items.map(i=>i.id));`);
 assert.equal(a.run('state.items.length'),1);assert.equal(a.run('state.deletedItemIds.length'),0);
});

test('import cancel is a no-op, replace requires a second explicit action',()=>{
 const a=app();due(a);const original=a.storage.get('eju.items.v2');
 a.run(`prepareImport({items:[]});doImport('cancel');`);assert.equal(a.storage.get('eju.items.v2'),original);
 a.run(`prepareImport({items:[]});doImport('replace');`);assert.equal(a.run('state.items.length'),3);
 assert.match(a.document.querySelector('.modal-panel').textContent,/确认替换 3 题/);
 a.run(`doImport('cancel');`);assert.equal(a.storage.get('eju.items.v2'),original);
});

test('replace affects items and books, clears session and prevents stale-cloud resurrection',()=>{
 const a=app();due(a);a.run(`var stale=JSON.parse(JSON.stringify(state.items));startSession();endSession();`);a.flush(220);
 a.run(`prepareImport({items:[createItem('物理','新书 1','',todayStr())],books:{'mondai|物理':['新书']}});doImport('replace',true);applyMergedCloudData({items:stale});`);
 assert.equal(a.run('state.items.length'),1);assert.equal(a.run('state.items[0].subject'),'物理');assert.equal(a.run('session'),null);
 assert.deepEqual(a.json('state.books'),{'mondai|物理':['新书']});
});

test('merge import respects event IDs and cancellation history',()=>{
 const a=app();due(a,1);a.run(`applyRating(state.items[0],'○',todayStr());var original=JSON.parse(JSON.stringify(state.items[0]));prepareImport({items:[original,original]});doImport('merge');`);
 assert.equal(a.run('state.items.length'),1);assert.equal(a.run('state.items[0].history.length'),1);
});

test('failed import transaction leaves existing data, book list and dialog available',()=>{
 const a=app();due(a);a.run(`prepareImport({items:[],books:{}});localStorage.setItem=()=>{throw Error('quota');};doImport('replace',true);`);
 assert.equal(a.run('state.items.length'),3);assert.ok(a.run('pendingImport'));assert.ok(a.document.querySelector('[role="dialog"]'));
});

test('interrupted multi-key import remains durable and accepts later edits',()=>{
 const a=app();due(a);a.run(`prepareImport({items:[createItem('物理','新书 1','',todayStr())],books:{'mondai|物理':['新书']}});var originalSet=localStorage.setItem;localStorage.setItem=(k,v)=>{if(k===KEYS.BOOKS)throw Error('quota');originalSet(k,v);};doImport('replace',true);state.items[0].note='之后的修改';saveItems(state.items);`);
 assert.ok(a.storage.get('eju.dataTransaction.v1'));
 const b=reload(a);assert.equal(b.run('state.items.length'),1);assert.equal(b.run('state.items[0].note'),'之后的修改');
});

test('library keeps all active filters visible, retains edit drafts and restores scroll',()=>{
 const a=app();due(a,20);a.run(`state.view='library';state.libSubject='数学';state.libStatus='due';state.libSearch='数学の本';renderLibrary();window.scrollY=560;toggleLibItem(state.items[0].id);updateLibraryEdit(state.items[0].id,'note','编辑中的长备注');renderLibrary();`);
 assert.equal(a.document.querySelectorAll('.filter-chip').length,3);
 assert.equal(a.document.getElementById('edit-note-'+a.run('state.items[0].id')).value,'编辑中的长备注');
 a.run(`window.scrollY=820;saveItemEdit(state.items[0].id);`);assert.equal(a.run('window.scrollY'),560);assert.equal(a.run('state.items[0].note'),'编辑中的长备注');
});

test('library save failure retains edits and original record',()=>{
 const a=app();due(a);a.run(`state.view='library';renderLibrary();toggleLibItem(state.items[0].id);`);
 const note=a.document.getElementById('edit-note-'+a.run('state.items[0].id'));note.value='不应存入';
 a.run(`localStorage.setItem=()=>{throw Error('quota');};saveItemEdit(state.items[0].id);`);
 assert.equal(a.run('state.items[0].note'),'先独立完成');assert.equal(note.value,'不应存入');
});

test('theme preference persists; reduced system motion overrides full transitions',()=>{
 const a=app();a.run(`setPreference('theme','dark');setPreference('motion','reduced');`);
 assert.equal(a.document.documentElement.dataset.theme,'dark');assert.equal(a.run('prefersReducedMotion()'),true);
 assert.equal(JSON.parse(a.storage.get('eju.preferences.v1')).theme,'dark');
 a.run(`state.preferences.motion='system';window.matchMedia=()=>({matches:true});`);assert.equal(a.run('prefersReducedMotion()'),true);
});

test('status distinguishes local, cloud and Sheets outcomes and exposes an error indicator',()=>{
 const a=app();due(a,1);a.run(`applyRating(state.items[0],'×',todayStr());state.items[0].history[0].learningOsSync='error';state.sync.user={id:'mock'};state.sync.status='已同步';renderData();updateSyncIndicators();`);
 const text=a.document.getElementById('main').textContent;
 assert.match(text,/本机已保存/);assert.match(text,/云端/);assert.match(text,/Learning OS \/ Sheets/);assert.match(text,/已同步 0 条 · 待处理 1 条/);
 assert.ok(a.document.querySelector('.settings-link.has-error'));assert.match(a.run('syncLabel()'),/Learning OS 同步失败/);
});

test('upload failure is not overwritten by pull completion',async()=>{
 const a=app();due(a,1);a.run(`state.sync.user={id:'mock'};supabaseClient={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{data:{items:[]}}})})}),upsert:async()=>({error:{message:'simulated upload failure'}})})};`);
 const result=await a.run('pullCloudData(true)');assert.equal(result,false);assert.match(a.run('state.sync.status'),/同步失败/);
});

test('network exception keeps local data and a truthful sync failure',async()=>{
 const a=app();due(a);a.run(`state.sync.user={id:'mock'};supabaseClient={from:()=>({upsert:async()=>{throw Error('offline')}})};`);
 assert.equal(await a.run('pushCloudData(true)'),false);assert.match(a.run('state.sync.status'),/失败/);assert.equal(a.run('state.items.length'),3);
});

test('changes made during cloud upload remain pending rather than being labelled synced',async()=>{
 const a=app();due(a);a.run(`state.sync.user={id:'mock'};supabaseClient={from:()=>({upsert:()=>new Promise(resolve=>{window.finishUpload=resolve;})})};`);
 const result=a.run('pushCloudData(true)');a.run(`state.items[0].note='new local edit';window.finishUpload({});`);
 assert.equal(await result,false);assert.equal(a.run('state.sync.status'),'待上传');
});


test('complete initialization recovers a remembered session without network access',()=>{
 const a=app();due(a);a.run(`startSession();sessionRate('△');`);a.flush(110);
 const b=app(a.storage);b.run('init()');
 assert.equal(b.run('state.items.length'),3);assert.equal(b.run('session.results.length'),1);
 assert.match(b.document.querySelector('.cta').textContent,/继续复习/);
 assert.equal(b.document.querySelectorAll('.nav-bar .nav-btn').length,4);
});


test('refreshing local state preserves a pending Sheets request result',()=>{
 const a=app();due(a,1);a.run(`applyRating(state.items[0],'○',todayStr());saveItems(state.items);var event=state.items[0].history[0];readLatestReviewItems();event.learningOsSync='synced';saveItems(state.items);`);
 assert.equal(a.json('JSON.parse(localStorage.getItem(KEYS.ITEMS))')[0].history[0].learningOsSync,'synced');
});


test('explicit backup replacement restores original IDs after entry undo, despite stale cloud cancellation',()=>{
 const a=app();a.run(`state.view='entry';selectBook('数学の本');state.entryDraft.num='19';renderEntry();addItem();var backup=JSON.parse(JSON.stringify({items:state.items,books:state.books}));cancelAddedItems(state.items.map(i=>i.id));var deleted=cloudDataPayload();prepareImport(backup);doImport('replace',true);applyMergedCloudData(deleted);`);
 assert.equal(a.run('state.items.length'),1);assert.equal(a.run('state.items[0].id'),a.run('backup.items[0].id'));
 assert.equal(a.run('state.deletedItemIds.length'),0);
 a.run(`cancelAddedItems(state.items.map(i=>i.id));applyMergedCloudData(backup);`);assert.equal(a.run('state.items.length'),0);
});
