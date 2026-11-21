import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(dir, '..', 'outcome-proof-lab.html'), 'utf8');
const match = html.match(/<script>\s*([\s\S]*?)<\/script>/);
assert.ok(match, 'must include self-contained interactive script');
const logic = match[1].split('let selected =')[0] + '\nglobalThis.lab = {FIXTURES, evaluateProof};';
const sandbox = {};
vm.runInNewContext(logic, sandbox, {timeout:1000});
const {FIXTURES,evaluateProof} = sandbox.lab;
const expected = {
  'missing-cause':'NEEDS_VERIFICATION', replay:'BLOCKED',
  expired:'BLOCKED', 'no-readback':'NEEDS_VERIFICATION', complete:'VERIFIED'
};
for(const [id,outcome] of Object.entries(expected)) {
  test(`${id} yields ${outcome}`,()=>assert.equal(evaluateProof({...FIXTURES[id]}).outcome, outcome));
}
test('dispatched with invalid approval is uncertain, not blocked',()=>{
  assert.equal(evaluateProof({...FIXTURES.complete,approval:false}).outcome,'NEEDS_VERIFICATION');
});
test('200 OK with missing causal proof cannot be verified',()=>{
  assert.equal(evaluateProof({...FIXTURES.complete,causal:false}).outcome,'NEEDS_VERIFICATION');
});
test('closed without readback cannot be verified',()=>{
  assert.equal(evaluateProof({...FIXTURES.complete,readback:false}).outcome,'NEEDS_VERIFICATION');
});
test('conflicting acknowledgement cannot be silently verified',()=>{
  assert.equal(evaluateProof({...FIXTURES.complete,providerOk:false}).outcome,'NEEDS_VERIFICATION');
});
test('no dispatch despite valid preflight cannot be verified',()=>{
  assert.equal(evaluateProof({...FIXTURES.complete,dispatched:false}).outcome,'NEEDS_VERIFICATION');
});
test('CSP denies all network traffic',()=>{
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/default-src 'none'/);
  assert.equal((html.match(/<script\b/g)||[]).length,1);
  assert.ok(!/<script[^>]+src=/.test(html));
  assert.match(html,/networkCalls:0/);
});
test('source labels disclaim live attestation',()=>{
  assert.match(html,/SIMULATED · NO LIVE EFFECTS/);
  assert.match(html,/verifiedLiveAction:false/);
  assert.match(html,/cryptographicAttestation:false/);
});
