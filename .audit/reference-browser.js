(async () => {
  const {mountMorph,unmountMorph}=await import('/@fs/Users/msaug/workspace/morph/packages/morph/dist/widget.js?references-after');
  unmountMorph();localStorage.clear();sessionStorage.clear();
  let target=document.createElement('section');target.id='reference-probe';target.textContent='Measurement probe';target.style.cssText='position:fixed;left:80px;top:90px;width:160px;height:80px;padding:16px;background:#eee;color:#111;z-index:9999';document.body.append(target);
  const thread='00000000-0000-4000-8000-000000000001';
  let id=thread;
  const rect=target.getBoundingClientRect();localStorage.setItem('morph:pins',JSON.stringify({[thread]:{n:1,name:'Probe',words:'Calmer',file:'probe.tsx',at:[{x:rect.x+rect.width/2,y:rect.y+rect.height/2}]}}));
  let observation=0, place={kind:'original'}, polls=0;
  const transport=async ({op})=> {
    if(op==='page'){polls++;return {status:200,body:{observation:++observation,sessions:[{id,thread,words:'Calmer',targets:[{source:{path:'app/probe.tsx',line:1,col:1},owner:['Probe'],text:''}],trail:[],kind:'active',place,variants:[],drift:[]}],stuck:[]}};}
    if(op==='plumbing')return {status:200,body:{plumbing:[]}};
    return {status:503,body:null};
  };
  const checks=[];
  const assert=(ok,text)=>{if(!ok)throw Error(text);checks.push(text);};
  const wait=async f=>{let end=Date.now()+7000;while(!f()){if(Date.now()>end)throw Error('Timed out');await new Promise(r=>setTimeout(r,20));}};
  const shadow=()=>document.querySelector('morph-root')?.shadowRoot;
  const comparison=()=>shadow()?.querySelector('[aria-label^="Reference comparison"]');
  const clickText=text=>{const b=[...shadow().querySelectorAll('button')].find(b=>b.textContent.includes(text));if(!b)throw Error('Missing '+text);b.click();};
  const open=async()=>{
    mountMorph(transport);
    await wait(()=>shadow()?.querySelector('[aria-label^="Open Morph"]'));shadow().querySelector('[aria-label^="Open Morph"]').click();
    await wait(()=>[...shadow().querySelectorAll('button')].some(b=>b.textContent.includes('Probe')));
    clickText('Probe');clickText('Inspect');
    await wait(()=>comparison());
  };
  await open();
  assert(comparison().textContent.includes('No saved reference'), 'Reload hints do not invent a reference');
  clickText('Save current as reference');
  await wait(()=>comparison()?.textContent.includes('Saved by you'));
  assert(comparison().textContent.includes('No measured differences'), 'Explicit capture measures the visible 16px element');
  target.style.padding='40px';place={kind:'shown',variant:'v1',edited:false};let before=polls;await wait(()=>polls>before);
  await wait(()=>comparison()?.querySelector('s')?.textContent==='16');
  assert(comparison().textContent.includes('40'), 'Comparison displays the measured 16px to 40px change');
  place={kind:'original'};before=polls;await wait(()=>polls>=before+3);
  assert(comparison().querySelector('s')?.textContent==='16','Repeated original-placement polls cannot overwrite the saved reference');
  assert(!comparison().textContent.includes('Variant A')&&!comparison().textContent.includes('vs original'),'Measurements do not claim a rendered source revision');
  id='00000000-0000-4000-8000-000000000002';before=polls;await wait(()=>polls>before);
  assert(comparison().querySelector('s')?.textContent==='16','A competing refinement preserves the same reference');
  unmountMorph();
  const replacement=target.cloneNode(true);target.replaceWith(replacement);target=replacement;
  await open();
  assert(comparison().textContent.includes('saved target position'),'Replacement after remount is identified as a spatial match');
  assert(comparison().querySelector('s')?.textContent==='16','Saved measurements survive reload and target replacement');
  clickText('Save current as reference');
  await wait(()=>comparison()?.textContent.includes('No measured differences'));
  target.style.padding='48px';before=polls;await wait(()=>polls>before);
  await wait(()=>comparison()?.querySelector('s')?.textContent==='40');
  assert(comparison().textContent.includes('48'),'Recapture establishes the visible replacement as the new reference');
  unmountMorph();target.remove();
  return {passed:checks.length,checks};
})()
