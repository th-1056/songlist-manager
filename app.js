'use strict';
const C=window.SonglistCore, $=id=>document.getElementById(id);
const state={data:null,original:null,history:[],selected:new Set(),active:null,mode:'full',dirty:false,draft:false,files:[],busy:false};
const stamp=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${String(d.getMilliseconds()).padStart(3,'0')}`;};
function log(text,type='info'){const p=document.createElement('p');p.className='log-entry '+type;p.textContent=text;$('log').append(p);p.scrollIntoView({block:'nearest'});}
function report(error){const text=C.formatError(error);log(text,'error');$('error-report').textContent=text;$('copy-state').textContent='';if(!$('error-dialog').open)$('error-dialog').showModal();}
function download(bytes,name,type='application/octet-stream'){const url=URL.createObjectURL(new Blob([bytes],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function remember(){state.history.push(C.clone(state.data));if(state.history.length>30)state.history.shift();state.dirty=true;}
function confirmDraft(){return !state.draft||confirm('JSON 编辑区有尚未应用的修改。继续会放弃这些修改，是否继续？');}
function editor(mode='full',index=null){state.mode=mode;state.active=index;state.draft=false;$('editor').value=state.data?JSON.stringify(mode==='song'?state.data.songs[index]:state.data,null,2):'';$('editor').disabled=!state.original;$('apply').disabled=!state.original;$('editor-label').textContent=mode==='song'?`编辑第 ${index+1} 首 · ${state.data.songs[index].id||'无 ID'}。应用后更新当前表。`:'编辑完整曲目表。支持在这里修正导入文件的 JSON 错误。';$('draft-label').textContent='修改后点击应用';renderControls();}
function renderControls(){for(const id of ['load-child','check','export','edit-full','resources'])$(id).disabled=!state.data||state.busy;$('load-main').disabled=state.busy;$('download-original').disabled=!state.original;$('apply').disabled=!state.original||state.busy;$('editor').disabled=!state.original||state.busy;$('undo').disabled=!state.history.length||state.busy;$('delete').disabled=!state.selected.size||state.busy;$('file-name').textContent=state.original?.name||'尚未导入';$('song-count').textContent=state.data?state.data.songs.length:'—';$('edit-state').textContent=state.draft?'编辑区尚未应用':state.dirty?'有修改待下载':state.data?'已导入':'等待导入';}
function render(){
  renderControls();const q=$('search').value.toLowerCase(),tbody=$('songs');tbody.replaceChildren();const visible=[];
  $('empty').hidden=!!state.original;$('table-wrap').hidden=!state.data;
  if(state.data)state.data.songs.forEach((s,index)=>{
    const title=C.object(s.title_localized)?s.title_localized.en||'未填写曲名':'未填写曲名';
    const artist=typeof s.artist==='string'?s.artist:C.object(s.artist_localized)?s.artist_localized.en||'':'';
    if(!`${s.id||''} ${title} ${artist}`.toLowerCase().includes(q))return;visible.push(index);
    const tr=document.createElement('tr');if(state.active===index&&state.mode==='song')tr.className='active';
    const selectCell=document.createElement('td'),cb=document.createElement('input');cb.type='checkbox';cb.checked=state.selected.has(index);cb.setAttribute('aria-label',`选择 ${title}`);cb.addEventListener('change',()=>{if(cb.checked)state.selected.add(index);else state.selected.delete(index);render();});selectCell.append(cb);
    const nameCell=document.createElement('td'),titleButton=document.createElement('button');titleButton.className='song-title';titleButton.textContent=title;titleButton.addEventListener('click',()=>{if(confirmDraft()){editor('song',index);render();}});
    const id=document.createElement('span');id.className='song-id';id.textContent=s.id||'缺少 ID';nameCell.append(titleButton,id);
    const artistCell=document.createElement('td');artistCell.textContent=artist;
    const difficultyCell=document.createElement('td');if(Array.isArray(s.difficulties))for(const d of s.difficulties){if(!C.object(d))continue;const badge=document.createElement('span');badge.className='difficulty';badge.textContent=`${['PST','PRS','FTR','BYD','ETR'][d.ratingClass]||'?'} ${d.rating??'?'}${d.ratingPlus===true?'+':''}`;difficultyCell.append(badge);}
    tr.append(selectCell,nameCell,artistCell,difficultyCell);tbody.append(tr);
  });
  $('visible-count').textContent=state.data?`${visible.length} 首`:'';
  $('select-all').checked=!!visible.length&&visible.every(i=>state.selected.has(i));$('select-all').indeterminate=visible.some(i=>state.selected.has(i))&&!$('select-all').checked;
  $('select-all').onchange=()=>{for(const i of visible){if($('select-all').checked)state.selected.add(i);else state.selected.delete(i);}render();};
}
function decode(buffer){const bytes=new Uint8Array(buffer);let encoding='utf-8';if(bytes[0]===255&&bytes[1]===254)encoding='utf-16le';if(bytes[0]===254&&bytes[1]===255)encoding='utf-16be';try{return new TextDecoder(encoding,{fatal:true}).decode(buffer);}catch{try{return new TextDecoder('gb18030',{fatal:true}).decode(buffer);}catch{throw new Error('无法识别文件编码，请使用 UTF-8。');}}}
async function fileText(file){if(file.size>20*1024*1024)throw new Error(`${file.name} 超过 20 MB，请检查是否选中了音频或压缩包。`);return decode(await file.arrayBuffer());}
function checkCurrent(){const issues=[...C.validate(state.data),...(state.files.length?C.resourceCheck(state.data,state.files):[])];const errors=issues.filter(i=>i.level==='error').length;$('issue-count').textContent=`${errors} 错误 / ${issues.length-errors} 提醒`;log(`检查完成：${errors} 个错误，${issues.length-errors} 个提醒。`,errors?'error':'success');for(const i of issues){const where=i.index===null?'顶层':`第 ${i.index+1} 首 / ${state.data.songs[i.index]?.id||'无 ID'}`;log(`[${i.level==='error'?'错误':'提醒'}] ${where} · ${i.field}：${i.message}`,i.level==='error'?'error':'warning');}return issues;}
function applyDraft(){try{if(state.mode==='song'){const song=C.strictJSON($('editor').value,'JSON 编辑区 / 当前曲目');if(!C.object(song))throw new Error('曲目应是一个 JSON 对象。');remember();state.data.songs[state.active]=song;}else{const {data}=C.parseSonglist($('editor').value,false,'JSON 编辑区 / 完整曲目表');remember();state.data=data;state.selected.clear();}const mode=state.mode,index=state.active;editor(mode,index);render();log('编辑内容已应用。','success');checkCurrent();return true;}catch(e){report(e);return false;}}
function ensureApplied(){if(!state.draft)return true;if(!confirm('先应用 JSON 编辑区的修改，再执行此操作？'))return false;return applyDraft();}
async function loadMain(file){
  if(!file)return;if((state.dirty||state.draft)&&!confirm('当前内容有修改。导入新的主表会开启新会话，请先下载需要保留的结果。继续吗？'))return;
  state.busy=true;renderControls();
  try{
    const text=await fileText(file);state.original=file;state.data=null;state.history=[];state.selected.clear();state.dirty=false;state.draft=false;state.files=[];$('resource-status').textContent='选择项目资源文件夹，可进一步检查曲目目录、音频、封面、AFF 和背景是否存在。';$('issue-count').textContent='等待检查';
    try{state.data=C.parseSonglist(text,false,file.name).data;editor();log(`已导入 ${file.name}，共 ${state.data.songs.length} 首。初始文件可随时下载。`,'success');}
    catch(e){state.mode='full';state.active=null;$('editor').disabled=false;$('apply').disabled=false;$('editor').value=text;$('editor-label').textContent='导入文件存在问题。请在这里修改完整 JSON，再点击应用并检查。';$('draft-label').textContent='修正后点击应用';state.draft=true;report(e);}
    render();
  }catch(e){report(e);}finally{state.busy=false;renderControls();}
}
$('load-main').onclick=()=>$('main-file').click();$('main-file').onchange=async e=>{await loadMain(e.target.files[0]);e.target.value='';};
$('download-original').onclick=()=>download(state.original,state.original.name);
$('load-child').onclick=()=>{if(ensureApplied())$('child-files').click();};
$('child-files').onchange=async e=>{
  if(!state.data)return;state.busy=true;renderControls();
  try{for(const file of e.target.files){try{const {data,notes}=C.parseSonglist(await fileText(file),true,file.name);const result=C.merge(state.data,data);if(result.added){remember();state.data=result.data;}log(`${file.name}：追加 ${result.added} 首，跳过 ${result.skipped.length} 个重复 ID。`,'success');if(result.skipped.length)log('重复 ID：'+result.skipped.join('、'),'warning');for(const note of notes)log(note);state.selected.clear();editor();render();$('issue-count').textContent='等待检查';}catch(error){report(error);break;}}}finally{e.target.value='';state.busy=false;renderControls();}
};
$('search').oninput=render;$('editor').oninput=()=>{state.draft=true;$('draft-label').textContent='有尚未应用的修改';renderControls();};
$('edit-full').onclick=()=>{if(confirmDraft()){editor();render();}};$('apply').onclick=applyDraft;
$('delete').onclick=()=>{if(!ensureApplied()||!state.selected.size)return;if(!confirm(`从当前表删除所选 ${state.selected.size} 首曲目？可通过撤销恢复。`))return;remember();const count=state.selected.size;state.data.songs=state.data.songs.filter((_,i)=>!state.selected.has(i));state.selected.clear();editor();render();$('issue-count').textContent='等待检查';log(`已删除 ${count} 首。`);};
$('undo').onclick=()=>{if(!confirmDraft()||!state.history.length)return;state.data=state.history.pop();state.selected.clear();state.dirty=true;editor();render();$('issue-count').textContent='等待检查';log('已撤销上一次曲目表操作。');};
$('check').onclick=()=>{if(ensureApplied()&&state.data)checkCurrent();};
$('export').onclick=()=>{if(!ensureApplied()||!state.data)return;const issues=checkCurrent();if(issues.some(i=>i.level==='error')){log('导出已暂停，请修正上方错误后重试。','error');return;}download(JSON.stringify(state.data,null,2)+'\n',`主songlist${stamp()}导出版`);state.dirty=false;renderControls();log('已请求下载修改版。使用时请将文件名改为 songlist。','success');};
$('resources').onclick=()=>$('resource-files').click();$('resource-files').onchange=e=>{state.files=Array.from(e.target.files);$('resource-status').textContent=`已选择 ${state.files.length} 个资源文件；检查仅核对路径与空文件，音频时长及 AFF 语法需另行确认。`;e.target.value='';if(state.data)checkCurrent();};
$('clear-log').onclick=()=>$('log').replaceChildren();$('close-error').onclick=()=>$('error-dialog').close();
$('copy-error').onclick=async()=>{try{await navigator.clipboard.writeText($('error-report').textContent);$('copy-state').textContent='已复制';}catch{$('copy-state').textContent='可选中提示文字后手动复制';}};
$('try-demo').onclick=()=>{const song={id:'sample_song',title_localized:{en:'Example / 示例曲目'},artist:'Sample Artist',bpm:'160',bpm_base:160,set:'base',purchase:'',audioPreview:0,audioPreviewEnd:15000,side:1,bg:'vs_conflict',date:1700000000,version:'1.0',difficulties:[{ratingClass:3,rating:12,ratingPlus:true,chartDesigner:'Sample',jacketDesigner:''}]};loadMain(new File([JSON.stringify({songs:[song]},null,2)+'\n'],'示例songlist'));};
window.addEventListener('beforeunload',e=>{if(state.dirty||state.draft){e.preventDefault();e.returnValue='';}});
render();
