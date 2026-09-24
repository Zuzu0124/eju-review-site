const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {fixture}=require('../tests/helpers/fixtures.cjs');
const root=path.resolve(__dirname,'..');
const demo=process.argv.includes('--demo');
const host=process.argv.find(a=>a.startsWith('--host='))?.split('=')[1]||'127.0.0.1';
const port=Number(process.argv.find(a=>a.startsWith('--port='))?.split('=')[1]||(demo?4174:4173));
const scenarios=['normal','empty','overdue','long','save-failure','sync-failure'];
function demoBootstrap(scenario){
 const data=fixture(scenario);
 // Uses a private sessionStorage namespace instead of the real localStorage.
 // The production SDK is removed from the demo response and no cloud client is created.
 return `<script>(()=>{
 const scenario=${JSON.stringify(scenario)},seed=${JSON.stringify(data).replace(/</g,'\\u003c')};
 const prefix='eju-isolated-demo-v1:'+scenario+':';
 const storage={getItem:k=>sessionStorage.getItem(prefix+k),setItem:(k,v)=>{if(scenario==='save-failure'&&k==='eju.items.v2')throw Error('模拟存储失败');sessionStorage.setItem(prefix+k,String(v));},removeItem:k=>sessionStorage.removeItem(prefix+k)};
 if(!sessionStorage.getItem(prefix+'seeded')){
   sessionStorage.setItem(prefix+'eju.items.v2',JSON.stringify(seed.items));
   sessionStorage.setItem(prefix+'eju.books.v1',JSON.stringify(seed.books));
   sessionStorage.setItem(prefix+'seeded','1');
 }
 Object.defineProperty(window,'localStorage',{value:storage});
})();</script>`;
}
http.createServer((req,res)=>{
 let url;
 try{url=new URL(req.url,'http://localhost');}catch(_){res.writeHead(400).end();return;}
 if(demo&&url.pathname==='/'){
   res.setHeader('Content-Type','text/html; charset=utf-8');
   res.end(`<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EJU 模拟数据预览</title><link rel="stylesheet" href="/assets/eju.css"><main class="app"><h1>模拟数据预览</h1><p>每个场景的数据独立保存于当前标签页，刷新可恢复。不会读取真实学习数据，也不会连接云端或 Sheets。</p>${scenarios.map((s,n)=>`<p><a class="btn secondary" href="/demo?scenario=${s}">${['正常题量','空状态','1000 道逾期题','长书名和长备注','本机保存失败','同步失败'][n]}</a></p>`).join('')}</main></html>`);return;
 }
 if(url.pathname==='/'||url.pathname==='/index.html'||demo&&url.pathname==='/demo'){
   let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
   if(demo){const scenario=scenarios.includes(url.searchParams.get('scenario'))?url.searchParams.get('scenario'):'normal';
     html=html.replace('<head>','<head>'+demoBootstrap(scenario)).replace(/<script src="https:\/\/cdn\.jsdelivr\.net[^>]+><\/script>/,'').replace('<title>EJU 间隔复习</title>','<title>模拟数据 · EJU 间隔复习</title>');
   }
   res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(html);return;
 }
 const allowed=['/assets/eju.css','/assets/noto-serif-cjk-v1.css','/assets/morning-mist.svg','/assets/morning-mist-dark.svg'];
 if(!allowed.includes(url.pathname)){res.writeHead(404).end('Not found');return;}
 res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css; charset=utf-8':'image/svg+xml');res.end(fs.readFileSync(path.join(root,url.pathname)));
}).listen(port,host,()=>console.log(`EJU ${demo?'isolated demo':'local app'}: http://${host}:${port}`));
