const KEY='jpStudyDataV1';
const SYNC_META_KEY='jpStudySyncMetaV1';
const PRE_SYNC_BACKUP_PREFIX='jpStudyPreSyncBackup-';
const lessonParts=['単語','文法①','文法②','本文','本文リスニング','音読'];
const defaultVocab=[
  ['学生','がくせい','学生'],['先生','せんせい','老师'],['友達','ともだち','朋友'],['学校','がっこう','学校'],['日本語','にほんご','日语'],['今日','きょう','今天'],['昨日','きのう','昨天'],['明日','あした','明天'],['食べる','たべる','吃'],['飲む','のむ','喝'],['行く','いく','去'],['来る','くる','来'],['見る','みる','看'],['聞く','きく','听；问'],['話す','はなす','说'],['大丈夫','だいじょうぶ','没关系；没问题'],['約束','やくそく','约定'],['家族','かぞく','家人'],['姉','あね','姐姐（自己的）'],['弟','おとうと','弟弟']
].map(([word,kana,meaning],i)=>({id:'v'+i,word,kana,meaning,mastery:0,wrong:0,created:todayKey()}));
let sync=null;

function blankData(){return{
  schemaVersion:3,updated_at:new Date().toISOString(),
  settings:{newWordsGoal:10,reviewWordsGoal:10,weekdayCap:70},
  lesson:{number:1,checks:Object.fromEntries(lessonParts.map(x=>[x,false]))},
  tasks:{},weekPlans:{},logs:{words:{},listening:{},tests:{}},vocab:defaultVocab,calendarMonth:null
}}
function normalizeData(raw={}){const base=blankData(), merged={...base,...raw};merged.settings={...base.settings,...(raw.settings||{})};merged.lesson={...base.lesson,...(raw.lesson||{})};merged.lesson.checks=normalizeLessonChecks((raw.lesson||{}).checks||{});merged.logs={words:{},listening:{},tests:{},...(raw.logs||{})};merged.logs.words=merged.logs.words||{};merged.logs.listening=merged.logs.listening||{};merged.logs.tests=merged.logs.tests||{};merged.tasks=merged.tasks||{};merged.weekPlans=merged.weekPlans||{};merged.vocab=Array.isArray(merged.vocab)?merged.vocab:base.vocab;merged.schemaVersion=3;merged.updated_at=raw.updated_at||raw.updatedAt||base.updated_at;return merged}
let data=load();
function load(){try{return normalizeData(JSON.parse(localStorage.getItem(KEY)||'{}'))}catch{return blankData()}}
function save(options={}){data.updated_at=new Date().toISOString();localStorage.setItem(KEY,JSON.stringify(data));if(sync&&!options.skipSync)sync.queuePush()}
function replaceData(next,options={}){data=normalizeData(next);localStorage.setItem(KEY,JSON.stringify(data));if(!options.skipRender)render()}
function todayKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function parseKey(k){const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)}
function isWeekend(d=new Date()){return d.getDay()===0||d.getDay()===6}
function weekdayCN(d=new Date()){return '日一二三四五六'[d.getDay()]}
function minutesForType(type){return ({教材:20,语法:20,教材听力:15,课外听力:15,跟读:10,复习:10,口语:25,测试:20,单词:10,教科書:20,文法:20,リスニング:15,シャドーイング:10,復習:10,会話:25,テスト:20,単語:10})[type]||10}
function task(id,title,type,meta='',scheduledDay=null){return{id,title,type,meta,done:false,created:todayKey(),carried:false,scheduledDay}}
function normalizeLessonChecks(checks={}){const aliases={'单词':'単語','语法①':'文法①','语法②':'文法②','课文':'本文','课文听力':'本文リスニング','跟读':'音読'};const next=Object.fromEntries(lessonParts.map(x=>[x,false]));Object.entries(checks).forEach(([k,v])=>{const key=aliases[k]||k;if(key in next)next[key]=Boolean(v)});return next}
function weekStart(d=new Date()){const x=new Date(d);const shift=(x.getDay()+6)%7;x.setHours(0,0,0,0);x.setDate(x.getDate()-shift);return x}
function weekId(d=new Date()){return todayKey(weekStart(d))}
function dayIndex(d=new Date()){return (d.getDay()+6)%7}

