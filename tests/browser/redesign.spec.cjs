// Prepared for local execution; NOT executed in the authoring environment.
// All storage is a fresh browser context containing synthetic data only.
const {test,expect}=require('@playwright/test');
const {fixture}=require('../helpers/fixtures.cjs');
async function seed(page,scenario='normal') {
 await page.route(/^https:\/\//,route=>route.abort());
 await page.addInitScript(({items,books,scenario})=>{
   if(!localStorage.getItem('eju.qa.seeded')){
     localStorage.setItem('eju.items.v2',JSON.stringify(items));localStorage.setItem('eju.books.v1',JSON.stringify(books));localStorage.setItem('eju.qa.seeded','1');
   }
   if(scenario==='save-failure'){
     const set=Storage.prototype.setItem;
     Storage.prototype.setItem=function(k,v){if(k==='eju.items.v2')throw Error('simulated quota');return set.call(this,k,v);};
   }
 },{...fixture(scenario),scenario});
 await page.goto('/');
}
async function capture(page,info,name){await page.screenshot({path:info.outputPath(name+'.png'),fullPage:true});}
async function noHorizontalOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}

test('installed shell footer stays at its viewport edge across scroll, return and rotation',async({page},info)=>{
 await page.setViewportSize({width:402,height:812});
 await page.addInitScript(()=>{
   Object.defineProperty(navigator,'standalone',{get:()=>true});
   Object.defineProperty(screen,'height',{get:()=>874});
 });
 await seed(page,'overdue');
 const aligned=async()=>{
   const bounds=await page.evaluate(()=>({
     height:document.documentElement.clientHeight,
     nav:document.querySelector('.nav-bar').getBoundingClientRect().bottom,
     app:document.querySelector('.app').getBoundingClientRect().bottom,
     navTop:document.querySelector('.nav-bar').getBoundingClientRect().top,
   }));
   expect(bounds.nav).toBeCloseTo(bounds.height,0);
   expect(bounds.app).toBeCloseTo(bounds.navTop,0);
 };
 await aligned();await capture(page,info,'standalone-home');
 await page.getByRole('button',{name:'题库',exact:true}).click();
 await page.locator('.app').evaluate(el=>el.scrollTo({top:300}));
 await aligned();
 await page.getByRole('button',{name:'足迹',exact:true}).click();
 await page.getByRole('button',{name:'题库',exact:true}).click();
 expect(await page.locator('.app').evaluate(el=>el.scrollTop)).toBeCloseTo(300,0);
 await page.setViewportSize({width:844,height:390});
 await expect.poll(()=>page.evaluate(()=>document.body.getBoundingClientRect().height)).toBeCloseTo(390,0);
 await aligned();
 await page.getByRole('button',{name:'今日',exact:true}).click();
 await page.getByRole('button',{name:'开始这一组'}).click();
 await expect.poll(()=>page.locator('.session').evaluate(el=>el.getBoundingClientRect().bottom)).toBeCloseTo(390,0);
 await expect(page.locator('.session-rate')).toBeInViewport();
});

test('home → review → restore → undo → completion with stable controls',async({page},info)=>{
 await seed(page);await noHorizontalOverflow(page);
 await expect(page.getByRole('button',{name:'开始这一组'})).toBeVisible();
 await expect(page.locator('.task-card')).toHaveCount(0);await capture(page,info,'01-home');
 await page.getByRole('button',{name:'开始这一组'}).click();
 await expect(page.locator('.session-book')).toBeVisible();
 const controls=await page.locator('.session-rate').boundingBox();
 await capture(page,info,'02-review');
 await page.locator('.session-rate button').nth(0).click();
 await expect(page.locator('.session-count')).toHaveText('2/5');
 await expect(page.locator('.session-rate button').nth(0)).toBeEnabled();
 expect((await page.locator('.session-rate').boundingBox()).y).toBeCloseTo(controls.y,0);
 await page.reload();await page.getByRole('button',{name:'继续复习'}).click();
 await expect(page.locator('.session-count')).toHaveText('2/5');
 await page.getByRole('button',{name:'撤销上一题'}).click();
 await expect(page.locator('.session-count')).toHaveText('1/5');
 for(let n=0;n<5;n++){
   await expect(page.locator('.session-rate button').nth(n%3)).toBeEnabled();
   await page.locator('.session-rate button').nth(n%3).click();
   if(n<4)await expect(page.locator('.session-count')).toHaveText((n+2)+'/5');
 }
 await expect(page.getByRole('dialog',{name:'本轮复习结果'})).toBeVisible();
 await expect(page.locator('.sum-sub')).toContainText('实际记录 5 题');
 await capture(page,info,'03-completion');
 await page.getByRole('button',{name:'今天到这里'}).click();
 await expect(page.locator('#session-root')).toBeEmpty();
 expect(await page.evaluate(()=>localStorage.getItem('eju.session.v1'))).toBeNull();
});

