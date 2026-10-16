import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const workflow = JSON.parse(fs.readFileSync(new URL('./workflow.json', import.meta.url)));
assert.equal(workflow.nodes.length, 4);
assert.ok(!workflow.nodes.some(n=>/http|webhook|email|credential/i.test(n.type)));
let items = [];
for (const node of workflow.nodes.filter(n=>n.type==='n8n-nodes-base.code')) {
 const context={ $input: {first:()=>items[0]}, Number, JSON, String};
 items=vm.runInNewContext(`(()=>{${node.parameters.jsCode}})()`,context,{timeout:1000});
 assert.equal(items.length,1);
 console.log(node.name, JSON.stringify(items[0].json));
}
const data=items[0].json;
assert.equal(data.naiveStatus,'PASSED');
assert.equal(data.numericStatus,'INDETERMINATE');
assert.equal(data.losslessStatus,'FAILED');
assert.equal(data.approvedParsed,data.aiParsed);
assert.equal(data.case,'SYNTHETIC_INVOICE_ID');
console.log('PASS: n8n Code-node source simulated successfully (not an n8n instance).');