function loadSyncMeta(){try{return JSON.parse(localStorage.getItem(SYNC_META_KEY)||'{}')}catch{return {}}}
function saveSyncMeta(meta){localStorage.setItem(SYNC_META_KEY,JSON.stringify(meta))}
function dataScore(value=data){const x=normalizeData(value);return Object.keys(x.tasks||{}).length*4+Object.keys(x.weekPlans||{}).length*4+Object.keys(x.logs.words||{}).length*3+Object.keys(x.logs.listening||{}).length*3+Object.keys(x.logs.tests||{}).length*3+Math.max(0,(x.vocab||[]).length-defaultVocab.length)*2+(x.lesson?.number&&x.lesson.number!==1?3:0)+Object.values(x.lesson?.checks||{}).filter(Boolean).length}
function hasMeaningfulLocalData(value=data){return dataScore(value)>0}
function makeLocalBackup(reason='sync'){const snapshot=normalizeData(data);if(!hasMeaningfulLocalData(snapshot))return null;const key=`${PRE_SYNC_BACKUP_PREFIX}${Date.now()}-${reason}`;localStorage.setItem(key,JSON.stringify({...snapshot,backup_reason:reason,backup_created_at:new Date().toISOString()}));return key}
function listLocalBackups(){const rows=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key||!key.startsWith(PRE_SYNC_BACKUP_PREFIX))continue;try{const value=normalizeData(JSON.parse(localStorage.getItem(key)||'{}'));rows.push({key,value,score:dataScore(value),time:value.backup_created_at||value.updated_at||''})}catch{}}return rows.sort((a,b)=>String(b.time).localeCompare(String(a.time)))}
function compareUpdated(a,b){return new Date(a||0).getTime()-new Date(b||0).getTime()}
function createSync(){
 const cfg=window.JP_STUDY_SUPABASE||{};
 const available=Boolean(cfg.url&&cfg.anonKey&&window.supabase);
 const state={available,client:null,user:null,status:available?'未登录':'本地',message:available?'登录后自动同步':'未配置 Supabase',timer:null,busy:false,lastSync:null,error:null};
 if(available)state.client=window.supabase.createClient(cfg.url,cfg.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 function setStatus(status,message,error=null){state.status=status;state.message=message;state.error=error;renderSyncStatus()}
 async function init(){renderSyncStatus();window.addEventListener('online',()=>{if(state.user){setStatus('同步中','网络恢复，正在同步');pullThenPush()}});window.addEventListener('offline',()=>setStatus('离线','离线可用，联网后同步'));
  if(!state.available)return;
  try{const {data:sessionData}=await state.client.auth.getSession();state.user=sessionData.session?.user||null;if(state.user)await firstSync();else setStatus('未登录','登录后自动同步')}catch(err){setStatus('异常','同步初始化失败',err)}
  state.client.auth.onAuthStateChange((_event,session)=>{state.user=session?.user||null;if(state.user)firstSync();else setStatus('未登录','已退出，仅保留本地数据')});
 }
 async function signIn(email){if(!state.available)throw new Error('请先填写 Supabase 配置。');const redirectTo=location.href.split('#')[0];const {error}=await state.client.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo}});if(error)throw error;setStatus('查收邮件','点击邮件链接完成登录')}
 async function signOut(){if(!state.available)return;await state.client.auth.signOut();state.user=null;setStatus('未登录','已退出，仅保留本地数据')}
 async function fetchRemote(){const {data:row,error}=await state.client.from('study_states').select('data,updated_at').eq('user_id',state.user.id).maybeSingle();if(error)throw error;return row}
 async function upsertRemote(payload=data){const stamped=normalizeData(payload);const {error}=await state.client.from('study_states').upsert({user_id:state.user.id,data:stamped,updated_at:stamped.updated_at},{onConflict:'user_id'});if(error)throw error;state.lastSync=new Date().toISOString();const meta=loadSyncMeta();meta.pending=false;meta.lastSync=state.lastSync;saveSyncMeta(meta);setStatus('已同步','云端与本机一致')}
 async function firstSync(){if(state.busy)return;state.busy=true;try{if(!navigator.onLine){setStatus('离线','离线可用，联网后同步');return}setStatus('同步中','正在检查云端数据');const remote=await fetchRemote();const meta=loadSyncMeta();const migrated=meta.migratedUsers?.[state.user.id];
   if(!remote){makeLocalBackup('before-first-cloud-upload');await upsertRemote(data);meta.migratedUsers={...(meta.migratedUsers||{}),[state.user.id]:true};saveSyncMeta(meta);return}
   const remoteData=normalizeData(remote.data), localScore=dataScore(data), remoteScore=dataScore(remoteData), localIsNewer=compareUpdated(data.updated_at,remote.updated_at)>0;
   if(!migrated&&hasMeaningfulLocalData())makeLocalBackup('before-first-sync');
   if(!migrated&&hasMeaningfulLocalData()&&(localIsNewer||localScore>remoteScore)){await upsertRemote(data);meta.migratedUsers={...(meta.migratedUsers||{}),[state.user.id]:true};saveSyncMeta(meta);return}
   replaceData(remoteData,{skipRender:true});state.lastSync=new Date().toISOString();meta.pending=false;meta.lastSync=state.lastSync;meta.migratedUsers={...(meta.migratedUsers||{}),[state.user.id]:true};saveSyncMeta(meta);setStatus('已同步','已载入云端数据');render()
  }catch(err){const meta=loadSyncMeta();meta.pending=true;saveSyncMeta(meta);setStatus('待同步','云端暂不可用，稍后自动重试',err)}finally{state.busy=false}}
 async function pullThenPush(){if(!state.available||!state.user||state.busy)return;state.busy=true;try{if(!navigator.onLine){setStatus('离线','离线可用，联网后同步');return}const remote=await fetchRemote();if(remote&&compareUpdated(remote.updated_at,data.updated_at)>0){const remoteData=normalizeData(remote.data);if(hasMeaningfulLocalData()&&dataScore(data)>dataScore(remoteData)+2){makeLocalBackup('protected-from-smaller-cloud-state');await upsertRemote(data);return}makeLocalBackup('before-cloud-replace');replaceData(remoteData,{skipRender:true});const meta=loadSyncMeta();meta.pending=false;saveSyncMeta(meta);setStatus('已同步','已载入另一台设备的新数据');render()}else await upsertRemote(data)}catch(err){const meta=loadSyncMeta();meta.pending=true;saveSyncMeta(meta);setStatus('待同步','本机已保存，稍后自动同步',err)}finally{state.busy=false}}
 function queuePush(){const meta=loadSyncMeta();meta.pending=true;saveSyncMeta(meta);if(!state.available||!state.user){renderSyncStatus();return}if(!navigator.onLine){setStatus('离线','离线可用，联网后同步');return}setStatus('待同步','本机已保存，准备上传');clearTimeout(state.timer);state.timer=setTimeout(()=>pullThenPush(),700)}
 return {state,init,signIn,signOut,queuePush,pullThenPush};
}

