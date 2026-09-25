const https = require('https');
const fs = require('fs');
const zlib = require('zlib');

const url = process.argv[2];
if (!url) { console.error('Usage: node decode_eas_log.js <url>'); process.exit(1); }

https.get(url, (res) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => {
    const buf = Buffer.concat(chunks);
    console.error(`Downloaded ${buf.length} bytes, content-type: ${res.headers['content-type']}`);
    
    // Try plain text first
    const text = buf.toString('utf-8');
    if (text.includes('FAILURE') || text.includes('BUILD FAILED') || text.includes('error')) {
      fs.writeFileSync('eas-gradlew-log.txt', text);
      console.log('Written as plain text');
      return;
    }
    
    // Try brotli
    try {
      const decompressed = zlib.brotliDecompressSync(buf);
      fs.writeFileSync('eas-gradlew-log.txt', decompressed.toString('utf-8'));
      console.log('Written after brotli decompression');
      return;
    } catch(e) { console.error('Not brotli:', e.message); }
    
    // Try gzip
    try {
      const decompressed = zlib.gunzipSync(buf);
      fs.writeFileSync('eas-gradlew-log.txt', decompressed.toString('utf-8'));
      console.log('Written after gzip decompression');
      return;
    } catch(e) { console.error('Not gzip:', e.message); }
    
    // Try inflate (raw deflate)
    try {
      const decompressed = zlib.inflateRawSync(buf);
      fs.writeFileSync('eas-gradlew-log.txt', decompressed.toString('utf-8'));
      console.log('Written after inflateRaw decompression');
      return;
    } catch(e) { console.error('Not inflateRaw:', e.message); }
    
    // Write raw
    fs.writeFileSync('eas-gradlew-log.txt', buf);
    console.log('Written as raw bytes (could not decompress)');
  });
}).on('error', (e) => { console.error(e); process.exit(1); });
