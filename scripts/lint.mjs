import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
async function walk(dir) { const items = await readdir(dir, { withFileTypes: true }); return (await Promise.all(items.map(i => i.isDirectory() ? walk(`${dir}/${i.name}`) : `${dir}/${i.name}`))).flat(); }
const files = (await walk('src')).filter(f => /\.tsx?$/.test(f));
for (const path of files) {
  const text = await readFile(path, 'utf8');
  assert(text.endsWith('\n'), `${path}: missing final newline`);
  assert(!/\beval\s*\(|new Function\s*\(|dangerouslySetInnerHTML|\.innerHTML\s*=/.test(text), `${path}: executable or raw HTML injection`);
  assert(!/from\s+['"](?:node:|electron|fs['"]|child_process)/.test(text), `${path}: forbidden runtime import`);
  if (path.startsWith('src/core/')) {
    assert(!/from\s+['"](?:react|obsidian)/.test(text), `${path}: core must not import UI or host`);
    assert(!/from\s+['"][^'"]*(?:\/editor\/|\/obsidian\/|\/components\/)/.test(text), `${path}: core imports must point inward`);
  }
}
console.log(`Verified runtime boundaries and injection rules in ${files.length} source files. TypeScript checks unused code and strict types.`);
assert(!/!important\b/i.test(await readFile('styles.css', 'utf8')), 'Use scoped selectors and CSS variables instead of !important');
