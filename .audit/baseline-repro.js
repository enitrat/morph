(async () => {
 const {mountMorph,unmountMorph}=await import('/@fs/Users/msaug/workspace/morph/packages/morph/dist/widget.js?baseline-before');
 unmountMorph();localStorage.clear();sessionStorage.clear();
 const target=document.createElement('section');target.id='baseline-probe';target.textContent='Measurement probe';target.style.cssText='position:fixed;left:80px;top:90px;width:160px;height:80px;padding:16px;background:#eee;color:#111;z-index:9999';document.body.append(target);
 const id='00000000-0000-4000-8000-000000000001';
 const rect=target.getBoundingClientRect();localStorage.setItem('morph:pins',JSON.stringify({[id]:{n:1,name:'Probe',words:'Calmer',file:'probe.tsx',at:[{x:rect.x+rect.width/2,y:rect.y+rect.height/2}]}}));
 let observation=0, place={kind:'original'}, polls=0;
 mountMorph(async ({op})=> {
   if(op==='page'){polls++;return {status:200,body:{observation:++observation,sessions:[{id,thread:id,words:'Calmer',targets:[{source:{path:'app/probe.tsx',line:1,col:1},owner:['Probe'],text:''}],trail:[],kind:'active',place,variants:[],drift:[]}],stuck:[]}};}
   if(op==='plumbing')return {status:200,body:{plumbing:[]}};
   return {status:503,body:null};
 });
 const wait=async f=>{let end=Date.now()+7000;while(!f()){if(Date.now()>end)throw Error('Timed out');await new Promise(r=>setTimeout(r,20));}};
 const shadow=()=>document.querySelector('morph-root')?.shadowRoot;
 const clickText=text=>{const b=[...shadow().querySelectorAll('button')].find(b=>b.textContent.includes(text));if(!b)throw Error('Missing '+text);b.click();};
 await wait(()=>shadow()?.querySelector('[aria-label^="Open Morph"]'));shadow().querySelector('[aria-label^="Open Morph"]').click();
 await wait(()=>polls>=3);clickText('Probe');clickText('Inspect');
 await wait(()=>shadow().querySelector('[aria-label="Inspector"]'));
 target.style.padding='40px';place={kind:'shown',variant:'v1',edited:false};let before=polls;await wait(()=>polls>before);
 const changed=shadow().querySelector('[aria-label="Inspector"]').textContent;
 place={kind:'original'};before=polls;await wait(()=>polls>=before+3);
 place={kind:'shown',variant:'v1',edited:false};before=polls;await wait(()=>polls>before);await new Promise(r=>setTimeout(r,50));
 const after=shadow().querySelector('[aria-label="Inspector"]').textContent;
 if(!changed.includes('16')||!changed.includes('40'))throw Error('Did not establish initial difference');
 if(!after.includes('Nothing measurable changed'))throw Error('Did not reproduce overwritten original');
 unmountMorph();target.remove();
 return {reproduced:true,referencePadding:16,visiblePadding:40,result:'Original polls overwrote the reference with still-visible variant measurements; inspector then claimed no difference.'};
})()
