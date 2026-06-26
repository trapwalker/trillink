// CRC-16/CCITT-FALSE: poly=0x1021, init=0xFFFF, no reflection, no final XOR
// Check value: crc16("123456789") === 0x29B1

const TABLE: Uint16Array = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : (crc << 1);
    }
    t[i] = crc & 0xffff;
  }
  return t;
})();

export function crc16(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc = ((crc << 8) ^ TABLE[((crc >> 8) ^ (data[i] ?? 0)) & 0xff]!) & 0xffff;
  }
  return crc;
}