test('continuous entry keeps focus; undo preserves the next draft',async({page},info)=>{
 await seed(page);await page.getByRole('button',{name:'录入',exact:true}).click();
 await page.locator('#entry-num').fill('500');await page.getByRole('button',{name:'添加到复习安排'}).click();
 await expect(page.locator('#entry-num')).toBeFocused();await expect(page.locator('#entry-num')).toHaveValue('');
 await page.locator('#entry-num').fill('501');
 await page.getByRole('button',{name:'撤销',exact:true}).click();
 await expect(page.locator('#entry-num')).toHaveValue('501');
 await capture(page,info,'04-entry');await noHorizontalOverflow(page);
});

test('library filters and edit-return preserve position; footprints and settings render',async({page},info)=>{
 await seed(page,'overdue');await page.getByRole('button',{name:'题库',exact:true}).click();
 await page.getByRole('combobox',{name:'科目',exact:true}).selectOption('物理');
 await expect(page.locator('.filter-chip')).toContainText('物理');
 const row=page.locator('.lib-item').nth(20);
 await row.scrollIntoViewIfNeeded();const top=await page.evaluate(()=>window.scrollY);
 await row.locator('.lib-main').click();await row.locator('textarea').fill('回看单位');
 await row.getByRole('button',{name:'保存修改'}).click();
 expect(await page.evaluate(()=>window.scrollY)).toBeCloseTo(top,0);
 await page.getByRole('button',{name:'题库',exact:true}).click();
 await capture(page,info,'05-library');
 await page.getByRole('button',{name:'足迹',exact:true}).click();await capture(page,info,'06-footprints');
 await page.getByRole('button',{name:'设置与同步'}).click();await page.locator('#theme-setting').selectOption('dark');
 await capture(page,info,'07-settings-dark');await noHorizontalOverflow(page);
});

test('double click records one event; reduced motion has no running animations',async({page})=>{
 await seed(page);await page.emulateMedia({reducedMotion:'reduce'});
 await page.getByRole('button',{name:'开始这一组'}).click();
 const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('eju.items.v2')).flatMap(i=>i.history).length);
 await page.locator('.session-rate button').nth(0).dblclick();
 await expect(page.locator('.session-count')).toHaveText('2/5');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('eju.items.v2')).flatMap(i=>i.history).length)).toBe(initial+1);
 expect(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length)).toBe(0);
});

for(const scenario of ['empty','long','save-failure','sync-failure'])test('fixture '+scenario,async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await seed(page,scenario);
 await noHorizontalOverflow(page);await capture(page,info,'fixture-'+scenario);
 if(scenario==='long'){
   await page.getByRole('button',{name:'开始这一组'}).click();
   await page.locator('.review-hint summary').click();
   await noHorizontalOverflow(page);await expect(page.locator('.session-rate')).toBeInViewport();
   await capture(page,info,'fixture-long-review');
 }
 if(scenario==='save-failure'){
   await page.getByRole('button',{name:'录入',exact:true}).click();await page.locator('#entry-num').fill('9000');
   await page.getByRole('button',{name:'添加到复习安排'}).click();await expect(page.locator('#entry-num')).toHaveValue('9000');
 }
 expect(errors).toEqual([]);
});
