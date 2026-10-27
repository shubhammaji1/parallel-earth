const zlib=require('node:zlib');
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
exports.crc32=crc32;
exports.zip=(entries)=>{
  const locals=[],central=[];let offset=0;
  for(const [name,source]of entries){
    const data=Buffer.isBuffer(source)?source:Buffer.from(source),encoded=Buffer.from(name),packed=zlib.deflateRawSync(data),crc=crc32(data);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt16LE(33,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(encoded.length,26);
    locals.push(local,encoded,packed);
    const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(8,10);directory.writeUInt16LE(33,14);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(packed.length,20);directory.writeUInt32LE(data.length,24);directory.writeUInt16LE(encoded.length,28);directory.writeUInt32LE(offset,42);
    central.push(directory,encoded);offset+=local.length+encoded.length+packed.length;
  }
  const directoryBytes=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directoryBytes.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directoryBytes,end]);
};

