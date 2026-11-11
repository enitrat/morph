(async () => {
  const base='/@fs/Users/msaug/workspace/morph/packages/morph/src/core/';
  const [{buildTokens,resolve},{themeModelOf},{ThemeName},{prepareTokenEdits}]=await Promise.all([import(base+'graph.ts'),import(base+'design-system.ts'),import(base+'config.ts'),import(base+'edit.ts')]);
  const light=ThemeName.parse('light'),dark=ThemeName.parse('dark');
  const themes=themeModelOf({shared:[':root'],list:[{name:light,selectors:['.light']},{name:dark,selectors:['.dark'],fallback:light}]});
  const frame=document.createElement('iframe');document.body.append(frame);
  const doc=frame.contentDocument;doc.documentElement.className='light';
  const style=doc.createElement('style');doc.head.append(style);
  const original=doc.createElement('div'),resolved=doc.createElement('div');doc.body.append(original,resolved);
  const checks=[];
  const assert=(ok,text)=>{if(!ok)throw Error(text);checks.push(text);};
  const load=css=>{style.textContent=css;return buildTokens([{path:'tokens.css',css,tier:'semantic',owned:true}],themes);};
  const compare=(tokens,value,theme,property,label)=>{
    original.style.setProperty(property,value);resolved.style.setProperty(property,resolve(tokens,value,theme));
    const expected=frame.contentWindow.getComputedStyle(original).getPropertyValue(property),actual=frame.contentWindow.getComputedStyle(resolved).getPropertyValue(property);
    assert(actual===expected,label+': '+actual+' = '+expected);
  };
  let tokens=load(':root {--a:var(--b);--b:var(--a);--p:green;--self:var(--p,var(--self));--outside:var(--missing);--initial:INITIAL;}');
  compare(tokens,'var(--a, rgb(255 0 0))',light,'color','Mutual cycle recovers through nested function fallback');
  compare(tokens,'var(--self, blue)',light,'color','Unused fallback does not introduce a cycle');
  compare(tokens,'var(--outside, red)',light,'color','An unknown dependency retains the outer fallback');
  compare(tokens,'var(--initial, blue)',light,'color','Case-insensitive initial value uses fallback');
  tokens=load(':root {--a:var(--b,blue);--b:var(--c,blue);--c:var(--d,var(--a));--d:var(--c,red);}');
  compare(tokens,'var(--a,purple)',light,'color','Cyclic replacements unwind before upstream fallback recovery');
  tokens=load(':root {--number:1;--dimension:var(--number)px;}');
  compare(tokens,'var(--dimension)',light,'width','Substitution preserves separate number and identifier tokens');
  tokens=load(':root {--p:16px;--q:40px} .light {--role:var(--p)} .dark {color:blue}');
  compare(tokens,'var(--role)',light,'padding-left','Original theme measurement');
  const result=prepareTokenEdits(tokens,[{token:'--role',scope:light,to:'var(--q)'}]);
  assert(result.ok,'Scoped edit prepares successfully');
  style.textContent=result.files.get('tokens.css');
  compare(result.tokens,'var(--role)',light,'padding-left','Written source matches prepared light graph');
  assert(frame.contentWindow.getComputedStyle(original).paddingLeft==='40px','Light theme changes to 40px');
  doc.documentElement.className='dark';
  compare(result.tokens,'var(--role)',dark,'padding-left','Inserted pin matches prepared dark graph');
  assert(frame.contentWindow.getComputedStyle(original).paddingLeft==='16px','Inherited dark theme remains 16px');
  frame.remove();return {passed:checks.length,checks};
})()
