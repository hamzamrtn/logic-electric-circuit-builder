import { simulationSource } from './lib/simulation-source.mjs';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir, cpus } from 'node:os';
import assert from 'node:assert/strict';
import { launchTestHost } from './lib/obsidian-test.mjs';
const hostMode = process.argv.includes('--host'), folder = await mkdtemp(`${tmpdir()}/lec-simulation-memory-`);
const bundle = await build({ entryPoints: ['dev/digital-memory.ts'], bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2020' });
const host = hostMode ? await launchTestHost() : undefined;
const browser = host?.browser ?? await chromium.launch(), context = host?.context ?? await browser.newContext();
const page = host?.page ?? await context.newPage(), cdp = host?.cdp ?? await context.newCDPSession(page);
try {
  if (!host) await page.goto('about:blank'); await page.evaluate(bundle.outputFiles[0].text);
  await cdp.send('Performance.enable');
  const heap = async () => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize').value;
  const retained = async () => { await cdp.send('HeapProfiler.collectGarbage'); return heap(); };
  await page.evaluate(() => __digitalMemory.cycles(10));
  const baselineBytes = await retained(), batches = [], stress = [];
  for (let i = 0; i < 3; i++) { await page.evaluate(() => __digitalMemory.cycles(100)); batches.push(await retained()); }
  let peakBytes = baselineBytes;
  for (const kind of ['maximum-chain', 'lanes', 'large-definition', 'dense']) {
    let done = false;
    const pending = page.evaluate(kind => __digitalMemory.stress(kind), kind).finally(() => { done = true; });
    try { while (!done) { peakBytes = Math.max(peakBytes, await heap()); await new Promise(resolve => setTimeout(resolve, 10)); } stress.push(await pending); }
    finally { await pending; }
  }
  const finalBytes = await retained(), retainedGrowthBytes = Math.max(0, finalBytes - baselineBytes, ...batches.map(n => n - baselineBytes));
  const peakGrowthBytes = peakBytes - baselineBytes;
  const report = { ...await simulationSource(), date: new Date().toISOString(), environment: hostMode ? 'actual Obsidian desktop' : 'desktop Chromium', version: hostMode ? await page.evaluate(() => require('@electron/remote').app.getVersion()) : browser.version(), cpu: cpus()[0]?.model, warmupCycles: 10, measuredCycles: 300, baselineBytes, retainedBatchesBytes: batches, finalBytes, retainedGrowthBytes, peakSampledGrowthBytes: peakGrowthBytes, retainedBudgetBytes: 2 * 1024 ** 2, peakBudgetBytes: 32 * 1024 ** 2, stress, note: 'CDP/V8 heap on desktop hardware, forced GC between batches, 10 ms peak samples. Does not measure process/native memory or prove an absolute peak bound or actual mobile behavior.' };
  await writeFile(`${folder}/results.json`, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ output: `${folder}/results.json`, ...report }, null, 2));
  assert(retainedGrowthBytes < report.retainedBudgetBytes, 'Repeated owners/runs retained too much heap'); assert(peakGrowthBytes < report.peakBudgetBytes, 'Stress run exceeded sampled transient heap budget');
} finally { if (host) await host.close(); else await browser.close(); }
