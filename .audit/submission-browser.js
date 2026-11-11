(async () => {
  const { mountMorph, unmountMorph } = await import('/@fs/Users/msaug/workspace/morph/packages/morph/dist/widget.js?submission-check');
  unmountMorph();
  localStorage.clear();
  sessionStorage.clear();
  const thread = '00000000-0000-4000-8000-000000000001';
  const next = '00000000-0000-4000-8000-000000000002';
  const command = { op: 'refine', request: { from: thread, variant: 'v1', ask: { id: next, words: 'More space', targets: [{ source: { path: 'app/hero.tsx', line: 1, col: 1 }, owner: ['Hero'], text: '' }], marks: [], count: 3 } } };
  const metadata = { n: 1, name: 'Hero', words: 'Calmer', file: 'hero.tsx', at: [{x: 200, y: 300}] };
  sessionStorage.setItem('morph:submission:' + thread, JSON.stringify({thread, metadata, command}));
  let observation = 0;
  const requests = [];
  const transport = async ({op, body}) => {
    if (op === 'page') return { status: 200, body: { observation: ++observation, sessions: [], stuck: [] } };
    if (op === 'refine') {
      requests.push(body);
      return requests.length === 1 ? {status: 503, body: null} : { status: 200, body: { observation: ++observation, sessions: [], stuck: [] } };
    }
    if (op === 'plumbing') return {status: 200, body: {plumbing: []}};
    if (op === 'tokens') return {status: 200, body: {tokens: []}};
    return {status: 503, body: null};
  };
  const checks = [];
  const assert = (ok, text) => { if (!ok) throw new Error(text); checks.push(text); };
  const wait = async (predicate) => {
    const until = Date.now() + 5000;
    while (!predicate()) {
      if (Date.now() > until) throw new Error('Timed out waiting for rendered state');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  const shadow = () => document.querySelector('morph-root')?.shadowRoot;
  const button = (text) => [...(shadow()?.querySelectorAll('button') ?? [])].find(b => b.textContent.trim() === text);
  const openCard = async () => {
    await wait(() => shadow()?.querySelector('[aria-label="Open Morph (Alt+Shift+R)"]'));
    shadow().querySelector('[aria-label="Open Morph (Alt+Shift+R)"]').click();
    await wait(() => [...(shadow()?.querySelectorAll("button") ?? [])].some(b => b.textContent.includes("Herounconfirmed")));
    [...shadow().querySelectorAll("button")].find(b => b.textContent.includes("Herounconfirmed")).click();
    await wait(() => button('Retry request'));
  };
  mountMorph(transport);
  await openCard();
  assert(!!button('Retry request'), 'Reload exposes the exact unresolved request');
  assert(shadow().textContent.includes('More space'), 'Pending refinement words survive reload');
  assert(!shadow().querySelector('[aria-label="Refine"]') || shadow().querySelector('[aria-label="Refine"]').disabled, 'Refinement controls cannot submit over an unresolved request');
  button('Retry request').click();
  await wait(() => requests.length === 1 && button('Retry request'));
  assert(JSON.stringify(requests[0]) === JSON.stringify(command.request), 'Retry sends the original immutable command');
  assert(sessionStorage.getItem('morph:submission:' + thread) !== null, 'Lost response preserves recovery data');
  unmountMorph();
  mountMorph(transport);
  await openCard();
  assert(!!button('Retry request'), 'Remount retains uncertain request');
  button('Retry request').click();
  await wait(() => requests.length === 2 && !shadow()?.textContent.includes("More space"));
  assert(JSON.stringify(requests[1]) === JSON.stringify(command.request), 'Second recovery uses the same request ID and payload');
  assert(sessionStorage.getItem('morph:submission:' + thread) === null, 'Closed-round acknowledgement clears journal');
  assert(!shadow().textContent.includes('More space'), 'Closed acknowledgement removes pending card');
  unmountMorph();
  return {passed: checks.length, checks};
})()
