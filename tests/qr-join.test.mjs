import test from 'node:test';
import assert from 'node:assert/strict';
import {phoneAddress, joinLinks, phoneJoinLinks} from '../src/net/joinLinks.mjs';
import {joinQrImage, roomInvite} from '../src/ui/joinQr.mjs';

test('QR: deployed HTTPS origin takes priority over internal adapter addresses', () => {
  assert.deepEqual(phoneJoinLinks('https://team-20-1.onrender.com', ['http://10.0.0.1:8080'], 'VAULT-42'),
    ['https://team-20-1.onrender.com/play.html?code=VAULT-42']);
});
test('QR: host opened at a LAN address keeps the actual port', () => {
  assert.deepEqual(phoneJoinLinks('http://192.168.1.12:8189', [], 'VAULT-11'),
    ['http://192.168.1.12:8189/play.html?code=VAULT-11']);
});
test('QR: localhost uses phone-accessible adapters, preferring typical Wi-Fi addresses', () => {
  const result = phoneJoinLinks('http://localhost:8080', [
    'http://172.20.0.1:8080/play.html', 'http://26.1.2.3:8080/play.html',
    'http://10.0.0.2:8080/play.html', 'http://192.168.1.2:8080/play.html'], 'VAULT-42');
  assert.deepEqual(result.map(x => new URL(x).hostname), ['192.168.1.2', '10.0.0.2', '172.20.0.1', '26.1.2.3']);
});
test('QR: loopback, unspecified, link-local, unsafe schemes and credentials are excluded', () => {
  for (const value of ['http://localhost', 'http://test.localhost', 'http://127.0.0.2',
    'http://[::1]', 'http://[::]', 'http://0.0.0.0', 'http://169.254.1.1', 'http://[fe80::1]',
    'javascript:alert(1)', 'data:text/plain,a', 'ftp://host', 'https://user:secret@example.com', 'garbage']) {
    assert.equal(phoneAddress(value), null, value);
  }
});
test('QR: no usable adapters produces a clear no-QR state, never a localhost code', () => {
  assert.deepEqual(phoneJoinLinks('http://127.0.0.1:8080', [], 'VAULT-42'), []);
  assert.deepEqual(phoneJoinLinks('http://localhost', undefined, 'VAULT-42'), []);
});
test('QR: links contain only the encoded room code and remove other query data', () => {
  const [url] = joinLinks(['https://game.example/host.html?token=SECRET#fragment'], 'ROOM & 42');
  assert.equal(url, 'https://game.example/play.html?code=ROOM+%26+42');
  assert.equal(new URL(url).searchParams.get('code'), 'ROOM & 42');
  assert.ok(!url.includes('SECRET'));
});
test('QR: duplicate links are collapsed without mutating supplied addresses', () => {
  const addresses = Object.freeze(['https://game.example/a', 'https://game.example/b']);
  assert.equal(joinLinks(addresses, 'VAULT-42').length, 1);
  assert.deepEqual(joinLinks(addresses, ''), []);
});
test('QR: room-specific images are inline GIFs, deterministic and cached across redraws', () => {
  const url = 'https://game.example/play.html?code=VAULT-42';
  const image = joinQrImage(url);
  assert.match(image, /^data:image\/gif;base64,/);
  assert.equal(Buffer.from(image.split(',')[1], 'base64').subarray(0, 3).toString(), 'GIF');
  assert.equal(joinQrImage(url), image);
  assert.notEqual(joinQrImage(url.replace('42', '43')), image);
});

// A small DOM recorder for rendering/callback assertions; actual scanning is
// independently decoded and the join flow is also checked in the browser.
class NodeRecord {
  constructor(tag, text = '') { this.tag = tag; this.children = []; this.attributes = {}; this.events = {}; this.text = text; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  addEventListener(k, v) { this.events[k] = v; }
  append(n) { this.children.push(n); }
  set textContent(v) { this.text = v; this.children = []; }
  get textContent() { return this.text + this.children.map(n => n.textContent).join(''); }
}
const walk = n => [n, ...n.children.flatMap(walk)];
const key = (n, k) => walk(n).find(x => x.attributes['data-key'] === k);
function dom(t) {
  const previous = ['Node', 'document'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  t.after(() => { for (const [k, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
  } });
  globalThis.Node = NodeRecord;
  globalThis.document = {
    createElement: tag => new NodeRecord(tag), createTextNode: text => new NodeRecord('#text', text),
  };
}
test('QR: open room renders an accessible QR, manual-code guidance and direct join link', t => {
  dom(t);
  const panel = roomInvite({code: 'VAULT-55', addresses: ['https://game.example']});
  assert.equal(key(panel, 'join-qr').attributes.alt, 'Scan to join room VAULT-55');
  assert.equal(key(panel, 'join-link').attributes.href, 'https://game.example/play.html?code=VAULT-55');
  assert.match(panel.textContent, /room code above/);
  assert.equal(key(panel, 'join-network'), undefined);
});
test('QR: choosing another network updates both QR and link and survives live redraws', t => {
  dom(t);
  const room = {code: 'VAULT-56', addresses: ['http://192.168.1.2:8080', 'http://10.1.2.3:8080']};
  const panel = roomInvite(room);
  const previous = key(panel, 'join-qr').attributes.src;
  const url = 'http://10.1.2.3:8080/play.html?code=VAULT-56';
  key(panel, 'join-network').events.change({currentTarget: {value: url}});
  assert.equal(key(panel, 'join-link').attributes.href, url);
  assert.notEqual(key(panel, 'join-qr').attributes.src, previous);
  assert.equal(key(roomInvite(room), 'join-link').attributes.href, url);
});
test('QR: a new lobby gets its own code, not the previous room link', t => {
  dom(t);
  const addresses = ['https://game.example'];
  roomInvite({code: 'VAULT-57', addresses});
  assert.equal(key(roomInvite({code: 'VAULT-58', addresses}), 'join-link').attributes.href,
    'https://game.example/play.html?code=VAULT-58');
});
test('QR: locked rooms do not advertise joining and missing networks do not break rendering', t => {
  dom(t);
  const locked = roomInvite({code: 'VAULT-59', state: {confirmed: true}, addresses: ['https://game.example']});
  assert.equal(key(locked, 'join-qr'), undefined);
  assert.match(locked.textContent, /Joining is closed/);
  const noNetwork = roomInvite({code: 'VAULT-59', addresses: []});
  assert.equal(key(noNetwork, 'join-qr'), undefined);
  assert.match(noNetwork.textContent, /network address/);
});
