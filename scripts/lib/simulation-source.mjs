import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
export async function simulationSource() {
  const source = ['src/core/topology/digital.ts', 'src/core/session/DigitalRuntime.ts', 'src/core/session/DigitalSessions.ts', 'src/core/session/SaveCoordinator.ts', 'src/components/definitions/digital.ts', 'src/editor/simulation/schedule.ts', 'src/editor/ui/SimulationPanel.tsx', 'src/editor/ui/Editor.tsx', 'src/obsidian/CircuitFileView.tsx', 'src/main.ts', 'dev/main.tsx', 'dev/digital-memory.ts', 'tests/fixtures/digital.ts', 'tests/unit/digital.test.ts', 'tests/unit/digital-sessions.test.ts', 'tests/unit/simulation-schedule.test.ts', 'tests/unit/simulation-audit.test.ts', 'tests/unit/simulation-save-races.test.ts', 'tests/property/digital.test.ts', 'tests/e2e/simulation.spec.ts', 'scripts/check-simulation-host.mjs', 'scripts/check-simulation-failures.mjs', 'scripts/check-simulation-android.mjs', 'scripts/check-simulation-memory.mjs', 'scripts/lib/obsidian-test.mjs', 'scripts/lib/simulation-source.mjs'];
  const hash = async paths => Object.fromEntries(await Promise.all(paths.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
  return { sourceBase: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceHashes: await hash(source), assetHashes: await hash(['main.js', 'manifest.json', 'styles.css']) };
}