function weeklyTemplate(startKey){
 const days=['月','火','水','木','金','土','日'];
 const rows=[
  ['mon','月曜：新しい単語と本文','単語','新出語10個、本文を15分、通勤で本文を聞く',0],
  ['tue','火曜：復習と文法','文法','昨日の単語復習、文法1〜2項目、例文を5つ作る',1],
  ['wed','水曜：精聴と音読','リスニング','本文を精聴し、聞き取れない所を確認、音読5回',2],
  ['thu','木曜：次の小節へ','教科書','新出語10個、総合日本語の次の小節、短い泛聴',3],
  ['fri','金曜：一週間の整理','復習','単語・文法・本文リスニングを軽く総復習',4],
  ['sat','土曜：週末テスト','テスト','単語テスト、会話練習、短い動画の精聴',5],
  ['sun','日曜：弱点補強','復習','未消化の弱点だけ補強。終わらなくても翌週へ進む',6]
 ];
 return {id:startKey,created:todayKey(),tasks:rows.map(([id,title,type,meta,scheduledDay])=>({id:`${startKey}-${id}`,title,type,meta,scheduledDay,dayName:days[scheduledDay],done:false,created:startKey}))};
}
function ensureToday(){ensureWeek()}
function ensureWeek(d=new Date()){
 const id=weekId(d);
 data.weekPlans=data.weekPlans||{};
 if(data.weekPlans[id])return data.weekPlans[id];
 data.weekPlans[id]=weeklyTemplate(id);
 save();
 return data.weekPlans[id];
}
function currentWeekTasks(){return ensureWeek().tasks||[]}
function recommendedTasks(){const idx=dayIndex();return currentWeekTasks().filter(t=>t.scheduledDay<=idx&&!t.done)}
function tasksForDateKey(k){const d=parseKey(k), plan=data.weekPlans?.[weekId(d)];if(plan)return (plan.tasks||[]).filter(t=>t.scheduledDay===dayIndex(d));return data.tasks[k]||[]}

