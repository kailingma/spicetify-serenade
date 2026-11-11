// Drive the Spotify client over the Chrome DevTools Protocol.
// Start Spotify with:  spotify --remote-debugging-port=9229
// Usage (Node 22+, no dependencies):
//   node tools/cdp.mjs eval "<js expression>"        run JS in the xpui page, print result
//   node tools/cdp.mjs evalfile path/to/script.js     same, from a file
//   node tools/cdp.mjs shot out.png [x,y,w,h]          screenshot (optional clip in CSS px)
//   node tools/cdp.mjs mouse x,y                       move the mouse (hover), CSS px
//   node tools/cdp.mjs click x,y                       left click, CSS px
const [,, mode, arg] = process.argv;
const list = await (await fetch('http://localhost:9229/json')).json();
const page = list.find(p => p.type === 'page' && p.url.includes('xpui'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = {};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) pending[m.id](m); };
await new Promise(r => ws.onopen = r);
if (mode === 'evalfile') {
  const code = (await import('fs')).readFileSync(arg, 'utf8');
  const r = await send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true });
  const v = r.result?.result?.value; console.log(typeof v === 'string' ? v : JSON.stringify(r.result, null, 1).slice(0, 3000));
} else if (mode === 'eval') {
  const r = await send('Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true });
  const v = r.result?.result?.value; console.log(typeof v === 'string' ? v : JSON.stringify(v ?? r.result, null, 1));
} else if (mode === 'mouse') {
  const [x, y] = arg.split(',').map(Number);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); console.log('moved');
} else if (mode === 'click') {
  const [x, y] = arg.split(',').map(Number);
  for (const type of ['mouseMoved','mousePressed','mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  console.log('clicked');
} else if (mode === 'shot') {
  const clip = process.argv[4] ? (([x,y,width,height]) => ({x,y,width,height,scale:1}))(process.argv[4].split(',').map(Number)) : undefined;
  const r = await send('Page.captureScreenshot', clip ? { format: 'png', clip, captureBeyondViewport: true } : { format: 'png' });
  (await import('fs')).writeFileSync(arg, Buffer.from(r.result.data, 'base64')); console.log('saved', arg);
}
ws.close(); process.exit(0);
