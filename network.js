'use strict';
(function(root){
  async function read(path,{cache,attempts=3,timeout=45000,delay=700}={}){
    if(cache){try{const hit=await cache.match(path);if(hit)return await hit.arrayBuffer();}catch{}}
    for(let attempt=0;attempt<attempts;attempt++){
      const controller=new AbortController();let timer;
      const resetTimer=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(),timeout);};resetTimer();
      let permanent=false;
      try{
        const response=await fetch(path,{credentials:'same-origin',cache:cache?'default':'no-store',signal:controller.signal});
        if(!response.ok){permanent=response.status>=400&&response.status<500&&response.status!==408&&response.status!==429;throw new Error('network');}
        let buffer;
        if(response.body?.getReader){
          const reader=response.body.getReader(),chunks=[];let length=0;
          for(;;){resetTimer();const {value,done}=await reader.read();if(done)break;chunks.push(value);length+=value.byteLength;}
          const merged=new Uint8Array(length);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength;}buffer=merged.buffer;
        }else buffer=await response.arrayBuffer();
        clearTimeout(timer);
        if(cache)try{await cache.put(path,new Response(buffer,{headers:{'Content-Type':'application/octet-stream'}}));}catch{}
        return buffer;
      }catch(error){if(permanent||attempt===attempts-1)throw new Error('network');}
      finally{clearTimeout(timer);}
      await new Promise(resolve=>setTimeout(resolve,delay*(attempt+1)));
    }
  }
  async function mapLimit(items,limit,worker){
    const result=new Array(items.length);let next=0,failed=false;
    await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
      while(next<items.length&&!failed){const index=next++;try{result[index]=await worker(items[index],index);}catch(error){failed=true;throw error;}}
    }));return result;
  }
  const api={read,mapLimit};if(typeof module==='object'&&module.exports)module.exports=api;else root.LIFE_NETWORK=api;
})(globalThis);
