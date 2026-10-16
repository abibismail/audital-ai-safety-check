// Self-contained public learning example (Node.js; no dependencies).
// Shows an IEEE-754 JSON number pitfall and a simple, safer contract.
import assert from 'node:assert/strict';
const rawA='{"id":"TX-001","reference":9007199254740992}';
const rawB='{"id":"TX-001","reference":9007199254740993}';
const naiveA=JSON.parse(rawA);
const naiveB=JSON.parse(rawB);
console.log('Ordinary JSON.parse:',naiveA.reference,naiveB.reference);
console.log('Naive equality:',naiveA.reference===naiveB.reference); // true, but raw integers differ
assert.equal(naiveA.reference,naiveB.reference);
// Safer data contract: represent large IDs as decimal strings BEFORE parsing.
const safeA=JSON.parse('{"id":"TX-001","reference":"9007199254740992"}');
const safeB=JSON.parse('{"id":"TX-001","reference":"9007199254740993"}');
const isDecimal=v=>typeof v==='string' && /^(0|[1-9]\d*)$/.test(v);
assert.ok(isDecimal(safeA.reference)&&isDecimal(safeB.reference));
console.log('Validated string IDs differ:',safeA.reference!==safeB.reference);
assert.notEqual(safeA.reference,safeB.reference);
console.log('PASS: source representations differ even though naive Number comparisons collide.');
