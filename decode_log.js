const fs = require('fs');
const zlib = require('zlib');

try {
  const input = fs.readFileSync('build_log.raw');
  const decompressed = zlib.brotliDecompressSync(input);
  fs.writeFileSync('build_log.decoded.log', decompressed.toString('utf8'));
  console.log('Decoded successfully');
} catch (e) {
  console.error('Failed to decode', e);
}
