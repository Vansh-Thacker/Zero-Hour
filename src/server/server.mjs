import http from 'node:http';
import {randomInt} from 'node:crypto';
import {readFile, realpath} from 'node:fs/promises';
import {networkInterfaces} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRoom, joinRoom, viewFor} from './rooms.mjs';

const root = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.PORT || 8080);
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
  client.res.write(`data: ${JSON.stringify(viewFor(room, client.token))}\n\n`);
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
    const match = /^\/api\/rooms\/([^/]+)\/(join|events)$/.exec(pathname);

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
      if (match[2] === 'events' && req.method === 'GET') {
        return openStream(req, res, room, url.searchParams.get('token'));
      }
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
    const status = error.status ?? (error.message === 'Enter your name to join the game.' ? 400 : 500);
    reply(res, status, {error: status === 500 ? 'The game could not complete that request.' : error.message});
  }
});

setInterval(() => {
  for (const clients of streams.values()) {
    for (const client of clients) client.res.write(': keep-alive\n\n');
  }
}, 30000);

server.on('error', error => {
  console.error(`Could not start multiplayer: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '0.0.0.0', () => {
  console.log(`Zero Hour multiplayer at http://127.0.0.1:${server.address().port}/host.html`);
});
