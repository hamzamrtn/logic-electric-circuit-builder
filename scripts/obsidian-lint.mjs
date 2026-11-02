import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The official checker has a separate toolchain and TypeScript API from the
// plugin's compiler. Keep it outside the plugin dependency tree and bundle.
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tools = join(tmpdir(), 'lec-obsidian-lint-0.4.2');
const dependencies = { eslint: '9.39.5', 'eslint-plugin-obsidianmd': '0.4.2', typescript: '5.4.5' };
const manifest = JSON.stringify({ private: true, dependencies }, null, 2) + '\n';
await mkdir(tools, { recursive: true });
const packageFile = join(tools, 'package.json');
const installedFile = join(tools, '.installed.json');
let installed = false;
try {
  installed = await readFile(installedFile, 'utf8') === manifest;
  const requireTool = createRequire(packageFile);
  for (const [name, version] of Object.entries(dependencies)) {
    installed &&= requireTool(`${name}/package.json`).version === version;
  }
} catch { installed = false; }
if (!installed) {
  await writeFile(packageFile, manifest);
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
    'install', '--prefix', tools, '--ignore-scripts', '--legacy-peer-deps', '--no-fund',
  ], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  await writeFile(installedFile, manifest);
}
const requireTool = createRequire(packageFile);
const plugin = pathToFileURL(requireTool.resolve('eslint-plugin-obsidianmd')).href;
const configApi = pathToFileURL(requireTool.resolve('eslint/config')).href;
const config = join(tools, 'eslint.config.mjs');
await writeFile(config, `
import obsidianmd from ${JSON.stringify(plugin)};
import { defineConfig } from ${JSON.stringify(configApi)};
export default defineConfig([
  { ignores: ['**/preview.js', '**/preview.css'] },
  ...obsidianmd.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parserOptions: {
      project: ${JSON.stringify(join(project, 'tsconfig.json'))},
      tsconfigRootDir: ${JSON.stringify(project)},
    } },
  },
]);
`);
const cli = join(dirname(requireTool.resolve('eslint/package.json')), 'bin/eslint.js');
const result = spawnSync(process.execPath, [cli, '--config', config, 'src', 'dev', '--max-warnings=0'], {
  cwd: project, stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
