(function(){
'use strict';
var API_BASE = 'https://j.heiwu.xyz';
var R2_BASE = 'https://music.heiwu.xyz';
var DEVICE_KEY = 'music_device_id';
var LOCAL_KEY  = 'music_data_v1';
var CACHE_NAME = 'music-audio-v1';
var BG_KEY = 'music_bg_v1';

var THEMES = {
  blue:   {name:'默认蓝', pri:'#4C6EF7', pri2:'#8B5CF6'},
  red:    {name:'网易红', pri:'#E5484D', pri2:'#F97316'},
  green:  {name:'清新绿', pri:'#30A46C', pri2:'#0EA5E9'},
  purple: {name:'梦幻紫', pri:'#8B5CF6', pri2:'#EC4899'},
  orange: {name:'活力橙', pri:'#F59E0B', pri2:'#EF4444'},
  pink:   {name:'少女粉', pri:'#EC4899', pri2:'#F43F5E'},
  dark:   {name:'深邃黑', pri:'#374151', pri2:'#1F2937'}
};

var T = {
  now:'正在播放', list:'播放列表', me:'我的',
  notPlaying:'未播放', addFirst:'点下方 + 添加音乐',
  emptyList:'还没有添加音乐', addMusicHint:'点上方按钮添加音乐',
  deleteConfirm:'确定从列表删除吗？',
  deleted:'已删除', notAudio:'不是音频文件', noFiles:'没有选择文件',
  cloudSync:'云同步', uploadToCloud:'上传到云端', downloadFromCloud:'从云端下载',
  syncDone:'同步完成', syncFail:'同步失败: ', uploading:'上传中...', downloading:'下载中...',
  confirmUpload:'确定将播放列表上传到云端？',
  confirmDownload:'确定从云端恢复播放列表？会覆盖本地列表。',
  export:'导出播放列表', clearAll:'清空所有数据',
  clearConfirm:'确定清空整个播放列表吗？', cleared:'已清空',
  deviceId:'设备 ID',
  cacheManage:'缓存管理', cacheHintUnit:'首',
  cacheCleared:'缓存已清空',
  uploadingProgress:'上传中 ', noPath:'这首歌没有音频地址',
  cacheMiss:'本地无缓存，正在下载...',
  themeTitle:'主题颜色', bgTitle:'播放页背景',
  bgPick:'选择图片', bgClear:'清除背景', bgCleared:'背景已清除', bgDone:'背景已更新',
  themeSaved:'主题已应用',
  sortManual:'手动', sortName:'名称', sortDate:'时间', sortSize:'大小',
  uploadThis:'上传这首歌',
  uploadSuccess:'已上传到云端', uploadFail:'上传失败: ',
  noLocalFile:'本地文件已失效，无法上传',
  addMusic:'添加音乐',
  downloadingSong:'正在下载...', downloadSuccess:'已下载到本地', downloadFail:'下载失败: ',
  localLost:'本地文件已失效，请重新添加'
};

var $=function(s){return document.querySelector(s)};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})};
var pad=function(n){return (n<10?'0':'')+n};
var uid=function(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)};

