const KEY='jpStudyDataV1';
const lessonParts=['单词','语法①','语法②','课文','课文听力','跟读'];
const defaultVocab=[
  ['学生','がくせい','学生'],['先生','せんせい','老师'],['友達','ともだち','朋友'],['学校','がっこう','学校'],['日本語','にほんご','日语'],['今日','きょう','今天'],['昨日','きのう','昨天'],['明日','あした','明天'],['食べる','たべる','吃'],['飲む','のむ','喝'],['行く','いく','去'],['来る','くる','来'],['見る','みる','看'],['聞く','きく','听；问'],['話す','はなす','说'],['大丈夫','だいじょうぶ','没关系；没问题'],['約束','やくそく','约定'],['家族','かぞく','家人'],['姉','あね','姐姐（自己的）'],['弟','おとうと','弟弟']
].map(([word,kana,meaning],i)=>({id:'v'+i,word,kana,meaning,mastery:0,wrong:0,created:todayKey()}));

function blankData(){return{
  settings:{newWordsGoal:10,reviewWordsGoal:10,weekdayCap:70},
  lesson:{number:1,checks:Object.fromEntries(lessonParts.map(x=>[x,false]))},
  tasks:{},logs:{words:{},listening:{},tests:{}},vocab:defaultVocab,calendarMonth:null
}}
let data=load();
function load(){try{return {...blankData(),...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return blankData()}}
function save(){localStorage.setItem(KEY,JSON.stringify(data))}
function todayKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function parseKey(k){const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)}
function isWeekend(d=new Date()){return d.getDay()===0||d.getDay()===6}
function weekdayCN(d=new Date()){return '日一二三四五六'[d.getDay()]}
function minutesForType(type){return ({教材:20,语法:20,教材听力:15,课外听力:15,跟读:10,复习:10,口语:25,测试:20,单词:10})[type]||10}
function task(id,title,type,meta=''){return{id,title,type,meta,done:false,created:todayKey(),carried:false}}

function templateForDate(d){
 const day=d.getDay();
 const m={
  1:[task('newWords','新单词 10 个','单词','建议 10 个'),task('lesson','《综合日语》新课/新小节','教材','15–20 分钟'),task('textListen','本课课文盲听','教材听力','通勤 10–15 分钟'),task('extraListen','课外日语泛听','课外听力','通勤 10–15 分钟')],
  2:[task('reviewWords','复习昨日单词','复习','10 个'),task('newWords','新单词 10 个','单词','建议 10 个'),task('grammar','本课语法 1–2 项','语法','理解＋变形'),task('sentences','用新语法造句 5 句','语法','口头或书面'),task('textListen','重复听本课课文','教材听力','通勤约 15 分钟')],
  3:[task('reviewWords','单词复习','复习','10–15 个'),task('intensive','本课课文精听','教材听力','10–15 分钟'),task('transcript','对照原文找没听懂的位置','复习','精听复盘'),task('shadow','课文跟读 5 遍','跟读','开口完成'),task('blind','脱离文本重新听','教材听力','通勤完成')],
  4:[task('newWords','新单词 10 个','单词','建议 10 个'),task('lesson','《综合日语》继续下一小节','教材','15–20 分钟'),task('grammar','新语法 1–2 项','语法','掌握核心用法'),task('textListen','新课文反复听','教材听力','通勤'),task('extraListen','课外日语泛听','课外听力','通勤')],
  5:[task('weekWords','本周单词复习','复习','快速回顾'),task('weekGrammar','本周语法快速复习','复习','整理薄弱点'),task('checkListen','本周课文裸听验收','教材听力','不看文本'),task('drama','动画/日剧 1–3 分钟精听','课外听力','真实日语'),task('shadow','选 3–5 句跟读','跟读','模仿语音语调')],
  6:[task('weekWords','本周词汇总复习','复习','含错词'),task('lessonReview','《综合日语》本周内容整理','教材','系统复习'),task('test','周末单词测试','测试','20–30 题'),task('speaking','口语练习','口语','20–30 分钟'),task('drama','动画/日剧精听','课外听力','3–5 分钟'),task('shadow','Shadowing','跟读','15 分钟')],
  0:[task('test','周末单词测试','测试','若周六已完成则可略过'),task('free','自由日语输入','课外听力','动画/日剧/YouTube，不暂停查词'),task('review','本周薄弱项补强','复习','按需完成')]
 };
 return (m[day]||[]).map(x=>({...x,created:todayKey(d)}));
}

