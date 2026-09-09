// Local-only browser harness. Synthetic camera and share targets never reach production.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');

function setupFixture() {
  const scenario = new URLSearchParams(location.search).get('case') || 'preview';
  window.mobileQA = { scenario, checks: [], shares: [], streams: [], errors: [] };
  window.addEventListener('error', event => window.mobileQA.errors.push(event.message));
  window.addEventListener('unhandledrejection', event => window.mobileQA.errors.push(String(event.reason)));
  const source = document.createElement('canvas');
  source.width = source.height = 512;
  const ctx = source.getContext('2d');
  let tick = 0;
  const draw = () => {
    ctx.fillStyle = '#dedede'; ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#171717'; ctx.fillRect(25 + tick++ % 100, 30, 100, 120);
    ctx.fillStyle = '#ff00ff'; ctx.fillRect(150, 150, 212, 212);
  };
  draw();
  setInterval(draw, 60);
  window.mobileQA.source = source;
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
    if (scenario === 'denied') throw new DOMException('Test denial', 'NotAllowedError');
    if (scenario === 'cancel-request') await new Promise(resolve => setTimeout(resolve, 350));
    const stream = source.captureStream(15);
    window.mobileQA.streams.push(stream);
    return stream;
  } });
  if (scenario === 'photo-only') window.MediaRecorder = undefined;
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => scenario !== 'unsupported-share' });
  Object.defineProperty(navigator, 'share', { configurable: true, value: async data => {
    if (scenario === 'cancel-share') throw new DOMException('Cancelled', 'AbortError');
    window.mobileQA.shares.push(data.files[0]);
  } });
}