function render(){ensureToday();renderHeader();renderTasks();renderLesson();renderWords();renderListening();renderWeekend();renderCalendar();renderSummary();renderSyncStatus()}
function renderHeader(){const d=new Date();document.querySelector('#todayLabel').textContent=`${d.getMonth()+1}月${d.getDate()}日 · ${['日','月','火','水','木','金','土'][d.getDay()]}曜日`}
function renderSyncStatus(){const btn=document.querySelector('#syncBtn');if(!btn||!sync)return;const s=sync.state;const meta=loadSyncMeta();const labels={'本地':'ローカル','未登录':'未ログイン','待同步':'同期待ち','已同步':'同期済み','离线':'オフライン','异常':'エラー','同步中':'同期中','查收邮件':'メール確認'};const text=s.user?(meta.pending&&s.status!=='已同步'?'待同步':s.status):s.status;btn.textContent=labels[text]||text;btn.className='sync-pill '+(s.user?'online':'')+(s.status==='离线'||meta.pending?' pending':'')+(s.error?' error':'')}
function renderTaskList(box,arr,emptyText,showDay=false){box.innerHTML='';if(!arr.length)box.innerHTML=`<div class="task-item empty">${emptyText}</div>`;arr.forEach(t=>{const el=document.createElement('label');el.className='task-item'+(t.done?' done':'')+(showDay?' weekly':'');el.innerHTML=`<input class="task-check" type="checkbox" ${t.done?'checked':''}><div class="task-body">${showDay?`<div class="task-day">${t.dayName||''}</div>`:''}<div class="task-title">${esc(t.title)}</div><div class="task-meta">${esc(t.type)}${t.meta?' · '+esc(t.meta):''}</div></div>`;el.querySelector('input').onchange=e=>{t.done=e.target.checked;save();render()};box.appendChild(el)})}
function renderTasks(){const recBox=document.querySelector('#recommendedTaskList'),weekBox=document.querySelector('#weekTaskList');const rec=recommendedTasks(),all=currentWeekTasks();renderTaskList(recBox,rec,'今日のおすすめは完了です。',false);renderTaskList(weekBox,all,'今週のタスクはありません。',true);const note=document.querySelector('#weekTaskNote');if(note){const done=all.filter(t=>t.done).length;note.textContent=`${done}/${all.length}`}}
function renderLesson(){document.querySelector('#lessonNumber').textContent=data.lesson.number;const box=document.querySelector('#lessonChecks');box.innerHTML='';lessonParts.forEach(p=>{const l=document.createElement('label');l.className='mini-check';l.innerHTML=`<input type="checkbox" ${data.lesson.checks[p]?'checked':''}> ${p}`;l.querySelector('input').onchange=e=>{data.lesson.checks[p]=e.target.checked;save();renderLesson();renderSyncStatus()};box.appendChild(l)});const n=Object.values(data.lesson.checks).filter(Boolean).length;document.querySelector('#lessonProgressBar').style.width=(n/lessonParts.length*100)+'%'}
function renderWords(){const k=todayKey(),w=data.logs.words[k]||{new:0,review:0};document.querySelector('#newWordsDone').textContent=w.new;document.querySelector('#reviewWordsDone').textContent=w.review;document.querySelector('#newWordsGoal').textContent=data.settings.newWordsGoal;document.querySelector('#reviewWordsGoal').textContent=data.settings.reviewWordsGoal}
function weekKeys(){const d=new Date();const mon=new Date(d);const shift=(d.getDay()+6)%7;mon.setDate(d.getDate()-shift);return Array.from({length:7},(_,i)=>{const x=new Date(mon);x.setDate(mon.getDate()+i);return todayKey(x)})}
function renderListening(){const cats=[['本文リスニング',['本文リスニング','教材听力']],['泛聴',['泛聴','课外听力']],['精聴',['精聴','精听']],['シャドーイング',['シャドーイング','跟读']]];const totals=Object.fromEntries(cats.map(([c])=>[c,0]));weekKeys().forEach(k=>{const x=data.logs.listening[k]||{};cats.forEach(([label,keys])=>keys.forEach(key=>totals[label]+=Number(x[key]||0)))});document.querySelector('#listeningStats').innerHTML=cats.map(([c])=>`<div class="listen-stat"><span>${c}</span><strong>${totals[c]}</strong> min</div>`).join('')}
function renderWeekend(){const card=document.querySelector('#weekendTestCard');card.style.display=isWeekend()?'flex':'none'}

