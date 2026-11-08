import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('pages-dist'),port=Number(process.argv[2]??3021);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.wasm':'application/wasm','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
http.createServer(async(req,res)=>{
 try{let rel=decodeURIComponent(new URL(req.url,'http://127.0.0.1:'+port).pathname);if(rel.endsWith('/'))rel+='index.html';const file=path.resolve(root,'.'+rel);if(!file.startsWith(root+path.sep))throw Error('path');const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}
 catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log('Reviewbox local preview (no fixtures): http://127.0.0.1:'+port));
