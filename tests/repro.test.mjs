import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('public learning reproduction succeeds',()=>{
 const output=execFileSync(process.execPath,[resolve(root,'repro.mjs')],{encoding:'utf8',env:{...process.env,FORCE_COLOR:'0',NODE_DISABLE_COLORS:'1'}});
 assert.match(output,/Naive equality: true/);
 assert.match(output,/Validated string IDs differ: true/);
});
test('source artifacts differ in raw JSON numeric lexeme',()=>{
 const a=readFileSync(resolve(root,'fixtures/reference_original.json'),'utf8');
 const b=readFileSync(resolve(root,'fixtures/reference_changed.json'),'utf8');
 assert.notEqual(a,b);
 assert.equal(JSON.parse(a)[0].reference,JSON.parse(b)[0].reference);
});
