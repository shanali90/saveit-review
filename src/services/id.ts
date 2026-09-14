export function createId(_prefix = 'item'): string {
  const randomValues =
    typeof crypto !== 'undefined' && 'getRandomValues' in crypto
      ? crypto.getRandomValues(new Uint8Array(16))
      : fallbackRandomValues();

  randomValues[6] = (randomValues[6] & 0x0f) | 0x40;
  randomValues[8] = (randomValues[8] & 0x3f) | 0x80;

  const hex = Array.from(randomValues, (byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex
    .slice(8, 10)
    .join('')}-${hex.slice(10, 16).join('')}`;
}

function fallbackRandomValues(): Uint8Array {
  return Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
}
