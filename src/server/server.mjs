import http from 'node:http';
import {randomInt} from 'node:crypto';
import {readdir, readFile, realpath, stat} from 'node:fs/promises';
import {networkInterfaces} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadGameData} from '../engine/loadData.mjs';
import {timeLeft} from '../engine/state.mjs';
import {act, createRoom, joinRoom, viewFor} from './rooms.mjs';

const root = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.PORT || 8080);
const game = await loadGameData(); // challenge.json and questions.json, checked once at start
const rooms = new Map();
const streams = new Map();
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
};

function reply(res, status, body) {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) {
      const error = new Error('Request is too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch {
    const error = new Error('Send valid JSON.');
    error.status = 400;
    throw error;
  }
}

function newCode() {
  if (rooms.size >= 90) throw new Error('All room codes are in use. Try again later.');
  let code;
  do { code = `VAULT-${randomInt(10, 100)}`; } while (rooms.has(code));
  return code;
}

function findRoom(code, res) {
  const room = rooms.get(code);
  if (!room) reply(res, 404, {error: `No game with code ${code}. Check the code on the host screen.`});
  return room;
}

function send(client, room) {
  // serverNow lets each screen line its countdown up with the server's clock.
  client.res.write(`data: ${JSON.stringify({...viewFor(room, client.token), serverNow: Date.now()})}\n\n`);
}

function broadcast(room) {
  for (const client of streams.get(room.code)) send(client, room);
}

function openStream(req, res, room, token) {
  if (!viewFor(room, token)) return reply(res, 403, {error: 'This seat is not part of this game.'});
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Content-Type-Options': 'nosniff',
  });
  const client = {res, token};
  streams.get(room.code).add(client);
  send(client, room);
  req.on('close', () => streams.get(room.code).delete(client));
}

function joinAddresses() {
  const addresses = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family === 'IPv4' && !item.internal) {
        addresses.push(`http://${item.address}:${server.address().port}/play.html`);
      }
    }
  }
  return addresses;
}

// The artwork viewer (2-extend/artwork.html) asks for a list of the artwork files.
const ASSET_FOLDERS = ['1-foundation/artwork', '2-extend/artwork', '2-extend/previews', '2-extend/worlds'];

async function listAssets(folder, found = []) {
  let entries = [];
  try { entries = await readdir(path.join(root, folder), {withFileTypes: true}); } catch { return found; }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relative = `${folder}/${entry.name}`;
    if (entry.isDirectory()) await listAssets(relative, found);
    else if (entry.isFile()) found.push({path: relative, bytes: (await stat(path.join(root, relative))).size});
  }
  return found;
}

async function serveFile(req, res, pathname) {
  const name = pathname === '/' ? '/index.html' : pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const file = await realpath(path.resolve(root, '.' + name));
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  const body = await readFile(file);
  res.writeHead(200, {
    'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const match = /^\/api\/rooms\/([^/]+)\/(join|events|actions)$/.exec(pathname);

    if (req.method === 'POST' && pathname === '/api/rooms') {
      await readJson(req);
      const room = createRoom(newCode());
      rooms.set(room.code, room);
      streams.set(room.code, new Set());
      return reply(res, 201, {code: room.code, token: room.hostToken});
    }

    if (match) {
      const room = findRoom(match[1], res);
      if (!room) return;
      if (match[2] === 'join' && req.method === 'POST') {
        const {name} = await readJson(req);
        const player = joinRoom(room, name);
        reply(res, 200, {code: room.code, token: player.token, category: player.category});
        return broadcast(room);
      }
      if (match[2] === 'actions' && req.method === 'POST') {
        const {token, action} = await readJson(req);
        try {
          act(room, token, action, game);
        } catch (error) {
          if (viewFor(room, token)) broadcast(room); // a refusal still shows in everyone's log
          throw error;
        }
        reply(res, 200, {ok: true});
        return broadcast(room);
      }
      if (match[2] === 'events' && req.method === 'HEAD') { // "is my seat still in this game?"
        res.writeHead(viewFor(room, url.searchParams.get('token')) ? 200 : 403);
        return res.end();
      }
      if (match[2] === 'events' && req.method === 'GET') {
        return openStream(req, res, room, url.searchParams.get('token'));
      }
    }

    if (req.method === 'GET' && pathname === '/api/assets') {
      const files = [];
      for (const folder of ASSET_FOLDERS) await listAssets(folder, files);
      files.sort((a, b) => a.path.localeCompare(b.path));
      return reply(res, 200, {files});
    }

    if (req.method === 'GET' && pathname === '/api/join-addresses') {
      return reply(res, 200, {addresses: joinAddresses()});
    }

    if (pathname.startsWith('/api/')) return reply(res, 404, {error: 'That game address does not exist.'});
    if (req.method !== 'GET' && req.method !== 'HEAD') return reply(res, 405, {error: 'Method not allowed.'});
    await serveFile(req, res, pathname);
  } catch (error) {
    if (res.headersSent) return res.end();
    if (error.code === 'ENOENT') return reply(res, 404, {error: 'File not found.'});
    const status = error.status ?? 500;
    reply(res, status, {error: status === 500 ? 'The game could not complete that request.' : error.message});
  }
});

// One clock for every screen: when a checkpoint's time runs out, end it for the whole room.
setInterval(() => {
  for (const room of rooms.values()) {
    const {stage, checkpoint} = room.state;
    if (stage !== 'checkpoint' || checkpoint.expired || timeLeft(checkpoint.timer, Date.now()) > 0) continue;
    act(room, room.hostToken, {type: 'timeout'}, game);
    broadcast(room);
  }
}, 1000);

setInterval(() => {
  for (const clients of streams.values()) {
    for (const client of clients) client.res.write(': keep-alive\n\n');
  }
}, 30000);

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `Could not start Zero Hour: port ${port} is already in use. Another server is still running; stop it with Ctrl+C in its terminal, or choose another port with PORT.`
    : `Could not start Zero Hour: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '0.0.0.0', () => {
  console.log(`Zero Hour at http://127.0.0.1:${server.address().port}/  (single player and multiplayer; Ctrl+C to stop)`);
});