async function runFixture() {
  const qa = window.mobileQA;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async predicate => {
    const deadline = performance.now() + 15000;
    while (!predicate()) {
      if (performance.now() > deadline) throw new Error('State transition timed out: ' + mobileCapture.state);
      await wait(40);
    }
  };
  const check = (name, value) => {
    qa.checks.push({ name, pass: Boolean(value) });
    if (!value) throw new Error(name);
  };
  const rect = selector => document.querySelector(selector).getBoundingClientRect();
  const centerPixel = canvas => Array.from(canvas.getContext('2d').getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data);
  const magenta = pixel => pixel[0] > 180 && pixel[1] < 80 && pixel[2] > 180;
  const layout = () => {
    const preview = rect('.mobile-preview-fixed');
    const controls = rect('.mobile-scroll');
    const dock = rect('.mobile-camera-dock');
    const nice = rect('.mobile-camera-nice');
    qa.layout = { preview: preview.toJSON(), controls: controls.toJSON(), dock: dock.toJSON(), nice: nice.toJSON() };
    check('Controls reserve dock space', controls.bottom <= dock.top + 1);
    check('Dock inside visual viewport', dock.bottom <= innerHeight + 1);
    check('NICE TRY inside horizontal bounds', nice.left >= 0 && nice.right <= innerWidth);
    check('NICE TRY visible or independently scrollable', nice.bottom <= controls.bottom + 1 || getComputedStyle(document.querySelector('.mobile-scroll')).overflowY === 'auto');
  };
  try {
    if (qa.scenario === 'entry') { qa.done = true; return; }
    if (qa.scenario === 'cancel-request') {
      const opening = openMobileCamera();
      await until(() => mobileCapture.state === 'requesting');
      await closeMobileCapture({ resetSource: true });
      await opening;
      check('Late camera request does not reopen page', mobileCapture.state === 'idle');
      check('Late camera stream is released', qa.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')));
      qa.done = true; return;
    }
    if (['upload', 'unsupported-share', 'cancel-share'].includes(qa.scenario)) {
      const blob = await new Promise(resolve => qa.source.toBlob(resolve, 'image/png'));
      const input = document.getElementById('mobileGalleryFile');
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], 'fixture.png', { type: 'image/png' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await until(() => state.source && mobileCapture.state === 'idle');
      await wait(500);
      layout();
      await until(() => mobileImageOutput.blob);
      check('Image prepared before OUTPUT tap', mobileImageOutput.signature === mobileImageOutputSignature());
      if (qa.scenario === 'upload') {
        const previous = mobileImageOutput.blob;
        randomizeMobileEffect();
        await until(() => mobileImageOutput.blob && mobileImageOutput.blob !== previous);
        check('NICE TRY invalidates cached export', mobileImageOutput.signature === mobileImageOutputSignature());
      }
      await exportOutput();
      if (qa.scenario === 'unsupported-share') check('Unsupported sharing has recoverable preview', Boolean(document.getElementById('mobileOutputPreview')));
      else if (qa.scenario === 'cancel-share') check('Cancelled sharing does not open extra save page', !document.getElementById('mobileOutputPreview'));
      else {
        check('Photo OUTPUT invokes sharing directly', qa.shares.length === 1);
        check('No extra SAVE page', !document.getElementById('mobileOutputPreview'));
        check('PNG file exported', qa.shares[0].type === 'image/png');
      }
      qa.done = true; return;
    }
    await openMobileCamera();
    if (qa.scenario === 'denied') {
      check('Permission denial reaches retry state', mobileCapture.state === 'error');
      check('No camera tracks leaked', !mobileCapture.stream);
      qa.done = true; return;
    }
    check('Camera preview reachable', mobileCapture.state === 'previewing');
    if (qa.scenario === 'lifecycle') {
      const originalStream = mobileCapture.stream;
      mobileCameraSwitch.click();
      await until(() => mobileCapture.state === 'previewing' && mobileCapture.stream !== originalStream);
      check('Switch camera releases previous stream', originalStream.getTracks().every(track => track.readyState === 'ended'));
      check('Switch camera changes facing mode', mobileCapture.facingMode === 'user');
      const preset = state.preset;
      const colors = JSON.stringify(state.nodes.color);
      randomizeMobileEffect();
      check('NICE TRY changes preset', state.preset !== preset);
      check('NICE TRY randomizes colors', JSON.stringify(state.nodes.color) !== colors);
      const reverse = state.outputReverse;
      mobilePreviewRe.click();
      check('Reverse control responds in preview', state.outputReverse !== reverse);
    }
    state.nodes.color.bg = '#ffffff';
    state.nodes.color.highlight = '#000000';
    state.size = 420;
    renderMobileCaptureFrame();
    layout();
    const preview = rect('.mobile-preview-fixed');
    check('Viewfinder is square', Math.abs(preview.width - preview.height) < 1);
    check('Raw crop only on display', magenta(centerPixel(mobileResult)) && !magenta(centerPixel(result)));
    if (qa.scenario === 'photo-only' || qa.scenario === 'photo') {
      if (qa.scenario === 'photo-only') check('Unsupported recorder retains photo preview', !mobileCapture.recordingSupported);
      // Exercise the actual gesture handlers without granting real camera permission.
      const gesture = { pointerId: 1, preventDefault() {} };
      mobileRecordControl.setPointerCapture = () => {};
      beginMobileCaptureGesture(gesture);
      finishMobileCaptureGesture(gesture);
      await until(() => mobileCapture.state === 'idle' && state.sourceType === 'image');
      check('Tap captures photo', state.sourceAspect === 1);
      check('Photo releases camera', qa.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')));
      qa.done = true; return;
    }
    if (qa.scenario === 'preview') { qa.done = true; return; }
    const gesture = { pointerId: 1, preventDefault() {} };
    mobileRecordControl.setPointerCapture = () => {};
    beginMobileCaptureGesture(gesture);
    await until(() => mobileCapture.state === 'recording');
    check('Recording starts', mobileCapture.state === 'recording');
    const frame = rect('.mobile-record-progress-frame');
    check('Progress centered on raw crop', Math.abs(frame.x + frame.width / 2 - (preview.x + preview.width / 2)) < 1 && Math.abs(frame.y + frame.height / 2 - (preview.y + preview.height / 2)) < 1);
    if (qa.scenario === 'recording') { qa.done = true; return; }
    if (qa.scenario === 'limit') await until(() => mobileCapture.state === 'reviewing');
    else {
      await wait(650);
      if (qa.scenario === 'background') {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      } else finishMobileCaptureGesture(gesture);
      await until(() => mobileCapture.state === 'reviewing');
    }
    check('Recording reaches review', mobileCapture.state === 'reviewing');
    check('Recorded clip within five second limit', mobileCapture.duration > 0 && mobileCapture.duration <= 5);
    check('Recording releases camera', qa.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')));
    await until(() => mobileCapturePlayback.readyState >= 2);
    await wait(150);
    const decoded = document.createElement('canvas');
    decoded.width = decoded.height = 128;
    decoded.getContext('2d').drawImage(mobileCapturePlayback, 0, 0, 128, 128);
    qa.encodedCenter = centerPixel(decoded);
    check('Encoded video has no raw center crop', !magenta(qa.encodedCenter));
    check('Decoded video is square', mobileCapturePlayback.videoWidth === mobileCapturePlayback.videoHeight);
    await confirmMobileRecording();
    check('Review confirms to ready', mobileCapture.state === 'ready');
    await downloadMobileRecording();
    check('Video OUTPUT shares directly', qa.shares.length === 1 && qa.shares[0].size > 0);
    check('No redundant SAVE page', !document.getElementById('mobileOutputPreview'));
    if (qa.scenario === 'lifecycle') {
      mobileCameraDockRec.click();
      await until(() => mobileCapture.state === 'previewing');
      check('Confirmed result can return to camera', Boolean(mobileCapture.stream));
    }
    qa.done = true;
  } catch (error) { qa.failure = error.stack; qa.done = true; }
  finally {
    document.documentElement.dataset.qa = JSON.stringify({ checks: qa.checks, failure: qa.failure, done: qa.done, encodedCenter: qa.encodedCenter, errors: qa.errors });
  }
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.css': 'text/css' };
const server = http.createServer((req, res) => {
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
});
server.listen(Number(process.env.PORT) || 4175, '127.0.0.1', () => console.log('Mobile QA: http://localhost:4175/tools/mobile-qa.html?case=full'));
