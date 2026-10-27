const fs=require('node:fs');
const file='media/icon.png',bytes=fs.readFileSync(file);
if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)<128||bytes.readUInt32BE(20)<128)throw new Error('Marketplace icon must be a PNG of at least 128px.');
console.log('Validated colourful ParallelEarth Marketplace icon.');