function ensureToday(){
 const k=todayKey(); if(data.tasks[k])return;
 const d=parseKey(k); const y=new Date(d); y.setDate(y.getDate()-1); const yk=todayKey(y);
 let carry=[];
 if(data.tasks[yk]) carry=data.tasks[yk].filter(t=>!t.done).map(t=>({...t,id:`carry-${yk}-${t.id}-${Math.random().toString(36).slice(2,6)}`,carried:true,origin:yk,created:k}));
 let fresh=templateForDate(d);
 if(!isWeekend(d)){
   let used=0, kept=[]; for(const t of carry){const m=minutesForType(t.type); if(used+m<=data.settings.weekdayCap){kept.push(t);used+=m}else{t.defer=true;}}
   carry=kept;
 }
 // Avoid duplicate weekend test if previous weekend test already carried.
 if(carry.some(t=>t.type==='测试')) fresh=fresh.filter(t=>t.type!=='测试');
 data.tasks[k]=[...carry,...fresh]; save();
}

function render(){ensureToday();renderHeader();renderTasks();renderLesson();renderWords();renderListening();renderWeekend();renderCalendar();renderSummary()}
function renderHeader(){const d=new Date();document.querySelector('#todayLabel').textContent=`${d.getMonth()+1}月${d.getDate()}日 · 星期${weekdayCN(d)}`;document.querySelector('#streakCount').textContent=calcStreak()}
function renderTasks(){const box=document.querySelector('#taskList'), arr=data.tasks[todayKey()]||[];box.innerHTML=''; if(!arr.length)box.innerHTML='<div class="task-item">今天没有任务。</div>';
 arr.forEach((t,i)=>{const el=document.createElement('label');el.className='task-item'+(t.done?' done':'');el.innerHTML=`<input class="task-check" type="checkbox" ${t.done?'checked':''}><div class="task-body"><div class="task-title">${t.title}</div><div class="task-meta">${t.carried?'<span class="carry">↪ 顺延任务</span> · ':''}${t.type}${t.meta?' · '+t.meta:''}</div></div>`;el.querySelector('input').onchange=e=>{t.done=e.target.checked;save();render()};box.appendChild(el)})}
function renderLesson(){document.querySelector('#lessonNumber').textContent=data.lesson.number;const box=document.querySelector('#lessonChecks');box.innerHTML='';lessonParts.forEach(p=>{const l=document.createElement('label');l.className='mini-check';l.innerHTML=`<input type="checkbox" ${data.lesson.checks[p]?'checked':''}> ${p}`;l.querySelector('input').onchange=e=>{data.lesson.checks[p]=e.target.checked;save();renderLesson()};box.appendChild(l)});const n=Object.values(data.lesson.checks).filter(Boolean).length;document.querySelector('#lessonProgressBar').style.width=(n/lessonParts.length*100)+'%'}
function renderWords(){const k=todayKey(),w=data.logs.words[k]||{new:0,review:0};document.querySelector('#newWordsDone').textContent=w.new;document.querySelector('#reviewWordsDone').textContent=w.review;document.querySelector('#newWordsGoal').textContent=data.settings.newWordsGoal;document.querySelector('#reviewWordsGoal').textContent=data.settings.reviewWordsGoal}
function weekKeys(){const d=new Date();const mon=new Date(d);const shift=(d.getDay()+6)%7;mon.setDate(d.getDate()-shift);return Array.from({length:7},(_,i)=>{const x=new Date(mon);x.setDate(mon.getDate()+i);return todayKey(x)})}
function renderListening(){const cats=['教材听力','课外听力','精听','跟读'];const totals=Object.fromEntries(cats.map(c=>[c,0]));weekKeys().forEach(k=>{const x=data.logs.listening[k]||{};cats.forEach(c=>totals[c]+=Number(x[c]||0))});document.querySelector('#listeningStats').innerHTML=cats.map(c=>`<div class="listen-stat"><span>${c}</span><strong>${totals[c]}</strong> min</div>`).join('')}
function renderWeekend(){const card=document.querySelector('#weekendTestCard');card.style.display=isWeekend()?'flex':'none'}