function fmtTime(sec){
  if(!isFinite(sec)||sec<0) sec=0;
  var m=Math.floor(sec/60), s=Math.floor(sec%60);
  return pad(m)+':'+pad(s);
}
function fmtSize(bytes){
  if(!bytes) return '0 B';
  if(bytes < 1024) return bytes+' B';
  if(bytes < 1048576) return (bytes/1024).toFixed(1)+' KB';
  if(bytes < 1073741824) return (bytes/1048576).toFixed(1)+' MB';
  return (bytes/1073741824).toFixed(2)+' GB';
}
function hexA(hex,a){
  var h = hex.replace('#','');
  if(h.length===3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  var n = parseInt(h,16);
  return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';
}

function getDeviceId(){
  var id=localStorage.getItem(DEVICE_KEY);
  if(!id){
    id='m_'+Math.random().toString(36).slice(2,10)+Math.random().toString(36).slice(2,6);
    localStorage.setItem(DEVICE_KEY,id);
  }
  return id;
}

var DB=null, DEVICE_ID='', curPage='now';
var audio=null, curIdx=-1, playMode='order';
var pendingConfirm=null;
var curTheme='blue';
var sortMode='manual';

function loadLocal(){try{var raw=localStorage.getItem(LOCAL_KEY);DB=raw?JSON.parse(raw):null}catch(e){DB=null}}
function saveLocal(){
  try{
    var copy = Object.assign({}, DB);
    copy.songs = DB.songs.map(function(s){
      return {
        id:s.id, name:s.name, size:s.size||0, mime:s.mime||'',
        r2Key:s.r2Key||'', createdAt:s.createdAt||''
      };
    });
    delete copy.background;
    localStorage.setItem(LOCAL_KEY, JSON.stringify(copy));
  }catch(e){ console.warn('save fail', e); }
}
function loadBg(){try{return localStorage.getItem(BG_KEY)||''}catch(e){return ''}}
function saveBg(b64){try{if(b64) localStorage.setItem(BG_KEY,b64); else localStorage.removeItem(BG_KEY)}catch(e){}}

function newEmpty(){return {songs:[],playMode:'order',lastIndex:-1,lastTime:0,theme:'blue'}}
function migrate(){
  if(!DB.songs) DB.songs=[];
  if(!DB.playMode) DB.playMode='order';
  if(DB.lastIndex==null) DB.lastIndex=-1;
  if(DB.lastTime==null) DB.lastTime=0;
  if(!DB.theme) DB.theme='blue';
  playMode=DB.playMode;
  curTheme=DB.theme;
}

function applyTheme(name){
  var t = THEMES[name] || THEMES.blue;
  document.documentElement.style.setProperty('--pri', t.pri);
  document.documentElement.style.setProperty('--pri-2', t.pri2);
  document.documentElement.style.setProperty('--pri-soft', hexA(t.pri, .12));
  var meta=document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', t.pri);
}

function toast(msg){
  var el=$('#toast');if(!el)return;
  el.textContent=msg;el.style.display='block';
  clearTimeout(el._t);
  el._t=setTimeout(function(){el.style.display='none'},1800);
}
function openModal(html){
  $('#modal').innerHTML=html;
  $('#modal').classList.add('show');
  $('#mask').classList.add('show');
}
function openSheet(html){
  $('#sheet').innerHTML='<div class="sheet-handle"></div>'+html;
  $('#sheet').classList.add('show');
  $('#mask').classList.add('show');
}
function closeOverlays(){
  $('#modal').classList.remove('show');
  $('#sheet').classList.remove('show');
  $('#mask').classList.remove('show');
  pendingConfirm=null;
}
function confirmBox(msg,ok,okText){
  pendingConfirm=ok;
  openModal('<div class="modal-body"><p style="font-size:14px;line-height:1.7;text-align:center;padding:8px 0 12px">'+esc(msg)+'</p></div>'
    +'<div class="modal-foot">'
    +'<button class="btn-ghost" data-action="confirm-cancel">取消</button>'
    +'<button class="btn-pri" data-action="confirm-ok">'+esc(okText||'确定')+'</button>'
    +'</div>');
}

/* ============ 缓存 (Cache Storage) ============ */
function audioCacheUrl(song){ return R2_BASE + '/' + (song.r2Key || song.id); }
function localCacheKey(song){ return 'local://' + song.id; }

async function getCachedAudio(song){
  if(!('caches' in window)) return null;
  try{
    var cache = await caches.open(CACHE_NAME);
    var res = await cache.match(audioCacheUrl(song));
    return res || null;
  }catch(e){ return null; }
}
async function putCachedAudio(song, response){
  if(!('caches' in window)) return;
  try{
    var cache = await caches.open(CACHE_NAME);
    await cache.put(audioCacheUrl(song), response.clone());
  }catch(e){}
}
async function removeCachedAudio(song){
  if(!('caches' in window)) return;
  try{
    var cache = await caches.open(CACHE_NAME);
    await cache.delete(audioCacheUrl(song));
  }catch(e){}
}
async function getLocalCachedAudio(song){
  if(!('caches' in window)) return null;
  if(song.r2Key) return null;
  try{
    var cache = await caches.open(CACHE_NAME);
    var res = await cache.match(new Request(localCacheKey(song)));
    return res || null;
  }catch(e){ return null; }
}
async function putLocalCachedAudio(song, fileOrBlob){
  if(!('caches' in window)) return false;
  try{
    var buf = await fileOrBlob.arrayBuffer();
    var cache = await caches.open(CACHE_NAME);
    await cache.put(
      new Request(localCacheKey(song)),
      new Response(buf, {
        headers: {
          'Content-Type': song.mime || 'audio/mpeg',
          'Content-Length': String(buf.byteLength)
        }
      })
    );
    return true;
  }catch(e){
    console.warn('putLocalCachedAudio fail', e);
    return false;
  }
}
async function removeLocalCachedAudio(song){
  if(!('caches' in window)) return;
  try{
    var cache = await caches.open(CACHE_NAME);
    await cache.delete(new Request(localCacheKey(song)));
  }catch(e){}
}
async function clearAllCache(){
  if(!('caches' in window)) return;
  try{ await caches.delete(CACHE_NAME); }catch(e){}
}
async function countCache(){
  if(!('caches' in window)) return {count:0, size:0};
  try{
    var cache = await caches.open(CACHE_NAME);
    var keys = await cache.keys();
    var count = keys.length, size = 0;
    for(var i=0;i<keys.length;i++){
      var res = await cache.match(keys[i]);
      if(res){
        try{
          var blob = await res.clone().blob();
          size += blob.size;
        }catch(e){}
      }
    }
    return {count:count, size:size};
  }catch(e){ return {count:0, size:0}; }
}

/* ============ IndexedDB 兜底 ============ */
var IDB_NAME = 'music_idb_v1';
var IDB_STORE = 'files';
function idbOpen(){
  return new Promise(function(resolve, reject){
    if(!window.indexedDB) return reject(new Error('no idb'));
    var req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = function(){
      var db = req.result;
      if(!db.objectStoreNames.contains(IDB_STORE)){
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = function(){ resolve(req.result); };
    req.onerror = function(){ reject(req.error); };
  });
}
async function idbPut(key, blob){
  try{
    var db = await idbOpen();
    return new Promise(function(resolve, reject){
      var tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(blob, key);
      tx.oncomplete = function(){ resolve(true); };
      tx.onerror = function(){ reject(tx.error); };
    });
  }catch(e){ return false; }
}
async function idbGet(key){
  try{
    var db = await idbOpen();
    return new Promise(function(resolve, reject){
      var tx = db.transaction(IDB_STORE, 'readonly');
      var req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = function(){ resolve(req.result || null); };
      req.onerror = function(){ reject(req.error); };
    });
  }catch(e){ return null; }
}
async function idbDelete(key){
  try{
    var db = await idbOpen();
    return new Promise(function(resolve){
      var tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = function(){ resolve(true); };
      tx.onerror = function(){ resolve(false); };
    });
  }catch(e){ return false; }
}
async function idbClear(){
  try{
    var db = await idbOpen();
    return new Promise(function(resolve){
      var tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = function(){ resolve(true); };
      tx.onerror = function(){ resolve(false); };
    });
  }catch(e){ return false; }
}
async function idbCount(){
  try{
    var db = await idbOpen();
    return new Promise(function(resolve){
      var tx = db.transaction(IDB_STORE, 'readonly');
      var req = tx.objectStore(IDB_STORE).count();
      req.onsuccess = function(){ resolve(req.result || 0); };
      req.onerror = function(){ resolve(0); };
    });
  }catch(e){ return 0; }
}

/* ============ 本地文件统一读写 ============ */
async function saveLocalFile(song, fileOrBlob){
  // 双写：Cache Storage + IndexedDB
  var okCache = await putLocalCachedAudio(song, fileOrBlob);
  await idbPut(song.id, fileOrBlob);
  return okCache;
}
async function loadLocalFile(song){
  // 先查 Cache
  var res = await getLocalCachedAudio(song);
  if(res){
    try{ return await res.blob(); }catch(e){}
  }
  // 再查 IDB
  var blob = await idbGet(song.id);
  if(blob) return blob;
  return null;
}
async function deleteLocalFile(song){
  await removeLocalCachedAudio(song);
  await idbDelete(song.id);
}

/* ============ 封面 ============ */
function readCover(fileOrBlobUrl){
  return new Promise(function(resolve){
    try{
      if(!window.FileReader){ resolve(''); return; }
      var reader = new FileReader();
      reader.onload = function(){
        try{
          var bytes = new Uint8Array(reader.result);
          resolve(findImageInAudio(bytes) || '');
        }catch(e){ resolve(''); }
      };
      reader.onerror = function(){ resolve(''); };
      if(fileOrBlobUrl instanceof Blob){
        reader.readAsArrayBuffer(fileOrBlobUrl);
      } else {
        fetch(fileOrBlobUrl).then(function(r){return r.blob()}).then(function(b){
          reader.readAsArrayBuffer(b);
        }).catch(function(){ resolve(''); });
      }
    }catch(e){ resolve(''); }
  });
}
function findImageInAudio(bytes){
  for(var i=0;i<bytes.length-3;i++){
    if(bytes[i]===0xFF && bytes[i+1]===0xD8 && bytes[i+2]===0xFF){
      for(var j=i+2;j<bytes.length-1;j++){
        if(bytes[j]===0xFF && bytes[j+1]===0xD9){
          var slice = bytes.slice(i, j+2);
          if(slice.length > 100 && slice.length < 500000){
            return URL.createObjectURL(new Blob([slice], {type:'image/jpeg'}));
          }
          break;
        }
      }
    }
  }
  for(var k=0;k<bytes.length-8;k++){
    if(bytes[k]===0x89 && bytes[k+1]===0x50 && bytes[k+2]===0x4E && bytes[k+3]===0x47){
      for(var m=k+4;m<bytes.length-8;m++){
        if(bytes[m]===0x49 && bytes[m+1]===0x45 && bytes[m+2]===0x4E && bytes[m+3]===0x44){
          var slice2 = bytes.slice(k, m+8);
          if(slice2.length > 100 && slice2.length < 500000){
            return URL.createObjectURL(new Blob([slice2], {type:'image/png'}));
          }
          break;
        }
      }
    }
  }
  return '';
}

/* ============ 播放 ============ */
function ensureAudio(){
  if(audio) return;
  audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';
  audio.addEventListener('timeupdate', function(){
    if(!audio.duration) return;
    var pct = audio.currentTime / audio.duration * 100;
    var pf=$('#progress-fill'); if(pf) pf.style.width = pct+'%';
    var tc=$('#time-cur'); if(tc) tc.textContent = fmtTime(audio.currentTime);
    if(curIdx>=0){ DB.lastIndex = curIdx; DB.lastTime = audio.currentTime; }
  });
  audio.addEventListener('progress', function(){
    if(!audio.buffered.length || !audio.duration) return;
    var end = audio.buffered.end(audio.buffered.length-1);
    var pb=$('#progress-buffer'); if(pb) pb.style.width = (end/audio.duration*100)+'%';
  });
  audio.addEventListener('loadedmetadata', function(){
    var tt=$('#time-total'); if(tt) tt.textContent = fmtTime(audio.duration);
  });
  audio.addEventListener('ended', function(){
    if(playMode==='single'){ audio.currentTime=0; audio.play(); }
    else { nextSong(); }
  });
  audio.addEventListener('play', function(){ updatePlayBtn(true); });
  audio.addEventListener('pause', function(){ updatePlayBtn(false); });
  audio.addEventListener('error', function(){
    toast('播放失败：' + (audio.error ? audio.error.code : ''));
  });
}
function updatePlayBtn(playing){
  var ip=$('#icon-play'), ipa=$('#icon-pause');
  if(ip) ip.style.display = playing ? 'none' : 'block';
  if(ipa) ipa.style.display = playing ? 'block' : 'none';
  var mp=$('#mini-play');
  if(mp){
    var p1=mp.querySelector('.mini-icon-play');
    var p2=mp.querySelector('.mini-icon-pause');
    if(p1) p1.style.display = playing ? 'none' : 'block';
    if(p2) p2.style.display = playing ? 'block' : 'none';
  }
}
async function playIndex(idx){
  if(idx<0 || idx>=DB.songs.length) return;
  curIdx = idx;
  var song = DB.songs[idx];
  ensureAudio();

  /* 1. 内存中的 Blob URL */
  if(song.localBlobUrl){
    audio.src = song.localBlobUrl;
    audio.load(); audio.play().catch(function(){});
    updateNowUI(); renderList(); updateMini();
    DB.lastIndex = idx; return;
  }

  /* 2. 本地文件恢复（Cache Storage + IndexedDB） */
  if(!song.r2Key){
    var localBlob = await loadLocalFile(song);
    if(localBlob){
      if(song._playingUrl) URL.revokeObjectURL(song._playingUrl);
      song._playingUrl = URL.createObjectURL(localBlob);
      song.localBlobUrl = song._playingUrl;
      try{
        song._fileBlob = new File([localBlob], song.name, {type: song.mime || 'audio/mpeg'});
      }catch(e){ song._fileBlob = localBlob; }

      audio.src = song._playingUrl;
      audio.load(); audio.play().catch(function(){});
      updateNowUI(); renderList(); updateMini();
      DB.lastIndex = idx;
      return;
    } else {
      toast(T.localLost);
      return;
    }
  }

  /* 3. 云端缓存 */
  var cached = await getCachedAudio(song);
  if(cached){
    try{
      var blob = await cached.blob();
      if(song._playingUrl) URL.revokeObjectURL(song._playingUrl);
      song._playingUrl = URL.createObjectURL(blob);
      audio.src = song._playingUrl;
      audio.load(); audio.play().catch(function(){});
      updateNowUI(); renderList(); updateMini();
      DB.lastIndex = idx; return;
    }catch(e){}
  }
  if(!song.r2Key){ toast(T.noPath); return; }
  toast(T.cacheMiss);
  try{
    var res = await fetch(audioCacheUrl(song));
    if(!res.ok) throw new Error('HTTP '+res.status);
    await putCachedAudio(song, res);
    var cached2 = await getCachedAudio(song);
    if(!cached2) throw new Error('缓存失败');
    var blob2 = await cached2.blob();
    if(song._playingUrl) URL.revokeObjectURL(song._playingUrl);
    song._playingUrl = URL.createObjectURL(blob2);
    audio.src = song._playingUrl;
    audio.load(); audio.play().catch(function(){});
    updateNowUI(); renderList(); updateMini();
    DB.lastIndex = idx; updateCacheHint();
  }catch(e){ toast('下载失败：'+e.message); }
}
function togglePlay(){
  if(curIdx<0 && DB.songs.length>0){ playIndex(0); return; }
  if(curIdx<0) return;
  ensureAudio();
  if(audio.paused) audio.play(); else audio.pause();
}
function nextSong(){
  if(!DB.songs.length) return;
  var next;
  if(playMode==='shuffle'){
    if(DB.songs.length===1) next=0;
    else { do{ next=Math.floor(Math.random()*DB.songs.length); }while(next===curIdx); }
  } else { next = (curIdx+1) % DB.songs.length; }
  playIndex(next);
}
function prevSong(){
  if(!DB.songs.length) return;
  var prev;
  if(playMode==='shuffle'){
    if(DB.songs.length===1) prev=0;
    else { do{ prev=Math.floor(Math.random()*DB.songs.length); }while(prev===curIdx); }
  } else { prev = (curIdx-1+DB.songs.length) % DB.songs.length; }
  playIndex(prev);
}
function cycleMode(){
  var order=['order','shuffle','single'];
  var names={order:'顺序',shuffle:'随机',single:'单曲'};
  playMode=order[(order.indexOf(playMode)+1)%3];
  DB.playMode=playMode;
  saveLocal();
  var btn=$('#btn-mode'); if(btn) btn.textContent=names[playMode];
  toast('播放模式：'+names[playMode]);
}
function toggleVolume(){
  var w=$('#volume-wrap');
  if(!w) return;
  w.style.display = (w.style.display==='none') ? 'block' : 'none';
}

/* ============ 更新正在播放页 UI ============ */
function updateNowUI(){
  var coverWrap = document.getElementById('cover-wrap');
  if(!coverWrap) return;

  if(curIdx<0 || !DB.songs[curIdx]){
    coverWrap.classList.add('empty-state');
    coverWrap.innerHTML =
      '<div class="empty-icon">♪</div>'
      +'<div class="empty-tip">'+T.emptyList+'</div>'
      +'<button class="empty-btn" data-action="add-music">'
      +'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
      +T.addMusic+'</button>';
    var el1=$('#song-title'); if(el1) el1.textContent='';
    var el2=$('#song-sub'); if(el2) el2.textContent='';
    var lp = document.querySelector('.lyric-placeholder'); if(lp) lp.style.display='none';
    var pw = document.querySelector('.progress-wrap'); if(pw) pw.style.display='none';
    var ct = document.querySelector('.controls'); if(ct) ct.style.display='none';
    var vw = document.querySelector('.volume-wrap'); if(vw) vw.style.display='none';
    return;
  }

  coverWrap.classList.remove('empty-state');
  if(!coverWrap.querySelector('.cover')){
    coverWrap.innerHTML =
      '<div class="cover" id="cover">'
      +'<span class="cover-icon">♪</span>'
      +'<img id="cover-img" alt="">'
      +'</div>';
  }
  var lp = document.querySelector('.lyric-placeholder'); if(lp) lp.style.display='';
  var pw = document.querySelector('.progress-wrap'); if(pw) pw.style.display='';
  var ct = document.querySelector('.controls'); if(ct) ct.style.display='';

  var s = DB.songs[curIdx];
  var t = $('#song-title'); if(t) t.textContent = s.name;
  var sub = $('#song-sub');
  if(sub) sub.textContent = (s.r2Key?'云端':'本地') + ' · ' + fmtSize(s.size||0);

  var cover = $('#cover');
  var img = $('#cover-img');

  if(s.coverUrl){
    if(img) img.src = s.coverUrl;
    if(cover){
      cover.classList.add('has-img');
      cover.classList.remove('spin-disc');
    }
  } else {
    if(cover) cover.classList.remove('has-img');
    if(img) img.src = '';
    var target = s._fileBlob || s.localBlobUrl;
    if(target){
      readCover(target).then(function(url){
        if(url){
          s.coverUrl = url;
          var img2 = $('#cover-img');
          var cover2 = $('#cover');
          if(img2) img2.src = url;
          if(cover2){
            cover2.classList.add('has-img');
            cover2.classList.remove('spin-disc');
          }
          updateMini();
        } else {
          var cover3 = $('#cover');
          if(cover3) cover3.classList.add('spin-disc');
        }
      });
    } else {
      if(cover) cover.classList.add('spin-disc');
    }
  }
}
function updateMini(){
  var mb=$('#mini-bar');
  if(!mb) return;
  if(curIdx<0 || !DB.songs[curIdx]){ mb.style.display='none'; return; }
  mb.style.display='flex';
  var s=DB.songs[curIdx];
  var mt=$('#mini-title'); if(mt) mt.textContent=s.name;
  var ms=$('#mini-sub'); if(ms) ms.textContent = (s.r2Key?'云端':'本地')+' · '+fmtSize(s.size||0);
  var mc=$('#mini-cover');
  if(mc){
    if(s.coverUrl){ mc.innerHTML='<img src="'+s.coverUrl+'">'; }
    else { mc.textContent='♪'; }
  }
}

/* ============ 排序 ============ */
function getSortedSongs(){
  var arr = DB.songs.slice();
  if(sortMode === 'name'){
    arr.sort(function(a,b){ return a.name.localeCompare(b.name, 'zh-CN'); });
  } else if(sortMode === 'date'){
    arr.sort(function(a,b){
      var ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      var tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  } else if(sortMode === 'size'){
    arr.sort(function(a,b){ return (b.size||0) - (a.size||0); });
  }
  return arr;
}
function renderSortBar(){
  var bar = $('#sort-bar');
  if(!bar) return;
  var opts = [
    ['manual', T.sortManual],
    ['name', T.sortName],
    ['date', T.sortDate],
    ['size', T.sortSize]
  ];
  bar.innerHTML = opts.map(function(o){
    return '<button data-action="set-sort" data-v="'+o[0]+'" class="'+(sortMode===o[0]?'on':'')+'">'+o[1]+'</button>';
  }).join('');
}
function setSort(mode){
  sortMode = mode;
  renderSortBar();
  renderList();
}
function moveSongUp(idx){
  if(idx <= 0) return;
  var s = DB.songs[idx];
  var prev = DB.songs[idx-1];
  DB.songs[idx-1] = s;
  DB.songs[idx] = prev;
  if(curIdx === idx) curIdx = idx-1;
  else if(curIdx === idx-1) curIdx = idx;
  saveLocal();
  renderList();
}
function moveSongDown(idx){
  if(idx >= DB.songs.length-1) return;
  var s = DB.songs[idx];
  var next = DB.songs[idx+1];
  DB.songs[idx+1] = s;
  DB.songs[idx] = next;
  if(curIdx === idx) curIdx = idx+1;
  else if(curIdx === idx+1) curIdx = idx;
  saveLocal();
  renderList();
}

/* ============ 上传单首 ============ */
async function uploadOneSong(idx){
  var song = DB.songs[idx];
  if(!song) return;
  if(song.r2Key){ toast('已经是云端'); return; }

  var blob = null;
  if(song._fileBlob){
    blob = song._fileBlob;
  } else if(song.localBlobUrl){
    try{ blob = await fetch(song.localBlobUrl).then(function(r){return r.blob()}); }catch(e){}
  } else {
    blob = await loadLocalFile(song);
  }
  if(!blob){ toast(T.noLocalFile); return; }

  toast(T.uploadingProgress + '1/1');
  try{
    var extMatch = (song.name.match(/\.[^.]+$/) || ['.mp3']);
    var ext = extMatch[0].toLowerCase();
    if(ext.indexOf('.') !== 0) ext = '.' + ext;
    var key = uid() + ext;
    var url = API_BASE + '/api/music/upload?device_id=' + encodeURIComponent(DEVICE_ID)
            + '&key=' + encodeURIComponent(key);
    var res = await fetch(url, {
      method:'POST',
      headers: {'Content-Type': song.mime || 'audio/mpeg'},
      body: blob
    });
    var data = await res.json();
    if(data.error) throw new Error(data.error);
    song.r2Key = data.r2Key;
    saveLocal();
    renderList();
    toast(T.uploadSuccess);
  }catch(e){
    toast(T.uploadFail + e.message);
  }
}

/* ============ 下载单首到本地 ============ */
async function downloadOneSong(idx){
  var song = DB.songs[idx];
  if(!song) return;
  toast(T.downloadingSong);
  try{
    var blob = null;

    if(song._fileBlob){
      blob = song._fileBlob;
    } else if(song.localBlobUrl){
      try{ blob = await fetch(song.localBlobUrl).then(function(r){return r.blob()}); }catch(e){}
    }

    if(!blob && !song.r2Key){
      blob = await loadLocalFile(song);
    }
    if(!blob){
      var cc = await getCachedAudio(song);
      if(cc) blob = await cc.blob();
    }
    if(!blob && song.r2Key){
      var res = await fetch(audioCacheUrl(song));
      if(!res.ok) throw new Error('HTTP '+res.status);
      blob = await res.blob();
    }

    if(!blob) throw new Error('没有可用音频');

    var extMatch = (song.name.match(/\.[^.]+$/) || ['.mp3']);
    var ext = extMatch[0].toLowerCase();
    var filename = song.name + (ext.indexOf('.')===0 ? ext : '.mp3');
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 5000);

    toast(T.downloadSuccess);
  }catch(e){
    toast(T.downloadFail + e.message);
  }
}

/* ============ 列表 ============ */
function renderList(){
  renderSortBar();
  var box=$('#playlist-content');
  if(!box) return;
  if(!DB.songs.length){
    box.innerHTML='<div class="empty"><span class="big">♪</span>'+T.emptyList+'<br>'+T.addMusicHint+'</div>';
    return;
  }
  var isManual = (sortMode === 'manual');
  var displaySongs = isManual ? DB.songs : getSortedSongs();

  var html='<div class="pl-list">';
  displaySongs.forEach(function(s){
    var realIdx = DB.songs.indexOf(s);
    var on = realIdx===curIdx ? ' on' : '';
    var isCloud = !!s.r2Key;
    var badge = isCloud ? '<span class="badge">云端</span>' : '<span class="badge local">本地</span>';
    var cls = 'pl-item' + on + (isManual ? '' : ' auto-sort');

    var ops = '';
    if(isManual){
      ops += '<button class="op-btn up" data-action="move-up" data-idx="'+realIdx+'" '+(realIdx<=0?'disabled':'')+'>↑</button>';
      ops += '<button class="op-btn down" data-action="move-down" data-idx="'+realIdx+'" '+(realIdx>=DB.songs.length-1?'disabled':'')+'>↓</button>';
    }
    if(!isCloud){
      ops += '<button class="op-btn upload" data-action="upload-one" data-idx="'+realIdx+'">☁↑</button>';
    }
    ops += '<button class="op-btn download" data-action="download-one" data-idx="'+realIdx+'">⤓</button>';
    ops += '<button class="op-btn del" data-action="del-song" data-idx="'+realIdx+'">×</button>';

    html+='<div class="'+cls+'" data-action="play-index" data-idx="'+realIdx+'">'
      +'<span class="idx">'+(on?'▶':'')+'</span>'
      +'<div class="info">'
      +'<div class="nm">'+esc(s.name)+'</div>'
      +'<div class="sub">'+badge+'<span>'+fmtSize(s.size||0)+'</span></div>'
      +'</div>'
      +'<div class="ops">'+ops+'</div>'
      +'</div>';
  });
  html+='</div>';
  box.innerHTML=html;
}

/* ============ 添加 ============ */
function pickMusic(){
  var input=$('#music-file');
  input.value='';
  input.click();
}
async function onFilesPicked(files){
  if(!files || !files.length){ toast(T.noFiles); return; }
  var filesArr = Array.prototype.slice.call(files);
  var audioFiles = filesArr.filter(function(f){
    if(f.type && f.type.indexOf('audio')===0) return true;
    return /\.(mp3|m4a|aac|wav|ogg|flac|opus)$/i.test(f.name);
  });
  if(!audioFiles.length){ toast(T.notAudio); return; }
  window._pendingAudioFiles = audioFiles;
  openModal(
    '<div class="modal-body" style="padding:20px 18px 8px">'
    +'<p style="text-align:center;font-size:15px;font-weight:600;margin-bottom:6px">选了 '+audioFiles.length+' 首音乐</p>'
    +'<p style="text-align:center;font-size:12px;color:var(--sub);line-height:1.6">「仅本地」不上传云端</p>'
    +'</div>'
    +'<div class="modal-foot">'
    +'<button class="btn-pri" data-action="do-upload-music">上传到云端</button>'
    +'<button class="btn-ghost" data-action="do-local-music">仅本地</button>'
    +'<button class="btn-ghost" data-action="confirm-cancel">取消</button>'
    +'</div>'
  );
}
async function addFilesLocal(){
  var files = window._pendingAudioFiles || [];
  closeOverlays();
  if(!files.length) return;
  toast('正在保存本地...');
  for(var i=0;i<files.length;i++){
    var f = files[i];
    var song = {
      id: uid(),
      name: f.name.replace(/\.[^.]+$/,''),
      size: f.size, mime: f.type || '',
      localBlobUrl: URL.createObjectURL(f),
      _fileBlob: f,
      r2Key: '',
      createdAt: new Date().toISOString()
    };
    DB.songs.push(song);
    // 双写：Cache Storage + IndexedDB
    await saveLocalFile(song, f);
  }
  saveLocal(); renderList(); updateMini(); updateNowUI();
  toast('已添加 '+files.length+' 首（仅本地）');
  if(curIdx<0) playIndex(DB.songs.length-1);
  window._pendingAudioFiles = null;
}
async function addFilesUpload(){
  var files = window._pendingAudioFiles || [];
  closeOverlays();
  if(!files.length) return;
  toast(T.uploadingProgress + '0/' + files.length);
  var okCount=0, failCount=0;
  for(var i=0;i<files.length;i++){
    var f=files[i];
    try{
      var ext = (f.name.match(/\.[^.]+$/) || ['.mp3'])[0].toLowerCase();
      var key = uid() + ext;
      var url = API_BASE + '/api/music/upload?device_id=' + encodeURIComponent(DEVICE_ID)
              + '&key=' + encodeURIComponent(key);
      var res = await fetch(url, {
        method:'POST',
        headers: {'Content-Type': f.type || 'audio/mpeg'},
        body: f
      });
      var data = await res.json();
      if(data.error) throw new Error(data.error);
      var song = {
        id: uid(),
        name: f.name.replace(/\.[^.]+$/,''),
        size: f.size, mime: f.type || '',
        r2Key: data.r2Key, _fileBlob: f,
        createdAt: new Date().toISOString()
      };
      DB.songs.push(song);
      // 双写：本地也缓存一份
      await saveLocalFile(song, f);
      okCount++;
      saveLocal(); renderList(); updateMini(); updateNowUI();
      toast(T.uploadingProgress + okCount + '/' + files.length);
    }catch(e){ failCount++; console.warn('upload fail', e); }
  }
  window._pendingAudioFiles = null;
  if(failCount===0) toast('已上传 '+okCount+' 首');
  else toast('成功 '+okCount+' 首，失败 '+failCount+' 首');
  if(curIdx<0 && DB.songs.length>0) playIndex(DB.songs.length-1);
}
async function delSong(idx){
  if(idx<0||idx>=DB.songs.length) return;
  var song = DB.songs[idx];
  confirmBox(T.deleteConfirm, async function(){
    if(song.r2Key){
      try{
        var url = API_BASE + '/api/music/delete?device_id=' + encodeURIComponent(DEVICE_ID);
        await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({r2Key: song.r2Key})});
      }catch(e){}
    }
    await removeCachedAudio(song);
    await deleteLocalFile(song);
    if(song.localBlobUrl) URL.revokeObjectURL(song.localBlobUrl);
    if(song._playingUrl) URL.revokeObjectURL(song._playingUrl);
    if(song.coverUrl) URL.revokeObjectURL(song.coverUrl);
    DB.songs.splice(idx,1);
    if(curIdx===idx){
      curIdx=-1;
      if(audio){ audio.pause(); audio.src=''; }
      updateNowUI(); updateMini();
    } else if(curIdx>idx){ curIdx--; }
    DB.lastIndex = curIdx;
    saveLocal(); renderList(); updateMini();
    toast(T.deleted);
  });
}

/* ============ 云同步 ============ */
function serializeSongs(){
  return DB.songs.map(function(s){
    return { id:s.id, name:s.name, size:s.size||0, mime:s.mime||'', r2Key:s.r2Key||'', createdAt:s.createdAt||'' };
  });
}
function uploadToCloud(){
  toast(T.uploading);
  setTimeout(function(){
    var url = API_BASE + '/api/upload?device_id=' + encodeURIComponent(DEVICE_ID);
    fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      transactions: { songs: serializeSongs() },
      config: { playMode: playMode, theme: curTheme }
    })}).then(function(r){return r.json()}).then(function(d){
      if(d.error) throw new Error(d.error);
      toast(T.syncDone);
    }).catch(function(e){ toast(T.syncFail+e.message); });
  },50);
}
function downloadFromCloud(){
  toast(T.downloading);
  setTimeout(function(){
    var url = API_BASE + '/api/download?device_id=' + encodeURIComponent(DEVICE_ID);
    fetch(url).then(function(r){return r.json()}).then(function(d){
      if(d.error) throw new Error(d.error);
      var tx=d.transactions;
      var songs = (tx && tx.songs) ? tx.songs : [];
      var oldMap={};
      DB.songs.forEach(function(s){ oldMap[s.id]=s; });
      DB.songs = songs.map(function(s){
        var old = oldMap[s.id];
        return {
          id:s.id, name:s.name, size:s.size||0, mime:s.mime||'',
          r2Key:s.r2Key||'', createdAt:s.createdAt||'',
          localBlobUrl: old ? old.localBlobUrl : '',
          _fileBlob: old ? old._fileBlob : null,
          _playingUrl: old ? old._playingUrl : ''
        };
      });
      if(d.config){
        if(d.config.playMode){ playMode=d.config.playMode; DB.playMode=playMode; }
        if(d.config.theme){ curTheme=d.config.theme; DB.theme=curTheme; applyTheme(curTheme); }
      }
      saveLocal(); renderList(); updateNowUI(); updateMini(); renderMe();
      var mb=$('#btn-mode'); if(mb) mb.textContent = ({order:'顺序',shuffle:'随机',single:'单曲'})[playMode] || '顺序';
      toast(T.syncDone);
    }).catch(function(e){ toast(T.syncFail+e.message); });
  },50);
}

