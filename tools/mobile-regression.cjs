// Local-only photo-flow regression harness. Native pickers and sharing are simulated.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');

function setupFixture() {
  const scenario = new URLSearchParams(location.search).get('case') || 'portrait';
  const qa = window.mobileQA = { scenario, checks: [], shares: [], pickers: [], errors: [], cameraRequests: 0 };
  window.addEventListener('error', event => qa.errors.push(event.message));
  window.addEventListener('unhandledrejection', event => qa.errors.push(String(event.reason)));
  const nativeClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file') { qa.pickers.push(this.id); return; }
    return nativeClick.call(this);
  };
  if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
    configurable: true, value: () => { qa.cameraRequests++; throw new Error('Web camera must not be requested'); },
  });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => scenario !== 'unsupported-share' });
  Object.defineProperty(navigator, 'share', { configurable: true, value: async data => {
    if (scenario === 'cancel-share') throw new DOMException('Cancelled', 'AbortError');
    qa.shares.push(data.files[0]);
  } });
}

async function runFixture() {
  const qa = window.mobileQA;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async predicate => {
    const deadline = performance.now() + 15000;
    while (!predicate()) {
      if (performance.now() > deadline) throw new Error('Photo flow timed out');
      await wait(40);
    }
  };
  const check = (name, pass) => {
    qa.checks.push({ name, pass: Boolean(pass) });
    if (!pass) throw new Error(name);
  };
  const rect = selector => document.querySelector(selector).getBoundingClientRect();
  const select = (input, file) => {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  try {
    mobileEntryCamera.click();
    check('Entry opens system photo picker', qa.pickers.at(-1) === 'cameraFile');
    check('Camera requests photo and rear lens', cameraFile.accept === 'image/*' && cameraFile.getAttribute('capture') === 'environment');
    check('Cancel leaves empty page', !state.source && mobileCapture.state === 'idle');
    if (qa.scenario === 'entry') {
      await document.fonts.ready;
      const brand = rect('.mobile-entry-brand-icon');
      const upload = rect('.mobile-entry-upload-trigger');
      const copy = rect('.mobile-entry-copy');
      check('Entry brand matches 60px design', brand.width === 60 && brand.height === 60 && brand.top === 16);
      check('Upload icon clears entry copy', upload.bottom + 16 <= copy.top);
      check('Entry has no horizontal overflow', document.documentElement.scrollWidth <= innerWidth);
      const toast = document.querySelector('.mobile-entry-toast');
      check('Entry toast above entry screen', Number(getComputedStyle(toast).zIndex) > Number(getComputedStyle(document.querySelector('.mobile-entry-screen')).zIndex));
      return;
    }
    const sizes = { wide: [1000, 300], tall: [300, 1000], square: [512, 512] };
    const [width, height] = sizes[qa.scenario] || [600, 800];
    const source = document.createElement('canvas');
    source.width = width; source.height = height;
    const ctx = source.getContext('2d');
    ctx.fillStyle = '#e3dbcd'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#193d40'; ctx.fillRect(width / 4, height / 5, width / 2, height * .6);
    ctx.fillStyle = '#d35832'; ctx.beginPath(); ctx.arc(width / 2, height / 2, Math.min(width, height) / 6, 0, Math.PI * 2); ctx.fill();
    const blob = await new Promise(resolve => source.toBlob(resolve, 'image/png'));
    const file = new File([blob], 'fixture.png', { type: 'image/png' });
    select(qa.scenario === 'camera' ? cameraFile : mobileGalleryFile, file);
    await until(() => state.source && state.sourceType === 'image');
    await wait(450);
    check('Original photo aspect retained', Math.abs(state.sourceAspect - width / height) < .001);
    check('No web capture session', mobileCapture.state === 'idle' && !app.classList.contains('mobile-camera-session'));
    const before = state.source;
    const recipe = JSON.stringify(state.nodes);
    mobileCameraDockRec.click();
    check('Retake opens system picker', qa.pickers.at(-1) === 'cameraFile');
    check('Cancel preserves image and effects', state.source === before && JSON.stringify(state.nodes) === recipe);
    const preview = rect('.mobile-preview-fixed');
    const controls = rect('.mobile-scroll');
    const dock = rect('.mobile-camera-dock');
    const nice = rect('.mobile-camera-nice');
    const re = rect('[data-mobile-re]');
    qa.layout = { preview: preview.toJSON(), controls: controls.toJSON(), dock: dock.toJSON(), nice: nice.toJSON(), re: re.toJSON() };
    check('Controls 16px below preview', Math.abs(nice.top - preview.bottom - 16) < 1);
    check('Rows separated by 4px', Math.abs(re.top - nice.bottom - 4) < 1);
    check('Controls above dock', re.bottom + 15 <= dock.top);
    check('Dock inside viewport', dock.bottom <= innerHeight + 1);
    check('No horizontal overflow', document.documentElement.scrollWidth <= innerWidth);
    check('Both action columns inside editor', nice.right <= controls.right - 15 && re.right <= controls.right - 15);
    check('Action columns align', Math.abs(nice.left - re.left) < 1 && Math.abs(nice.width - re.width) < 1);
    check('Preset icons 28px', rect('.mobile-preset-icon img').width === 28);
    check('Alpha glyphs 20px', rect('.mobile-alpha-toggle').width === 20);
    check('Colors not manually editable', !mobileColorPanel.querySelector('input'));
    const title = rect('.mobile-editor-preset');
    check('Preset heading top and center match design', title.top === 30 && Math.abs((title.left + title.right) / 2 - (preview.left + preview.right) / 2) < 1);
    check('Preset heading names current effect', mobileEditorPresetName.textContent === presets[state.preset].label && mobileEditorPresetSub.textContent === presets[state.preset].sub);
    const expected = Math.min(Math.max(preview.width, Math.min(576, preview.width / state.sourceAspect)), Math.max(120, innerHeight - dock.height - 156));
    check('Preview height follows aspect and viewport', Math.abs(preview.height - expected) < 1);
    await until(() => mobileImageOutput.blob);
    const oldBlob = mobileImageOutput.blob;
    for (const target of ['fg', 'bg']) {
      const button = () => mobileColorPanel.querySelector(`[data-mobile-alpha="${target}"]`);
      button().click();
      check(`${target} transparency updates swatch`, getMobileColorAlpha(target) === 0 && button().classList.contains('transparent'));
      button().click();
      check(`${target} transparency restores`, getMobileColorAlpha(target) === 100);
    }
    const reverse = state.outputReverse;
    mobileColorPanel.querySelector('[data-mobile-re]').click();
    check('Reverse works', state.outputReverse !== reverse);
    const oldColors = getMobileColor('fg') + getMobileColor('bg');
    mobilePresetGrid.querySelector('.mobile-camera-nice').click();
    check('NICE TRY randomizes colors', getMobileColor('fg') + getMobileColor('bg') !== oldColors);
    check('NICE TRY keeps heading in sync', mobileEditorPresetName.textContent === presets[state.preset].label && mobileEditorPresetSub.textContent === presets[state.preset].sub);
    const currentRecipe = JSON.stringify(state.nodes);
    select(cameraFile, file);
    await until(() => state.source !== before);
    check('Same photo retake preserves effects', JSON.stringify(state.nodes) === currentRecipe);
    const replacement = state.source;
    const video = await loadFile(new File(['bad'], 'clip.mp4', { type: 'video/mp4' }));
    check('Video rejected without losing image', !video.loaded && state.source === replacement);
    const broken = await loadFile(new File(['bad'], 'broken.png', { type: 'image/png' }));
    check('Decode failure preserves image', !broken.loaded && state.source === replacement);
    check('Error toast accessible in editor', !mobileEntryToast.closest('.mobile-entry-screen') && mobileEntryToast.classList.contains('visible'));
    check('No web camera requests', qa.cameraRequests === 0);
    await until(() => mobileImageOutput.blob && mobileImageOutput.blob !== oldBlob);
    await exportOutput();
    if (qa.scenario === 'unsupported-share') check('Share fallback available', Boolean(document.getElementById('mobileOutputPreview')));
    else if (qa.scenario === 'cancel-share') check('Share cancel preserves editor', !document.getElementById('mobileOutputPreview') && state.source === replacement);
    else check('Direct PNG sharing', qa.shares.length === 1 && qa.shares[0].type === 'image/png');
    await wait(2000);
  } catch (error) { qa.failure = error.stack; }
  finally {
    document.documentElement.dataset.qa = JSON.stringify({ checks: qa.checks, failure: qa.failure, done: true, layout: qa.layout, errors: qa.errors });
  }
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.css': 'text/css' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/tools/mobile-qa.html') {
    let html = fs.readFileSync(path.join(root, 'tools/graphic-texture-demo.html'), 'utf8');
    if (url.searchParams.get('safe') === '34') html = html.replaceAll('env(safe-area-inset-bottom)', '34px');
    html = html.replace(/<script\b[^>]*src=[\s\S]*?<\/script>/g, '');
    html = html.replace('<script>', `<script>(${setupFixture})();</script><script>`);
    html = html.replace('</body>', `<script>window.addEventListener('load', ${runFixture});</script></body>`);
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); res.end(html); return;
  }
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, bytes) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(bytes);
  });
}).listen(Number(process.env.PORT) || 4175, process.env.HOST || '127.0.0.1', () => console.log('Photo QA: http://localhost:4175/tools/mobile-qa.html?case=portrait'));
