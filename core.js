(function (root) {
  'use strict';
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const clone = x => JSON.parse(JSON.stringify(x));
  class JsonProblem extends Error {
    constructor(text, pos, reason, suggestion, source) {
      super(reason); this.name = 'JsonProblem'; this.text = text; this.pos = pos;
      this.reason = reason; this.suggestion = suggestion; this.source = source;
      const prefix = text.slice(0, pos).split('\n');
      this.line = prefix.length; this.column = prefix.at(-1).length + 1;
    }
  }
  // A deterministic parser provides consistent locations across browsers and rejects duplicate keys.
  function strictJSON(text, source = '当前输入') {
    let p = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    const fail = (reason, suggestion, pos = p) => {
      const c = text[pos];
      if (c && '“”‘’'.includes(c)) suggestion += '\n请将字符串界定符换成英文双引号 "。';
      if (c && '，：｛｝［］'.includes(c)) suggestion += '\n请使用英文结构标点 , : { } [ ]。';
      if (text.slice(pos, pos + 2) === '//' || text.slice(pos, pos + 2) === '/*') suggestion += '\nJSON 不支持注释，请移除注释文字。';
      if (pos >= text.length) suggestion += '\n已到达文件末尾，请检查缺少的值、引号或闭合括号。';
      throw new JsonProblem(text, pos, reason, suggestion, source);
    };
    function ws() { while (/[\t\n\r ]/.test(text[p] || '\0')) p++; }
    function string() {
      const start = p++;
      while (p < text.length) {
        const c = text[p++];
        if (c === '"') return JSON.parse(text.slice(start, p));
        if (c.charCodeAt(0) < 32) fail('字符串中含未转义的换行或控制字符。', '字符串内换行写为 \\n，制表符写为 \\t。', p-1);
        if (c === '\\') {
          const esc = text[p++];
          if (esc === 'u') {
            if (!/^[0-9a-fA-F]{4}$/.test(text.slice(p, p+4))) fail('Unicode 转义格式不完整。', '\\u 后需要 4 个十六进制字符，例如 \\u4e2d；也可直接填写中文。', p-2);
            p += 4;
          } else if (!esc || !'"\\/bfnrt'.includes(esc)) fail('字符串中出现非法转义。', 'JSON 支持 \\n、\\t、\\"、\\\\ 等转义。路径可使用 /。', p-2);
        }
      }
      fail('字符串缺少结束双引号。', '补全英文双引号。字符串内的双引号需要写为 \\"。', start);
    }
    function value(depth = 0) {
      ws(); if (depth > 150) fail('JSON 嵌套层级过深。', 'songlist 通常只需数层结构，请检查意外重复的括号。');
      const c = text[p];
      if (c === '"') return string();
      if (c === '{') {
        p++; ws(); const result = {}, keys = new Set();
        if (text[p] === '}') { p++; return result; }
        while (true) {
          ws(); const at = p;
          if (text[p] !== '"') fail('对象字段名缺失或未使用英文双引号。', '例如："id": "example"。检查上一字段后的逗号。');
          const key = string();
          if (keys.has(key)) fail(`字段 "${key}" 重复。`, '同一个对象内每个字段只能出现一次，请保留正确的值并删除重复字段。', at);
          keys.add(key); ws();
          if (text[p] !== ':') fail('字段名后缺少英文冒号。', '例如："id" "example" 改为 "id": "example"。');
          p++; const v = value(depth+1);
          Object.defineProperty(result, key, {value:v, enumerable:true, configurable:true, writable:true});
          ws(); if (text[p] === '}') { p++; return result; }
          if (text[p] !== ',') fail('字段之间缺少逗号，或对象缺少闭合括号。', '检查当前位置和上一字段。字段之间加英文逗号，最后使用 } 闭合。');
          const comma = p++; ws();
          if (text[p] === '}') fail('对象最后一个字段后有多余逗号。', '删除 } 前的逗号，例如 {"id":"x",} 改为 {"id":"x"}。', comma);
        }
      }
      if (c === '[') {
        p++; ws(); const result = [];
        if (text[p] === ']') { p++; return result; }
        while (true) {
          result.push(value(depth+1)); ws();
          if (text[p] === ']') { p++; return result; }
          if (text[p] !== ',') fail('数组项目之间缺少逗号，或数组缺少闭合括号。', '曲目对象之间需要英文逗号，数组最后使用 ] 闭合。');
          const comma = p++; ws();
          if (text[p] === ']') fail('数组最后一个项目后有多余逗号。', '删除 ] 前的逗号，例如 [1,2,] 改为 [1,2]。', comma);
        }
      }
      for (const [word, v] of [['true',true],['false',false],['null',null]]) {
        if (text.startsWith(word, p)) { p += word.length; return v; }
      }
      const match = text.slice(p).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (match) {
        const at = p; p += match[0].length; const n = Number(match[0]);
        if (!Number.isFinite(n) || (Number.isInteger(n) && !Number.isSafeInteger(n))) fail('数值超出浏览器可精确表示的范围。', '检查是否输入了过长的整数；文本标识请使用字符串，避免精度丢失。', at);
        return n;
      }
      fail('当前位置缺少合法的 JSON 值。', '检查空冒号、重复逗号、非法数值。布尔值写为 true/false，空值写为 null。');
    }
    const result = value(); ws();
    if (p < text.length) fail('完整 JSON 后存在额外内容。', '总表保留一个顶层对象：{"songs":[曲目1,曲目2]}。请检查多余对象、逗号或说明文字。');
    return result;
  }
  function formatError(e) {
    if (!(e instanceof JsonProblem)) return e.message || String(e);
    const lines = e.text.split('\n'), rows = [];
    for (let i=Math.max(0,e.line-3); i<Math.min(lines.length,e.line+2); i++) {
      const line = lines[i].replace(/\r$/, ''), offset = i === e.line-1 ? Math.max(0,e.column-81) : 0;
      const prefix = offset ? '…' : '';
      rows.push(`${String(i+1).padStart(5)} | ${prefix}${line.slice(offset,offset+240).replace(/\t/g,'    ')}${line.length>offset+240?'…':''}`);
      if (i === e.line-1) rows.push('      | '+' '.repeat(line.slice(offset,e.column-1).replace(/\t/g,'    ').length+prefix.length)+'^ 检测位置');
    }
    return `JSON 语法错误\n文件：${e.source}\n位置：第 ${e.line} 行，第 ${e.column} 列（从 1 开始）\n\n附近原文：\n${rows.join('\n')}\n\n可能原因：${e.reason}\n修改建议：${e.suggestion}\n\n真正的错误可能位于上一字段或上一行。修正后再次检查，可继续定位后续错误。`;
  }
  function parseSonglist(text, child=false, source='当前输入') {
    const notes = [];
    if (child && /,\s*$/.test(text)) { text = text.replace(/,(\s*)$/, '$1'); notes.push('已去除子表片段的末尾逗号'); }
    let data = strictJSON(text, source);
    if (child && object(data) && typeof data.id === 'string' && !Object.hasOwn(data,'songs')) { data={songs:[data]}; notes.push('已将单曲对象包装为 songs 数组'); }
    if (!object(data) || !Array.isArray(data.songs)) throw new Error('顶层必须是包含 songs 数组的对象。示例：{"songs": [...]}');
    if (data.songs.some(s=>!object(s))) throw new Error('songs 数组中的每一项都应是曲目对象。');
    return {data,notes};
  }
  function merge(data, child) {
    const result=clone(data), ids=new Set(result.songs.filter(s=>typeof s.id==='string').map(s=>s.id.toLowerCase())), skipped=[];
    const added=[];
    for (const song of child.songs) {
      if (typeof song.id !== 'string' || !song.id.trim()) throw new Error('子表存在缺失或空白 id。本次子表未合并。');
      if (ids.has(song.id.toLowerCase())) skipped.push(song.id);
      else { ids.add(song.id.toLowerCase()); added.push(clone(song)); }
    }
    result.songs.push(...added); return {data:result, added:added.length, skipped};
  }
  function validate(data) {
    const issues=[], seen=new Map(), add=(level,index,field,message)=>issues.push({level,index,field,message});
    if (!object(data)||!Array.isArray(data.songs)) return [{level:'error',index:null,field:'songs',message:'顶层缺少 songs 数组'}];
    if (!data.songs.length) add('warning',null,'songs','曲目表为空');
    data.songs.forEach((s,i)=>{
      if (!object(s)) { add('error',i,'','曲目必须是对象'); return; }
      for (const k of ['id','title_localized','bpm','bpm_base','set','side','bg','difficulties']) if (!Object.hasOwn(s,k)) add('error',i,k,`缺少字段 ${k}`);
      if (typeof s.id !== 'string'||!s.id.trim()||/[<>:"/\\|?*\x00-\x1f]/.test(s.id)|| /[. ]$/.test(s.id)||/^\.{1,2}$/.test(s.id)||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(s.id)) add('error',i,'id','id 应为非空、安全的 Windows 文件夹名');
      if (typeof s.id==='string') {
        const key=s.id.toLowerCase(); if(seen.has(key)) add('error',i,'id',`重复 ID；首次出现在第 ${seen.get(key)+1} 首（忽略大小写）`); else seen.set(key,i);
        if(s.id!==s.id.trim()) add('warning',i,'id','id 含首尾空白');
      }
      if (!object(s.title_localized)||typeof s.title_localized.en!=='string'||!s.title_localized.en.trim()) add('error',i,'title_localized.en','需要非空曲名，允许中文及 Unicode 符号');
      else if(Object.values(s.title_localized).some(v=>typeof v!=='string')) add('error',i,'title_localized','本地化曲名应为字符串');
      if(!Object.hasOwn(s,'artist')) add('warning',i,'artist','缺少 artist；请确认 artist_localized 与游戏版本兼容');
      for(const k of ['artist','bpm','set','bg','bg_inverse','purchase','version']) if(Object.hasOwn(s,k)&&typeof s[k]!=='string') add('error',i,k,`${k} 应为字符串`);
      for(const k of ['set','bg','bg_inverse']) if(typeof s[k]==='string'&&!s[k].trim()) add('warning',i,k,`${k} 为空，请确认配置`);
      if(typeof s.bpm_base!=='number'||!Number.isFinite(s.bpm_base)||s.bpm_base<=0) add('warning',i,'bpm_base','bpm_base 应为正数；特殊占位曲目可人工确认');
      if(!Number.isInteger(s.side)||s.side<0||s.side>3) add('error',i,'side','side 应为整数 0~3');
      for(const k of ['audioPreview','audioPreviewEnd','date']) {
        if(!Object.hasOwn(s,k)) add('warning',i,k,`缺少 ${k}`);
        else if(!Number.isSafeInteger(s[k])||s[k]<0) add('error',i,k,`${k} 应为非负整数`);
      }
      if(typeof s.audioPreview==='number'&&typeof s.audioPreviewEnd==='number'&&s.audioPreviewEnd<=s.audioPreview) add('warning',i,'audioPreviewEnd','预览结束时间应大于开始时间，单位为毫秒');
      for(const k of ['remote_dl','world_unlock','ratingPlus']) if(Object.hasOwn(s,k)&&typeof s[k]!=='boolean') add('error',i,k,`${k} 应为 true 或 false`);
      if(!Array.isArray(s.difficulties)||!s.difficulties.length) { add('error',i,'difficulties','difficulties 应为非空数组'); return; }
      const classes=new Set(); s.difficulties.forEach((d,j)=>{
        const field=`difficulties[${j}]`;
        if(!object(d)) { add('error',i,field,'难度项应为对象'); return; }
        if(!Number.isInteger(d.ratingClass)||d.ratingClass<0||d.ratingClass>4) add('error',i,field+'.ratingClass','ratingClass 应为 0~4：PST / PRS / FTR / BYD / ETR');
        else if(classes.has(d.ratingClass)) add('error',i,field+'.ratingClass','ratingClass 重复'); else classes.add(d.ratingClass);
        if(!Number.isInteger(d.rating)) add('error',i,field+'.rating','rating 应为整数，加号通过 ratingPlus 表示');
        else if(d.rating < -1) add('warning',i,field+'.rating','等级小于 -1，请确认特殊占位值');
        for(const k of ['chartDesigner','jacketDesigner']) if(typeof d[k]!=='string') add('error',i,field+'.'+k,`${k} 应为字符串，允许空字符串`);
        for(const k of ['ratingPlus','legacy11']) if(Object.hasOwn(d,k)&&typeof d[k]!=='boolean') add('error',i,field+'.'+k,`${k} 应为 true 或 false`);
      });
    }); return issues;
  }
  function resourceCheck(data, files) {
    const issues=[], paths=new Map();
    for(const f of files) {
      const parts=f.webkitRelativePath.split('/'); parts.shift(); paths.set(parts.join('/'),f);
    }
    const add=(i,k,m)=>issues.push({level:'warning',index:i,field:k,message:m});
    data.songs.forEach((s,i)=>{
      if(typeof s.id!=='string'||/[\/\\]/.test(s.id)) return;
      const options=[`Charts/${s.id}/`,`Documents/songs/${s.id}/`,`${s.id}/`];
      const base=options.find(p=>[...paths.keys()].some(k=>k.startsWith(p)));
      if(!base) add(i,'resources','所选文件夹中未找到曲目目录');
      else {
        for(const name of ['base.ogg','base.jpg','base_256.jpg']) {
          const f=paths.get(base+name); if(!f) add(i,'resources',`缺少 ${name}，请确认难度专用资源`); else if(!f.size) add(i,'resources',`${name} 是空文件`);
        }
        if(Array.isArray(s.difficulties)) for(const d of s.difficulties) if(object(d)&&Number.isInteger(d.ratingClass)&&d.ratingClass>=0&&d.ratingClass<=4&&d.rating>0&&!paths.has(base+d.ratingClass+'.aff')) add(i,'resources',`缺少 ${d.ratingClass}.aff；占位难度请人工确认`);
      }
      for(const k of ['bg','bg_inverse']) if(typeof s[k]==='string'&&s[k].trim()) {
        if(!['.jpg','.png','.jpeg'].some(ext=>paths.has(`Documents/img/bg/1080/${s[k]}${ext}`)||paths.has((base||'')+s[k]+ext))) add(i,k,`所选文件夹中未找到背景 ${s[k]}`);
      }
    }); return issues;
  }
  const api={JsonProblem,strictJSON,parseSonglist,formatError,validate,merge,resourceCheck,clone,object};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.SonglistCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