/* ============ 主题 / 背景 ============ */
function openThemeSheet(){
  var html = '<div class="sheet-title">'+T.themeTitle+'</div>';
  html += '<div class="theme-grid">';
  Object.keys(THEMES).forEach(function(key){
    var t = THEMES[key];
    html += '<div class="theme-item'+(curTheme===key?' on':'')+'" data-action="pick-theme" data-v="'+key+'">'
      +'<div class="theme-swatch" style="background:linear-gradient(135deg,'+t.pri+','+t.pri2+')"></div>'
      +'<div class="theme-name">'+t.name+'</div>'
      +'</div>';
  });
  html += '</div>';
  openSheet(html);
}
function pickTheme(name){
  if(!THEMES[name]) return;
  curTheme = name;
  DB.theme = name;
  applyTheme(name);
  saveLocal();
  closeOverlays();
  renderMe();
  toast(T.themeSaved);
}
function openBgSheet(){
  openModal(
    '<div class="modal-body" style="padding:20px 18px 8px">'
    +'<p style="text-align:center;font-size:15px;font-weight:600;margin-bottom:6px">'+T.bgTitle+'</p>'
    +'<p style="text-align:center;font-size:12px;color:var(--sub);line-height:1.6">选一张图片作为「正在播放」页背景</p>'
    +'</div>'
    +'<div class="modal-foot">'
    +'<button class="btn-pri" data-action="do-pick-bg">'+T.bgPick+'</button>'
    +'<button class="btn-ghost" data-action="do-clear-bg">'+T.bgClear+'</button>'
    +'<button class="btn-ghost" data-action="confirm-cancel">取消</button>'
    +'</div>'
  );
}
function pickBgFile(){
  var input = $('#bg-file');
  input.value='';
  input.click();
}
async function onBgPicked(file){
  if(!file) return;
  try{
    var b64 = await compressImage(file, 1200, 0.7);
    saveBg(b64);
    applyBg();
    toast(T.bgDone);
  }catch(e){ toast('处理失败：'+e.message); }
}
function compressImage(file, maxSize, quality){
  return new Promise(function(resolve,reject){
    var reader = new FileReader();
    reader.onload = function(){
      var img = new Image();
      img.onload = function(){
        var w = img.width, h = img.height;
        if(w > h){ if(w > maxSize){ h = h*maxSize/w; w = maxSize; } }
        else { if(h > maxSize){ w = w*maxSize/h; h = maxSize; } }
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(w); canvas.height = Math.round(h);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = function(){ reject(new Error('图片解析失败')); };
      img.src = reader.result;
    };
    reader.onerror = function(){ reject(new Error('读取失败')); };
    reader.readAsDataURL(file);
  });
}
function applyBg(){
  var bg = loadBg();
  var el = $('#now-bg');
  if(!el) return;
  if(bg){
    el.style.backgroundImage = 'url('+bg+')';
    el.classList.add('show');
  } else {
    el.style.backgroundImage = '';
    el.classList.remove('show');
  }
  var hint = $('#bg-hint');
  if(hint) hint.textContent = bg ? '已设置' : '无';
}
function clearBg(){
  saveBg('');
  applyBg();
  closeOverlays();
  toast(T.bgCleared);
}

/* ============ 导出 / 清空 ============ */
function doExport(){
  var data = { songs: serializeSongs(), playMode: playMode, theme: curTheme };
  var blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'playlist.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 3000);
  toast('已导出');
}
function clearAll(){
  confirmBox(T.clearConfirm, function(){
    DB.songs.forEach(function(s){
      if(s.localBlobUrl) URL.revokeObjectURL(s.localBlobUrl);
      if(s._playingUrl) URL.revokeObjectURL(s._playingUrl);
      if(s.coverUrl) URL.revokeObjectURL(s.coverUrl);
    });
    clearAllCache().then(function(){
      updateCacheHint();
    });
    idbClear();
    DB.songs=[];
    curIdx=-1;
    if(audio){ audio.pause(); audio.src=''; }
    DB.lastIndex=-1; DB.lastTime=0;
    saveLocal(); renderList(); updateNowUI(); updateMini();
    toast(T.cleared);
  });
}

/* ============ 缓存管理 ============ */
async function openCacheSheet(){
  var info = await countCache();
  var idbN = await idbCount();
  openModal(
    '<div class="modal-body" style="padding:20px 18px 8px">'
    +'<p style="text-align:center;font-size:15px;font-weight:600;margin-bottom:10px">'+T.cacheManage+'</p>'
    +'<p style="text-align:center;font-size:13px;color:var(--sub);line-height:1.8">'
    +'Cache：'+info.count+' 条 · '+fmtSize(info.size)+'<br>'
    +'IndexedDB：'+idbN+' 条'
    +'</p>'
    +'</div>'
    +'<div class="modal-foot">'
    +'<button class="btn-pri" data-action="do-clear-cache">清空缓存</button>'
    +'<button class="btn-ghost" data-action="confirm-cancel">取消</button>'
    +'</div>'
  );
}
async function doClearCache(){
  closeOverlays();
  await clearAllCache();
  await idbClear();
  var hint=$('#cache-hint'); if(hint) hint.textContent='0 首';
  toast(T.cacheCleared);
}
async function updateCacheHint(){
  var hint=$('#cache-hint'); if(!hint) return;
  var info = await countCache();
  hint.textContent = info.count + ' ' + T.cacheHintUnit;
}

/* ============ 设备 ID ============ */
function openDeviceEditor(){
  openModal('<div class="modal-body">'
    +'<p style="text-align:center;font-size:15px;font-weight:600;margin-bottom:14px">'+T.deviceId+'</p>'
    +'<input id="dev-id-input" style="width:100%;height:42px;border:1.5px solid var(--line);border-radius:10px;padding:0 12px;background:var(--bg);font-size:14px;color:var(--ink)" value="'+esc(DEVICE_ID)+'">'
    +'<p style="font-size:12px;color:var(--sub);margin-top:10px;line-height:1.6">换手机时，把旧手机的 ID 复制到这里，下载云端歌单。</p>'
    +'</div><div class="modal-foot">'
    +'<button class="btn-pri" data-action="save-device">保存</button>'
    +'<button class="btn-ghost" data-action="copy-device">复制 ID</button>'
    +'<button class="btn-ghost" data-action="confirm-cancel">取消</button>'
    +'</div>');
}
function saveDevice(){
  var input=document.getElementById('dev-id-input');
  if(!input) return;
  var newId=(input.value||'').trim();
  if(!newId){ toast('请输入设备 ID'); return; }
  DEVICE_ID=newId;
  localStorage.setItem(DEVICE_KEY, newId);
  closeOverlays();
  if(curPage==='me') renderMe();
  toast('已保存');
}
function copyDevice(){
  var input=document.getElementById('dev-id-input');
  if(!input) return;
  input.select(); input.setSelectionRange(0,9999);
  try{ document.execCommand('copy'); toast('已复制'); }catch(e){ toast('复制失败'); }
}

/* ============ 页面 ============ */
var TITLES={now:T.now,list:T.list,me:T.me};
function switchPage(p){
  curPage=p;
  ['now','list','me'].forEach(function(k){ $('#page-'+k).classList.toggle('active',k===p); });
  document.querySelectorAll('.tab').forEach(function(b){ b.classList.toggle('on', b.dataset.page===p); });
  $('#page-title').textContent=TITLES[p];
  if(p==='me') renderMe();
  if(p==='list') renderList();
  if(p==='now') updateNowUI();
  updateMini();
}
function renderMe(){
  var d=$('#user-device'); if(d) d.textContent=DEVICE_ID;
  updateCacheHint();
  var th=$('#theme-hint');
  if(th) th.textContent = (THEMES[curTheme]||THEMES.blue).name;
  var bg = loadBg();
  var bh=$('#bg-hint');
  if(bh) bh.textContent = bg ? '已设置' : '无';
}

function handleAction(e){
  var el=e.target.closest('[data-action]');
  if(!el) return;
  var act=el.dataset.action, idx=parseInt(el.dataset.idx);
  switch(act){
    case 'tab':switchPage(el.dataset.page);break;
    case 'add-music':pickMusic();break;
    case 'toggle-play':togglePlay();break;
    case 'next':nextSong();break;
    case 'prev':prevSong();break;
    case 'cycle-mode':cycleMode();break;
    case 'volume':toggleVolume();break;
    case 'play-index':
      if(e.target.closest('.op-btn')) return;
      playIndex(idx);
      break;
    case 'del-song':delSong(idx);break;
    case 'move-up':moveSongUp(idx);break;
    case 'move-down':moveSongDown(idx);break;
    case 'upload-one':uploadOneSong(idx);break;
    case 'download-one':downloadOneSong(idx);break;
    case 'set-sort':setSort(el.dataset.v);break;
    case 'do-upload-music':addFilesUpload();break;
    case 'do-local-music':addFilesLocal();break;
    case 'cache-manage':openCacheSheet();break;
    case 'do-clear-cache':doClearCache();break;
    case 'open-theme':openThemeSheet();break;
    case 'pick-theme':pickTheme(el.dataset.v);break;
    case 'open-bg':openBgSheet();break;
    case 'do-pick-bg':closeOverlays();pickBgFile();break;
    case 'do-clear-bg':clearBg();break;
    case 'cloud-sync':
      openModal('<div class="modal-body" style="padding:24px 18px 8px"><p style="text-align:center;font-size:15px;font-weight:600;margin-bottom:6px">'+T.cloudSync+'</p></div>'
        +'<div class="modal-foot">'
        +'<button class="btn-pri" data-action="upload-cloud">'+T.uploadToCloud+'</button>'
        +'<button class="btn-ghost" data-action="download-cloud">'+T.downloadFromCloud+'</button>'
        +'<button class="btn-ghost" data-action="confirm-cancel">取消</button>'
        +'</div>');
      break;
    case 'upload-cloud':closeOverlays();confirmBox(T.confirmUpload,uploadToCloud);break;
    case 'download-cloud':closeOverlays();confirmBox(T.confirmDownload,downloadFromCloud);break;
    case 'export':doExport();break;
    case 'clear-all':clearAll();break;
    case 'edit-device':openDeviceEditor();break;
    case 'save-device':saveDevice();break;
    case 'copy-device':copyDevice();break;
    case 'close-sheet':closeOverlays();break;
    case 'confirm-cancel':closeOverlays();break;
    case 'confirm-ok':
      var fn=pendingConfirm; closeOverlays(); if(fn) fn();
      break;
  }
}

document.addEventListener('click', handleAction);

document.getElementById('music-file').addEventListener('change', function(){
  onFilesPicked(this.files);
});
document.getElementById('bg-file').addEventListener('change', function(){
  var f = this.files[0];
  this.value = '';
  if(f) onBgPicked(f);
});

/* 进度条拖动 */
(function(){
  var bar = document.getElementById('progress-bar');
  if(!bar) return;
  var dragging = false;
  function setProgress(clientX){
    if(!audio || !audio.duration) return;
    var rect = bar.getBoundingClientRect();
    var pct = Math.max(0, Math.min(1, (clientX-rect.left)/rect.width));
    var pf=$('#progress-fill'); if(pf) pf.style.width = (pct*100)+'%';
    var tc=$('#time-cur'); if(tc) tc.textContent = fmtTime(audio.duration*pct);
  }
  function start(e){
    dragging = true;
    var t = e.touches ? e.touches[0] : e;
    setProgress(t.clientX);
  }
  function move(e){
    if(!dragging) return;
    e.preventDefault();
    var t = e.touches ? e.touches[0] : e;
    setProgress(t.clientX);
  }
  function end(e){
    if(!dragging) return;
    dragging = false;
    var t = e.changedTouches ? e.changedTouches[0] : e;
    if(!audio || !audio.duration) return;
    var rect = bar.getBoundingClientRect();
    var pct = Math.max(0, Math.min(1, (t.clientX-rect.left)/rect.width));
    audio.currentTime = audio.duration * pct;
  }
  bar.addEventListener('mousedown', start);
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', end);
  bar.addEventListener('touchstart', start, {passive:false});
  document.addEventListener('touchmove', move, {passive:false});
  document.addEventListener('touchend', end);
})();

document.getElementById('volume-slider').addEventListener('input', function(){
  if(audio) audio.volume = parseFloat(this.value);
});

function init(){
  DEVICE_ID = getDeviceId();
  loadLocal();
  if(!DB) DB = newEmpty();
  migrate();
  ensureAudio();
  applyTheme(curTheme);
  applyBg();
  var mb=$('#btn-mode'); if(mb) mb.textContent = ({order:'顺序',shuffle:'随机',single:'单曲'})[playMode] || '顺序';
  switchPage('now');
  setTimeout(updateCacheHint, 1000);
  setTimeout(updateMini, 100);
}
init();
})();