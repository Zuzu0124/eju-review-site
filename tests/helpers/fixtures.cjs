// Fictional records only. Relative dates keep the preview useful after today.
function fixture(scenario='normal',today=new Date().toLocaleDateString('en-CA')) {
 const day=n=>{const d=new Date(today+'T12:00:00');d.setDate(d.getDate()+n);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
 const subjects=['数学','物理','化学-理论','化学-记忆'];
 const names=['元気が出る数学','物理のエッセンス 赤','基礎問題精講','福間の無機化学'];
 const books=Object.fromEntries(subjects.map((s,n)=>['mondai|'+s,[names[n]]]));
 if(scenario==='long')books['mondai|数学']=['数学の基礎から応用まで・詳しい解説と演習を収録した長い書名の参考書'.repeat(4)];
 const size=scenario==='empty'?0:scenario==='overdue'?1000:24;
 const items=Array.from({length:size},(_,n)=>{
   const subject=subjects[n%4],book=books['mondai|'+subject][0];
   const item={id:'demo-item-'+n,board:'mondai',subject,source:book+' '+(n+12),note:scenario==='long'?'これは長いメモです。<b>表示は文字のまま</b>\n'.repeat(80):'先独立完成。回看时注意条件、单位与符号。',addedDate:day(-30),intervalIndex:1,dueDate:day(scenario==='overdue'?-(n%90+1):n<12?-(n%5):1+n%7),history:[],status:'learning',updatedAt:day(0)+'T08:00:00Z'};
   if(n>=16||scenario==='sync-failure'&&n===0){
     item.history=[0,1,2].map((v)=>({id:'demo-event-'+n+'-'+v,date:day(v-2),rating:n%2?'×':v===2?'○':'△',scheduleVersion:2,createdAt:day(v-2)+'T06:00:00Z',learningOsSync:scenario==='sync-failure'?'error':'synced',...(scenario==='sync-failure'?{learningOsMessage:'模拟：同步服务暂时不可用'}:{})}));
   }
   return item;
 });
 return {items,books};
}
module.exports={fixture};