let calDate=new Date(new Date().getFullYear(),new Date().getMonth(),1);
function renderCalendar(){const title=document.querySelector('#calendarTitle'),box=document.querySelector('#calendar');title.textContent=`${calDate.getFullYear()}年 ${calDate.getMonth()+1}月`;box.innerHTML='';const first=new Date(calDate.getFullYear(),calDate.getMonth(),1);const start=new Date(first);start.setDate(first.getDate()-((first.getDay()+6)%7));for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const k=todayKey(d),ts=tasksForDateKey(k);const el=document.createElement('div');el.className='day';if(d.getMonth()!=calDate.getMonth())el.classList.add('other');if(k===todayKey())el.classList.add('today');if(ts.length&&ts.every(t=>t.done))el.classList.add('complete');else if(ts.some(t=>t.done))el.classList.add('partial');el.textContent=d.getDate();box.appendChild(el)}}
function renderSummary(){const ts=currentWeekTasks();const done=ts.filter(t=>t.done).length;document.querySelector('#weekRate').textContent=(ts.length?Math.round(done/ts.length*100):0)+'%';document.querySelector('#masteredWords').textContent=data.vocab.filter(v=>v.mastery>=3).length}
function calcStreak(){let n=0,d=new Date();for(let i=0;i<365;i++){const k=todayKey(d),ts=tasksForDateKey(k);if(ts&&ts.some(t=>t.done)){n++;d.setDate(d.getDate()-1)}else if(i===0){d.setDate(d.getDate()-1)}else break}return n}
function openModal(html){const m=document.querySelector('#modal'),c=document.querySelector('#modalContent');c.innerHTML=html;if(!m.open)m.showModal();return c}
const modal=document.querySelector('#modal');modal.addEventListener('click',e=>{if(e.target===modal)modal.close()});
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

document.querySelector('#logWordsBtn').onclick=()=>{const k=todayKey(),cur=data.logs.words[k]||{new:0,review:0};const c=openModal(`<h3>今日の語彙を記録</h3><div class="field"><label>新出語</label><input id="nw" type="number" min="0" value="${cur.new}"></div><div class="field"><label>復習語</label><input id="rw" type="number" min="0" value="${cur.review}"></div><div class="modal-actions"><button value="cancel" class="small-btn ghost">キャンセル</button><button id="saveWords" value="default" class="small-btn">保存</button></div>`);c.querySelector('#saveWords').onclick=e=>{e.preventDefault();data.logs.words[k]={new:+c.querySelector('#nw').value||0,review:+c.querySelector('#rw').value||0};save();document.querySelector('#modal').close();renderWords();renderSyncStatus()}}
document.querySelector('#logListeningBtn').onclick=()=>{const c=openModal(`<h3>リスニングを記録</h3><div class="field"><label>種類</label><select id="lc"><option>本文リスニング</option><option>泛聴</option><option>精聴</option><option>シャドーイング</option></select></div><div class="field"><label>分</label><input id="lm" type="number" min="1" value="15"></div><div class="modal-actions"><button value="cancel" class="small-btn ghost">キャンセル</button><button id="saveL" class="small-btn">保存</button></div>`);c.querySelector('#saveL').onclick=e=>{e.preventDefault();const k=todayKey(),cat=c.querySelector('#lc').value,min=+c.querySelector('#lm').value||0;data.logs.listening[k]=data.logs.listening[k]||{};data.logs.listening[k][cat]=(data.logs.listening[k][cat]||0)+min;save();document.querySelector('#modal').close();renderListening();renderSyncStatus()}}
document.querySelector('#editLessonBtn').onclick=()=>{const c=openModal(`<h3>教科書の進捗</h3><div class="field"><label>現在の課</label><input id="ln" type="number" min="1" value="${data.lesson.number}"></div><div class="modal-actions"><button value="cancel" class="small-btn ghost">キャンセル</button><button id="saveLesson" class="small-btn">保存</button></div>`);c.querySelector('#saveLesson').onclick=e=>{e.preventDefault();data.lesson.number=+c.querySelector('#ln').value||1;data.lesson.checks=Object.fromEntries(lessonParts.map(x=>[x,false]));save();document.querySelector('#modal').close();renderLesson();renderSyncStatus()}}
document.querySelector('#addTaskBtn').onclick=()=>{const c=openModal(`<h3>タスクを追加</h3><div class="field"><label>タスク</label><input id="tt" placeholder="例：第3課を復習"></div><div class="field"><label>種類</label><select id="ty"><option>教科書</option><option>文法</option><option>リスニング</option><option>シャドーイング</option><option>復習</option><option>会話</option></select></div><div class="modal-actions"><button value="cancel" class="small-btn ghost">キャンセル</button><button id="saveT" class="small-btn">追加</button></div>`);c.querySelector('#saveT').onclick=e=>{e.preventDefault();const title=c.querySelector('#tt').value.trim();if(!title)return;currentWeekTasks().push(task('custom-'+Date.now(),title,c.querySelector('#ty').value,'追加タスク',dayIndex()));save();document.querySelector('#modal').close();render();renderSyncStatus()}}