let calDate=new Date(new Date().getFullYear(),new Date().getMonth(),1);
function renderCalendar(){const title=document.querySelector('#calendarTitle'),box=document.querySelector('#calendar');title.textContent=`${calDate.getFullYear()}年 ${calDate.getMonth()+1}月`;box.innerHTML='';const first=new Date(calDate.getFullYear(),calDate.getMonth(),1);const start=new Date(first);start.setDate(first.getDate()-((first.getDay()+6)%7));for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const k=todayKey(d),ts=data.tasks[k]||[];const el=document.createElement('div');el.className='day';if(d.getMonth()!=calDate.getMonth())el.classList.add('other');if(k===todayKey())el.classList.add('today');if(ts.length&&ts.every(t=>t.done))el.classList.add('complete');else if(ts.some(t=>t.done))el.classList.add('partial');el.textContent=d.getDate();box.appendChild(el)}}
function renderSummary(){let total=0,done=0;weekKeys().forEach(k=>(data.tasks[k]||[]).forEach(t=>{total++;if(t.done)done++}));document.querySelector('#weekRate').textContent=(total?Math.round(done/total*100):0)+'%';document.querySelector('#masteredWords').textContent=data.vocab.filter(v=>v.mastery>=3).length}
function calcStreak(){let n=0,d=new Date();for(let i=0;i<365;i++){const k=todayKey(d),ts=data.tasks[k];if(ts&&ts.some(t=>t.done)){n++;d.setDate(d.getDate()-1)}else if(i===0){d.setDate(d.getDate()-1)}else break}return n}
function openModal(html){const m=document.querySelector('#modal'),c=document.querySelector('#modalContent');c.innerHTML=html;m.showModal();return c}
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

document.querySelector('#logWordsBtn').onclick=()=>{const k=todayKey(),cur=data.logs.words[k]||{new:0,review:0};const c=openModal(`<h3>记录今日词汇</h3><div class="field"><label>新词数量</label><input id="nw" type="number" min="0" value="${cur.new}"></div><div class="field"><label>复习数量</label><input id="rw" type="number" min="0" value="${cur.review}"></div><div class="modal-actions"><button value="cancel" class="small-btn ghost">取消</button><button id="saveWords" value="default" class="small-btn">保存</button></div>`);c.querySelector('#saveWords').onclick=e=>{e.preventDefault();data.logs.words[k]={new:+c.querySelector('#nw').value||0,review:+c.querySelector('#rw').value||0};save();document.querySelector('#modal').close();renderWords()}}
document.querySelector('#logListeningBtn').onclick=()=>{const c=openModal(`<h3>记录听力</h3><div class="field"><label>类型</label><select id="lc"><option>教材听力</option><option>课外听力</option><option>精听</option><option>跟读</option></select></div><div class="field"><label>分钟</label><input id="lm" type="number" min="1" value="15"></div><div class="modal-actions"><button value="cancel" class="small-btn ghost">取消</button><button id="saveL" class="small-btn">保存</button></div>`);c.querySelector('#saveL').onclick=e=>{e.preventDefault();const k=todayKey(),cat=c.querySelector('#lc').value,min=+c.querySelector('#lm').value||0;data.logs.listening[k]=data.logs.listening[k]||{};data.logs.listening[k][cat]=(data.logs.listening[k][cat]||0)+min;save();document.querySelector('#modal').close();renderListening()}}
document.querySelector('#editLessonBtn').onclick=()=>{const c=openModal(`<h3>教材进度</h3><div class="field"><label>当前课次</label><input id="ln" type="number" min="1" value="${data.lesson.number}"></div><div class="modal-actions"><button value="cancel" class="small-btn ghost">取消</button><button id="saveLesson" class="small-btn">保存</button></div>`);c.querySelector('#saveLesson').onclick=e=>{e.preventDefault();data.lesson.number=+c.querySelector('#ln').value||1;data.lesson.checks=Object.fromEntries(lessonParts.map(x=>[x,false]));save();document.querySelector('#modal').close();renderLesson()}}
document.querySelector('#addTaskBtn').onclick=()=>{const c=openModal(`<h3>添加临时任务</h3><div class="field"><label>任务</label><input id="tt" placeholder="例如：复习第3课"></div><div class="field"><label>类型</label><select id="ty"><option>教材</option><option>语法</option><option>教材听力</option><option>课外听力</option><option>跟读</option><option>复习</option><option>口语</option></select></div><div class="modal-actions"><button value="cancel" class="small-btn ghost">取消</button><button id="saveT" class="small-btn">添加</button></div>`);c.querySelector('#saveT').onclick=e=>{e.preventDefault();const title=c.querySelector('#tt').value.trim();if(!title)return;data.tasks[todayKey()].push(task('custom-'+Date.now(),title,c.querySelector('#ty').value));save();document.querySelector('#modal').close();renderTasks()}}

