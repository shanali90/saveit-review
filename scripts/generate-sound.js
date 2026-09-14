const fs = require('fs');

const sampleRate = 22050;
const duration = 0.25;
const frequency = 880;
const volume = 0.3;
const numSamples = Math.floor(sampleRate * duration);
const fadeLen = Math.floor(sampleRate * 0.03);
const dataSize = numSamples * 2;
const buffer = Buffer.alloc(44 + dataSize);

// RIFF chunk descriptor
buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write('WAVE', 8);

// fmt sub-chunk
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16); // Subchunk1Size
buffer.writeUInt16LE(1, 20); // AudioFormat
buffer.writeUInt16LE(1, 22); // NumChannels
buffer.writeUInt32LE(sampleRate, 24); // SampleRate
buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
buffer.writeUInt16LE(2, 32); // BlockAlign
buffer.writeUInt16LE(16, 34); // BitsPerSample

// data sub-chunk
buffer.write('data', 36);
buffer.writeUInt32LE(dataSize, 40);

// audio data
for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  let envelope = 1.0;
  if (i < fadeLen) {
    envelope = i / fadeLen;
  } else if (i > numSamples - fadeLen) {
    envelope = (numSamples - i) / fadeLen;
  }
  const val = Math.floor(volume * envelope * 32767 * Math.sin(2 * Math.PI * frequency * t));
  buffer.writeInt16LE(val, 44 + i * 2);
}

fs.writeFileSync('assets/update-chime.wav', buffer);
console.log('WAV created successfully');