document.querySelector('#vocabBtn').onclick=()=>showVocab();
function showVocab(){
 const rows=data.vocab.slice().sort((a,b)=>b.wrong-a.wrong).map(v=>`<div class="task-item"><div class="task-body"><div class="task-title">${esc(v.word)} <span class="muted">${esc(v.kana)}</span></div><div class="task-meta">${esc(v.meaning)} · 定着 ${v.mastery}/3 · ミス ${v.wrong}</div>${v.collocations?`<div class="task-meta">コロケーション：${esc(v.collocations)}</div>`:''}</div><div class="vocab-actions"><button type="button" class="small-btn ghost" data-edit="${esc(v.id)}">編集</button><button type="button" class="small-btn ghost vocab-delete" data-delete="${esc(v.id)}">削除</button></div></div>`).join('');
 const empty='<p class="muted">語彙はまだ空です。「単語を追加」から始めましょう。</p>';
 const c=openModal(`<h3>語彙リスト <span class="muted">${data.vocab.length} 語</span></h3><button type="button" id="addV" class="small-btn">+ 単語を追加</button><div class="vocab-list">${rows||empty}</div><div class="modal-actions"><button class="small-btn ghost">閉じる</button></div>`);
 c.querySelector('#addV').onclick=()=>editVocab();
 c.querySelectorAll('[data-edit]').forEach(btn=>btn.onclick=()=>editVocab(btn.dataset.edit));
 c.querySelectorAll('[data-delete]').forEach(btn=>btn.onclick=()=>deleteVocab(btn.dataset.delete));
}
function editVocab(id){
 const existing=id?data.vocab.find(v=>v.id===id):null;
 const c=openModal(`<h3>${existing?'単語を編集':'単語を追加'}</h3><div class="field"><label>日本語</label><input id="vw" value="${esc(existing?.word||'')}"></div><div class="field"><label>かな</label><input id="vk" value="${esc(existing?.kana||'')}"></div><div class="field"><label>中国語の意味</label><input id="vm" value="${esc(existing?.meaning||'')}"></div><div class="field"><label>コロケーション</label><input id="vc" value="${esc(existing?.collocations||'')}" placeholder="例：約束を守る"></div><p class="muted">意味やコロケーションは手動で入力・編集できます。</p><div class="modal-actions"><button type="button" id="backV" class="small-btn ghost">戻る</button><button id="saveV" class="small-btn">保存</button></div>`);
 c.querySelector('#backV').onclick=showVocab;
 c.querySelector('#saveV').onclick=e=>{e.preventDefault();const word=c.querySelector('#vw').value.trim(),kana=c.querySelector('#vk').value.trim(),meaning=c.querySelector('#vm').value.trim(),collocations=c.querySelector('#vc').value.trim();if(!word||!meaning){alert('日本語と中国語の意味を入力してください。');return}if(existing){Object.assign(existing,{word,kana,meaning,collocations})}else{data.vocab.push({id:'v'+Date.now(),word,kana,meaning,collocations,mastery:0,wrong:0,created:todayKey()})}save();showVocab();renderSyncStatus()};
}
function deleteVocab(id){const v=data.vocab.find(x=>x.id===id);if(!v||!confirm(`「${v.word}」を削除しますか？`))return;data.vocab=data.vocab.filter(x=>x.id!==id);save();showVocab();renderSyncStatus()}