document.querySelector('#vocabBtn').onclick=()=>showVocab();
function showVocab(){const rows=data.vocab.slice().sort((a,b)=>b.wrong-a.wrong).map(v=>`<div class="task-item"><div class="task-body"><div class="task-title">${esc(v.word)} <span class="muted">${esc(v.kana)}</span></div><div class="task-meta">${esc(v.meaning)} · 掌握 ${v.mastery}/3 · 错 ${v.wrong}</div></div></div>`).join('');const c=openModal(`<h3>词库 <span class="muted">${data.vocab.length} 词</span></h3><button type="button" id="addV" class="small-btn">+ 添加单词</button><div style="display:grid;gap:8px;margin-top:12px">${rows}</div><div class="modal-actions"><button class="small-btn ghost">关闭</button></div>`);c.querySelector('#addV').onclick=()=>addVocab()}
function addVocab(){const c=openModal(`<h3>添加单词</h3><div class="field"><label>日语</label><input id="vw"></div><div class="field"><label>假名</label><input id="vk"></div><div class="field"><label>中文意思</label><input id="vm"></div><div class="modal-actions"><button value="cancel" class="small-btn ghost">取消</button><button id="saveV" class="small-btn">保存</button></div>`);c.querySelector('#saveV').onclick=e=>{e.preventDefault();const word=c.querySelector('#vw').value.trim(),kana=c.querySelector('#vk').value.trim(),meaning=c.querySelector('#vm').value.trim();if(!word||!meaning)return;data.vocab.push({id:'v'+Date.now(),word,kana,meaning,mastery:0,wrong:0,created:todayKey()});save();document.querySelector('#modal').close();showVocab()}}

