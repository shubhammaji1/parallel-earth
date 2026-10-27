const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {stripTypeScriptTypes}=require('node:module');
// Node's own TypeScript eraser keeps this demo dependency free on Node >=22.17.
const source=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../reconcile.cts'),'utf8'));
const moduleObject={exports:{}};
new Function('module',source)(moduleObject);
const {total}=moduleObject.exports;
test('duplicate Booking IDs must not inflate fares',()=>assert.equal(total([{id:'A',fare:100},{id:'A',fare:100}]),100));
test('cancellations contribute no fare',()=>assert.equal(total([{id:'A',fare:100,cancelled:true}]),0));
test('reissue amount is separate from latest original',()=>assert.equal(total([{id:'A',fare:100},{id:'A',fare:120},{id:'A',fare:30,reissue:true}]),150));

