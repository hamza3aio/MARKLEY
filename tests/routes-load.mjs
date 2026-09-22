// Phase 10 retest: import every /api route + lib, assert default handler export.
// Catches broken relative imports that node --check cannot see.
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';

const root = process.cwd();
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (e.endsWith('.js')) files.push(p);
  }
})(join(root, 'api'));

let fail = 0;
for (const f of files) {
  const rel = relative(root, f).replace(/\\/g, '/');
  if (rel.startsWith('api/_lib/')) {
    try { await import('file:///' + f.replace(/\\/g, '/')); console.log(`ok   lib  ${rel}`); }
    catch (e) { fail++; console.log(`FAIL lib  ${rel}: ${e.message}`); }
    continue;
  }
  try {
    const m = await import('file:///' + f.replace(/\\/g, '/'));
    if (typeof m.default !== 'function') { fail++; console.log(`FAIL route ${rel}: no default function export`); }
    else console.log(`ok   route ${rel}`);
  } catch (e) { fail++; console.log(`FAIL route ${rel}: ${e.message}`); }
}
console.log(fail ? `\n${fail} FAILURES` : '\nALL ROUTES LOAD');
process.exit(fail ? 1 : 0);