const testBtns=['#startTestBtn','#quickTestBtn'];testBtns.forEach(s=>document.querySelector(s).onclick=()=>startTest());
function startTest(){
 if(data.vocab.length<4){alert('語彙は最低4語必要です。');return}
 const pool=[...data.vocab].sort((a,b)=>(b.wrong-a.wrong)||Math.random()-.5).slice(0,Math.min(20,data.vocab.length));
 let idx=0,score=0,wrong=[];const modes=['日→中','中→日','听音辨词','语境'];
 function next(){if(idx>=pool.length)return finish();const v=pool[idx],mode=modes[idx%4];let html=`<h3>今週の単語テスト <span class="muted">${idx+1}/${pool.length}</span></h3>`;
   if(mode==='日→中') html+=`<div class="test-q">${esc(v.word)} <span class="muted">${esc(v.kana)}</span></div><div class="field"><label>中国語の意味</label><input id="ans" autocomplete="off"></div>`;
   if(mode==='中→日') html+=`<div class="test-q">${esc(v.meaning)}</div><div class="field"><label>日本語で入力</label><input id="ans" autocomplete="off"></div>`;
   if(mode==='听音辨词') html+=`<div class="test-q">聞き取り</div><button type="button" id="speak" class="small-btn ghost">再生</button><div class="field"><label>聞こえた語</label><input id="ans" autocomplete="off"></div>`;
   if(mode==='语境') html+=`<div class="test-q">「${esc(v.meaning)}」に合う語を入れてください：<br><br>今日は ______ を勉強します。</div><div class="field"><label>答え</label><input id="ans" autocomplete="off"></div>`;
   html+=`<div class="modal-actions"><button type="button" id="submitA" class="small-btn">提出</button></div>`;
   const c=openModal(html);if(mode==='听音辨词'){c.querySelector('#speak').onclick=()=>speakJP(v.word);setTimeout(()=>speakJP(v.word),250)}
   c.querySelector('#submitA').onclick=()=>{const a=c.querySelector('#ans').value.trim().toLowerCase();let ok=false;if(mode==='日→中')ok=v.meaning.split(/[；;,，]/).some(x=>a.includes(x.trim().toLowerCase())||x.trim().toLowerCase().includes(a));else ok=[v.word,v.kana].map(x=>x.toLowerCase()).includes(a);if(ok){score++;v.mastery=Math.min(3,v.mastery+1)}else{v.wrong++;v.mastery=Math.max(0,v.mastery-1);wrong.push(v)}idx++;save();next()}
 }
 function finish(){const pct=Math.round(score/pool.length*100);data.logs.tests[todayKey()]={score,total:pool.length,pct,wrong:wrong.map(v=>v.id)};save();const c=openModal(`<h3>テスト完了</h3><p class="${pct>=80?'result-good':'result-bad'}" style="font-size:34px;margin:10px 0">${score}/${pool.length} · ${pct}%</p><p>間違えた語 ${wrong.length} 個。次回の復習で優先されます。</p>${wrong.length?'<p class="muted">'+wrong.map(v=>esc(v.word)).join('、')+'</p>':''}<div class="modal-actions"><button class="small-btn">完了</button></div>`);const t=currentWeekTasks().find(x=>x.type==='テスト'&&!x.done);if(t)t.done=true;save();render()}
 next();
}
function speakJP(text){if(!('speechSynthesis'in window))return alert('当前浏览器不支持语音朗读。');speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='ja-JP';u.rate=.85;speechSynthesis.speak(u)}

document.querySelector('#prevMonthBtn').onclick=()=>{calDate.setMonth(calDate.getMonth()-1);renderCalendar()};document.querySelector('#nextMonthBtn').onclick=()=>{calDate.setMonth(calDate.getMonth()+1);renderCalendar()};
document.querySelector('[data-scroll="calendar"]').onclick=()=>document.querySelector('#calendar').scrollIntoView({behavior:'smooth',block:'center'});document.querySelector('[data-scroll="top"]').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});

document.querySelector('#settingsBtn').onclick=()=>{const c=openModal(`<h3>設定</h3><div class="field"><label>毎日の新出語目標</label><input id="sg1" type="number" min="1" value="${data.settings.newWordsGoal}"></div><div class="field"><label>毎日の復習語目標</label><input id="sg2" type="number" min="1" value="${data.settings.reviewWordsGoal}"></div><div class="field"><label>平日の目安時間（分）</label><input id="cap" type="number" min="30" value="${data.settings.weekdayCap}"></div><div class="modal-actions"><button value="cancel" class="small-btn ghost">キャンセル</button><button id="saveS" class="small-btn">保存</button></div>`);c.querySelector('#saveS').onclick=e=>{e.preventDefault();data.settings.newWordsGoal=+c.querySelector('#sg1').value||10;data.settings.reviewWordsGoal=+c.querySelector('#sg2').value||10;data.settings.weekdayCap=+c.querySelector('#cap').value||70;save();document.querySelector('#modal').close();render()}}

