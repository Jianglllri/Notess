import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('public/vditor/dist', { recursive: true });
cpSync('node_modules/vditor/dist', 'public/vditor/dist', { recursive: true });
