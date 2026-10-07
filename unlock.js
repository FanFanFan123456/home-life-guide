'use strict';
(() => {
  const encoder=new TextEncoder(),decoder=new TextDecoder();
  const bytes=base64=>Uint8Array.from(atob(base64),character=>character.charCodeAt(0));
  const form=document.querySelector('#unlock-form'),input=document.querySelector('#passphrase'),status=document.querySelector('#unlock-status'),button=document.querySelector('#unlock-button');
  document.querySelector('#show-password').addEventListener('click',event=>{const show=input.type==='password';input.type=show?'text':'password';event.currentTarget.textContent=show?'隐藏':'显示';event.currentTarget.setAttribute('aria-pressed',String(show));});
  const network=window.LIFE_NETWORK;let cipherCache;
  async function read(path,json=false){const buffer=await network.read(path,{cache:path.startsWith('sealed/')?cipherCache:undefined});return json?JSON.parse(decoder.decode(buffer)):buffer;}
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(button.disabled)return;
    button.disabled=true;status.textContent='正在解锁，请稍候…';
    if(!crypto.subtle){status.textContent='此浏览器暂不支持安全解锁，请在手机系统浏览器中打开。';button.disabled=false;return;}
    let payload,key;
    try{
      const header=await read('vault.json',true);
      const base=await crypto.subtle.importKey('raw',encoder.encode(input.value.normalize('NFC')),'PBKDF2',false,['deriveKey']);
      key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:bytes(header.salt),iterations:header.iterations},base,{name:'AES-GCM',length:256},false,['decrypt']);
      const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(header.iv),additionalData:encoder.encode('life-guide:v1:manifest')},key,await read('vault.bin'));
      payload=JSON.parse(decoder.decode(plain));
    }catch(error){status.textContent=error.message==='network'?'暂时无法读取指南，请检查网络后重试。':'口令不正确，请重新输入。';input.value='';input.focus();button.disabled=false;return;}
    input.value='';
    try{const cacheName='life-guide-cipher-v1';cipherCache=await caches.open(cacheName);}catch{}
    const urls=new Map(),pending=new Map();
    async function media(path,onProgress){
      if(urls.has(path))return urls.get(path);if(pending.has(path))return pending.get(path);
      const job=(async()=>{
        const item=payload.assets[path];if(!item)throw new Error('素材不存在');const parts=[];
        if(item.inline)parts.push(bytes(item.inline));
        else if(item.chunks){let completed=0;parts.push(...await network.mapLimit(item.chunks,3,async(chunk,i)=>{const part=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(chunk.iv),additionalData:encoder.encode('life-guide:v1:asset:'+path+':chunk:'+i)},key,await read(chunk.file));if(onProgress)onProgress(++completed,item.chunks.length);return part;}));}
        else parts.push(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(item.iv),additionalData:encoder.encode('life-guide:v1:asset:'+path)},key,await read(item.file)));
        const blob=new Blob(parts,{type:item.mime});if(item.size!==undefined&&blob.size!==item.size)throw new Error('素材长度不完整');const url=URL.createObjectURL(blob);urls.set(path,url);return url;
      })().finally(()=>pending.delete(path));pending.set(path,job);return job;
    }
    try{await Promise.all(Object.keys(payload.assets).filter(path=>path.startsWith('qr/')).map(path=>media(path)));}
    catch{status.textContent='二维码素材读取失败，请检查网络后重试。';button.disabled=false;return;}
    window.LIFE_GUIDE=payload.data;window.LIFE_VAULT=true;window.LIFE_ASSET_URL=path=>urls.get(path)||path;
    const style=document.createElement('link');style.rel='stylesheet';style.href='styles.css';document.head.append(style);
    document.querySelector('link[href="unlock.css"]').remove();
    function loadOne(element,onProgress){return media(element.dataset.vaultPath,onProgress).then(url=>{element.src=url;if(element.tagName==='VIDEO')element.load();});}
    function loadImage(element){
      const retry=document.createElement('button');retry.className='button secondary';retry.textContent='图片加载中…';retry.disabled=true;element.after(retry);
      const start=async()=>{retry.disabled=true;retry.textContent='图片加载中…';try{await loadOne(element);retry.remove();}catch{retry.disabled=false;retry.textContent='图片未加载，点此重试';}};retry.addEventListener('click',start);start();
    }
    const imageObserver=window.IntersectionObserver?new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){imageObserver.unobserve(entry.target);loadImage(entry.target);}}),{rootMargin:'200px'}):null;
    function loadMedia(){document.querySelectorAll('[data-vault-path]').forEach(element=>{
      if(element.dataset.loading)return;element.dataset.loading='1';
      if(element.tagName==='VIDEO'){
        const note=document.createElement('p');note.textContent='视频加载中…';note.setAttribute('role','status');element.before(note);
        const retry=document.createElement('button');retry.textContent='重试加载视频';retry.className='button secondary';retry.hidden=true;element.before(retry);
        const start=async()=>{retry.hidden=true;retry.disabled=true;note.textContent='视频加载中…';element.preload='metadata';try{await loadOne(element,(current,total)=>{note.textContent=`视频加载中 ${current}/${total}…`;});note.remove();retry.remove();}catch{note.textContent='视频暂时未能加载，请检查网络或点重试。';retry.hidden=false;retry.disabled=false;}};
        retry.addEventListener('click',start);start();
      }else if(imageObserver)imageObserver.observe(element);else loadImage(element);
    });}
    const observer=new MutationObserver(loadMedia);observer.observe(document.body,{childList:true,subtree:true});
    document.body.innerHTML=payload.body;
    const lock=document.createElement('button');lock.textContent='锁定';lock.className='button secondary';lock.style.padding='7px 12px';lock.style.minHeight='36px';lock.addEventListener('click',()=>{observer.disconnect();imageObserver?.disconnect();for(const url of urls.values())URL.revokeObjectURL(url);location.reload();});document.querySelector('.header-right')?.append(lock);
    const script=document.createElement('script');script.src=URL.createObjectURL(new Blob([payload.app],{type:'text/javascript'}));script.addEventListener('load',()=>URL.revokeObjectURL(script.src),{once:true});document.body.append(script);loadMedia();
  });
})();
