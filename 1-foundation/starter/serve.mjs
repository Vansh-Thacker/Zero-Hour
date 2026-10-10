/**
 * A small local web server for this folder. No install needed.
 *   npm start            then open http://127.0.0.1:8080
 *   PORT=3000 npm start  to use another port
 *
 * It serves the whole pack folder, plus one extra address, /api/assets, which lists the artwork
 * files so the artwork viewer can show them. It only answers this computer.
 */
import http from 'node:http';
import {readFile,readdir,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = await realpath(fileURLToPath(new URL('../../',import.meta.url)));
const home = '/1-foundation/demo.html';
const port = Number(process.env.PORT || 8080);
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.csv':'text/csv; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream'};
const assetFolders = ['1-foundation/artwork','2-extend/artwork','2-extend/previews','2-extend/worlds'];

async function walk(folder, found = []) {
  let entries = [];
  try { entries = await readdir(path.join(root, folder), {withFileTypes:true}); } catch { return found; }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relative = folder + '/' + entry.name;
    if (entry.isDirectory()) await walk(relative, found);
    else if (entry.isFile()) found.push({path: relative, bytes: (await stat(path.join(root, relative))).size});
  }
  return found;
}

const server = http.createServer(async (req, res) => {
  try {
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (name === '/api/assets') {
      const files = [];
      for (const folder of assetFolders) await walk(folder, files);
      files.sort((a, b) => a.path.localeCompare(b.path));
      res.writeHead(200, {'Content-Type': mime['.json'], 'Cache-Control': 'no-store'});
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({files}));
    }
    if (name === '/') { res.writeHead(302, {Location: home}); return res.end(); }
    if (name.endsWith('/')) name += 'index.html';
    const file = await realpath(path.resolve(root, '.' + name));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
    const body = await readFile(file);
    res.writeHead(200, {'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.on('error', e => { console.error(`Could not start: ${e.message}. Close the other server or choose another PORT.`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Running at http://127.0.0.1:${server.address().port}/  (Ctrl+C to stop)`));
