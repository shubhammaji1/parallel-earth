const fs=require('node:fs');let data='';
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{data+=chunk;if(data.endsWith('\nEND\n')||data.endsWith('\rEND\r')){const encoded=data.slice(0,-5).replace(/\s/g,'');fs.writeFileSync('media/parallel-earth-logo.png',Buffer.from(encoded,'base64'));if(process.stdin.isTTY)process.stdin.setRawMode(false);console.log('Logo source imported.');process.exit(0);}});
process.stdin.resume();console.log('Ready for logo bytes.');

