import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import {createRequire} from 'node:module';
import type {Connect} from 'vite';
const {requestLocal}=createRequire(import.meta.url)('./electron/local-client.cjs');
const localMiddleware:Connect.NextHandleFunction=async(req,res,next)=>{
 if(!req.url?.startsWith('/__local/'))return next();
 const host=req.headers.host;
 if(!host || !/^(127\.0\.0\.1|localhost):(5173|4173)$/.test(host) || (req.headers.origin && req.headers.origin!==`http://${host}`) || req.headers['x-zhiye-local']!=='1'){res.statusCode=403;res.end();return;}
 try{
  const operation=req.url.slice('/__local/'.length);
  if(!['GET','POST'].includes(req.method || ''))throw Error('请求方法无效');
  const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>60*1024*1024)throw Error('笔记库过大');chunks.push(chunk);}
  const result=await requestLocal(operation,req.method==='POST'?JSON.parse(Buffer.concat(chunks).toString()):undefined);
  res.statusCode=result.status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(result.data));
 }catch(error){res.statusCode=503;res.end(JSON.stringify({error:error instanceof Error?error.message:'本机笔记库不可用'}));}
};
import {randomBytes} from 'node:crypto';

export default defineConfig(({command})=>{
 const nonce=command==='serve'?randomBytes(24).toString('base64'):undefined;
 return {
  html: {cspNonce:nonce},
  plugins: [react(),{name:"shared-local-workspace",configureServer(server){server.middlewares.use(localMiddleware);},configurePreviewServer(server){server.middlewares.use(localMiddleware);}},{name:'development-csp-nonce',transformIndexHtml(html){return nonce?html.replace("script-src 'self'",`script-src 'self' 'nonce-${nonce}'`):html;}}],
  resolve: { alias: [{find:/^vditor$/,replacement:new URL('./node_modules/.zhiye-vditor/index.js',import.meta.url).pathname}] },
  test: { include: ['src/**/*.test.{ts,tsx}'] },
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/@codemirror/') || id.includes('/@lezer/')) return 'editor';
          if (id.includes('/highlight.js/')) return 'highlight';
          if (id.includes('/jszip/') || id.includes('/pako/')) return 'backup';
        },
      },
    },
  },
};
});
