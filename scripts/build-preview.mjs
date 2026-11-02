import { build } from 'esbuild';
await build({ entryPoints: ['dev/main.tsx'], outfile: 'dev/preview.js', bundle: true, format: 'iife', platform: 'browser', target: 'es2020', define: { 'process.env.NODE_ENV': '"production"' } });