document.querySelector('#syncBtn').onclick=()=>{const s=sync.state;const configured=s.available;const user=s.user;const err=s.error?`<p class="sync-error">${esc(s.error.message||s.error)}</p>`:'';const html=user?`<h3>ログインと同期</h3><p class="muted">${esc(user.email||'ログイン済み')}</p><p>${esc(s.message)}</p>${err}<div class="button-row"><button type="button" id="syncNow" class="small-btn">今すぐ同期</button><button type="button" id="logout" class="small-btn ghost">ログアウト</button></div><div class="modal-actions"><button class="small-btn ghost">閉じる</button></div>`:`<h3>ログインと同期</h3><p>${configured?'メールアドレスを入力し、届いたリンクからログインします。初回はこの端末のデータを同期します。':'Supabase が未設定です。データはこの端末に保存されます。'}</p>${err}${configured?'<div class="field"><label>メール</label><input id="email" type="email" autocomplete="email" placeholder="you@example.com"></div><div class="modal-actions"><button value="cancel" class="small-btn ghost">閉じる</button><button type="button" id="sendLogin" class="small-btn">ログインメール</button></div>':'<div class="modal-actions"><button class="small-btn ghost">閉じる</button></div>'}`;const c=openModal(html);const send=c.querySelector('#sendLogin');if(send)send.onclick=async()=>{const email=c.querySelector('#email').value.trim();if(!email)return alert('メールを入力してください。');try{await sync.signIn(email);alert('ログインメールを送信しました。メール内のリンクを開いてください。')}catch(err){alert(err.message||'送信に失敗しました')}};const syncNow=c.querySelector('#syncNow');if(syncNow)syncNow.onclick=()=>sync.pullThenPush();const logout=c.querySelector('#logout');if(logout)logout.onclick=()=>sync.signOut()};

document.querySelector('#backupBtn').onclick=()=>showBackup()
function showBackup(){const backups=listLocalBackups();const backupHtml=backups.length?`<div class="restore-list"><p class="muted">${backups.length} 件の端末バックアップがあります。</p>${backups.map((b,i)=>`<div class="restore-item"><div><strong>端末バックアップ ${i+1}</strong><div class="task-meta">${esc(b.time||'時刻不明')} · データ量 ${b.score}</div></div><div class="restore-actions"><button type="button" class="small-btn ghost" data-preview-backup="${esc(b.key)}">確認</button><button type="button" class="small-btn" data-restore-backup="${esc(b.key)}">復元</button></div></div>`).join('')}</div>`:'';const c=openModal(`<h3>バックアップ</h3><p>データは端末に保存され、ログイン後にクラウドへ同期されます。</p><div class="button-row"><button type="button" id="export" class="small-btn">エクスポート</button><button type="button" id="import" class="small-btn ghost">インポート</button></div>${backupHtml}<div class="modal-actions"><button class="small-btn ghost">閉じる</button></div>`);c.querySelector('#export').onclick=exportData;c.querySelector('#import').onclick=()=>document.querySelector('#importInput').click();c.querySelectorAll('[data-preview-backup]').forEach(btn=>btn.onclick=()=>previewLocalBackup(btn.dataset.previewBackup));c.querySelectorAll('[data-restore-backup]').forEach(btn=>btn.onclick=()=>restoreLocalBackup(btn.dataset.restoreBackup))}
function previewLocalBackup(key){try{const value=normalizeData(JSON.parse(localStorage.getItem(key)||'{}'));alert(`バックアップ確認\n教科書：第 ${value.lesson.number||1} 課\n語彙：${(value.vocab||[]).length} 語\n週プラン：${Object.keys(value.weekPlans||{}).length} 週\nリスニング：${Object.keys(value.logs?.listening||{}).length} 日\nテスト：${Object.keys(value.logs?.tests||{}).length} 回`)}catch{alert('このバックアップは読み取れません。')}}
function restoreLocalBackup(key){try{const value=normalizeData(JSON.parse(localStorage.getItem(key)||'{}'));if(!confirm('この端末バックアップを復元しますか？現在のデータは先に自動バックアップされます。'))return;makeLocalBackup('before-manual-restore');replaceData(value,{skipRender:true});save();document.querySelector('#modal').close();render();alert('バックアップを復元しました。ログイン中ならクラウドにも同期されます。')}catch{alert('このバックアップは復元できません。')}}
function exportData(){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`日本語ノート-backup-${todayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
document.querySelector('#importInput').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{replaceData(JSON.parse(r.result),{skipRender:true});save();render();alert('导入完成')}catch{alert('备份文件格式不正确')}};r.readAsText(f)}

if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
sync=createSync();
sync.init();
render();