const testBtns=['#startTestBtn','#quickTestBtn'];testBtns.forEach(s=>document.querySelector(s).onclick=()=>startTest());
function startTest(){
 if(data.vocab.length<4){alert('词库至少需要 4 个单词。');return}
 const pool=[...data.vocab].sort((a,b)=>(b.wrong-a.wrong)||Math.random()-.5).slice(0,Math.min(20,data.vocab.length));
 let idx=0,score=0,wrong=[];const modes=['日→中','中→日','听音辨词','语境'];
 function next(){if(idx>=pool.length)return finish();const v=pool[idx],mode=modes[idx%4];let html=`<h3>周末单词测试 <span class="muted">${idx+1}/${pool.length}</span></h3>`;
   if(mode==='日→中') html+=`<div class="test-q">${esc(v.word)} <span class="muted">${esc(v.kana)}</span></div><div class="field"><label>中文意思</label><input id="ans" autocomplete="off"></div>`;
   if(mode==='中→日') html+=`<div class="test-q">${esc(v.meaning)}</div><div class="field"><label>输入日语（汉字或假名均可）</label><input id="ans" autocomplete="off"></div>`;
   if(mode==='听音辨词') html+=`<div class="test-q">🔊 听音辨词</div><button type="button" id="speak" class="small-btn ghost">播放</button><div class="field"><label>输入听到的词</label><input id="ans" autocomplete="off"></div>`;
   if(mode==='语境') html+=`<div class="test-q">把「${esc(v.meaning)}」对应的词填入：<br><br>今日は ______ を勉強します。</div><div class="field"><label>答案</label><input id="ans" autocomplete="off"></div>`;
   html+=`<div class="modal-actions"><button type="button" id="submitA" class="small-btn">提交</button></div>`;
   const c=openModal(html);if(mode==='听音辨词'){c.querySelector('#speak').onclick=()=>speakJP(v.word);setTimeout(()=>speakJP(v.word),250)}
   c.querySelector('#submitA').onclick=()=>{const a=c.querySelector('#ans').value.trim().toLowerCase();let ok=false;if(mode==='日→中')ok=v.meaning.split(/[；;,，]/).some(x=>a.includes(x.trim().toLowerCase())||x.trim().toLowerCase().includes(a));else ok=[v.word,v.kana].map(x=>x.toLowerCase()).includes(a);if(ok){score++;v.mastery=Math.min(3,v.mastery+1)}else{v.wrong++;v.mastery=Math.max(0,v.mastery-1);wrong.push(v)}idx++;save();next()}
 }
 function finish(){const pct=Math.round(score/pool.length*100);data.logs.tests[todayKey()]={score,total:pool.length,pct,wrong:wrong.map(v=>v.id)};save();const c=openModal(`<h3>测试完成</h3><p class="${pct>=80?'result-good':'result-bad'}" style="font-size:34px;margin:10px 0">${score}/${pool.length} · ${pct}%</p><p>错词 ${wrong.length} 个，已提高其后续复习优先级。</p>${wrong.length?'<p class="muted">'+wrong.map(v=>esc(v.word)).join('、')+'</p>':''}<div class="modal-actions"><button class="small-btn">完成</button></div>`);const today=data.tasks[todayKey()]||[];const t=today.find(x=>x.type==='测试'&&!x.done);if(t)t.done=true;save();render()}
 next();
}
function speakJP(text){if(!('speechSynthesis'in window))return alert('当前浏览器不支持语音朗读。');speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='ja-JP';u.rate=.85;speechSynthesis.speak(u)}

document.querySelector('#prevMonthBtn').onclick=()=>{calDate.setMonth(calDate.getMonth()-1);renderCalendar()};document.querySelector('#nextMonthBtn').onclick=()=>{calDate.setMonth(calDate.getMonth()+1);renderCalendar()};
document.querySelector('[data-scroll="calendar"]').onclick=()=>document.querySelector('#calendar').scrollIntoView({behavior:'smooth',block:'center'});document.querySelector('[data-scroll="top"]').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});

document.querySelector('#settingsBtn').onclick=()=>{const c=openModal(`<h3>设置</h3><div class="field"><label>每日新词目标</label><input id="sg1" type="number" min="1" value="${data.settings.newWordsGoal}"></div><div class="field"><label>每日复习词目标</label><input id="sg2" type="number" min="1" value="${data.settings.reviewWordsGoal}"></div><div class="field"><label>工作日顺延任务上限（估算分钟）</label><input id="cap" type="number" min="30" value="${data.settings.weekdayCap}"></div><div class="modal-actions"><button value="cancel" class="small-btn ghost">取消</button><button id="saveS" class="small-btn">保存</button></div>`);c.querySelector('#saveS').onclick=e=>{e.preventDefault();data.settings.newWordsGoal=+c.querySelector('#sg1').value||10;data.settings.reviewWordsGoal=+c.querySelector('#sg2').value||10;data.settings.weekdayCap=+c.querySelector('#cap').value||70;save();document.querySelector('#modal').close();render()}}

document.querySelector('#backupBtn').onclick=()=>{const c=openModal(`<h3>数据备份</h3><p>本版本数据保存在手机本地。建议定期导出备份。</p><div class="button-row"><button type="button" id="export" class="small-btn">导出数据</button><button type="button" id="import" class="small-btn ghost">导入数据</button></div><div class="modal-actions"><button class="small-btn ghost">关闭</button></div>`);c.querySelector('#export').onclick=exportData;c.querySelector('#import').onclick=()=>document.querySelector('#importInput').click()}
function exportData(){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`日语学习备份-${todayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
document.querySelector('#importInput').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{data=JSON.parse(r.result);save();render();alert('导入完成')}catch{alert('备份文件格式不正确')}};r.readAsText(f)}

if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
render();
