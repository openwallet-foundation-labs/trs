export interface Tlv {
  tag: number;
  offset: number;
  start: number;
  end: number;
}

export function readTlv(buf: Buffer, offset: number): Tlv {
  if (offset + 2 > buf.length) throw new Error('DER: truncated');
  const tag = buf[offset];
  let len = buf[offset + 1];
  let start = offset + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4 || start + n > buf.length) {
      throw new Error('DER: bad length');
    }
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[start + i];
    start += n;
  }
  const end = start + len;
  if (end > buf.length) throw new Error('DER: truncated');
  return { tag, offset, start, end };
}

export function children(buf: Buffer, parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  for (let off = parent.start; off < parent.end;) {
    const t = readTlv(buf, off);
    out.push(t);
    off = t.end;
  }
  return out;
}

export const raw = (buf: Buffer, t: Tlv): Buffer =>
  buf.subarray(t.offset, t.end);

export const content = (buf: Buffer, t: Tlv): Buffer =>
  buf.subarray(t.start, t.end);

export const TAG = {
  BOOLEAN: 0x01,
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  OID: 0x06,
  UTC_TIME: 0x17,
  GENERALIZED_TIME: 0x18,
  SEQUENCE: 0x30,
} as const;

export function decodeOid(bytes: Buffer): string {
  if (!bytes.length) throw new Error('DER: empty OID');
  const parts: number[] = [];
  let value = 0;
  for (const b of bytes) {
    value = value * 128 + (b & 0x7f);
    if (!(b & 0x80)) {
      parts.push(value);
      value = 0;
    }
  }
  const first = parts.shift() ?? 0;
  const head =
    first < 80 ? [Math.floor(first / 40), first % 40] : [2, first - 80];
  return [...head, ...parts].join('.');
}

export function decodeTime(buf: Buffer, t: Tlv): Date {
  const s = content(buf, t).toString('ascii');
  const m =
    t.tag === TAG.UTC_TIME
      ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s)
      : t.tag === TAG.GENERALIZED_TIME
        ? /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/.exec(s)
        : null;
  if (!m) throw new Error(`DER: unsupported time ${s}`);
  let year = Number(m[1]);
  if (t.tag === TAG.UTC_TIME) year += year >= 50 ? 1900 : 2000;
  return new Date(
    Date.UTC(
      year,
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
    ),
  );
}

export function integerHex(buf: Buffer, t: Tlv): string {
  let bytes = content(buf, t);
  while (bytes.length > 1 && bytes[0] === 0) bytes = bytes.subarray(1);
  return bytes.toString('hex');
}
