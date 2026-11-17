// Reads one file out of an uncompressed tar archive (ustar or GNU), which
// is how MaxMind ships its databases. Enough for that and nothing more.

export function extractTarFile(archive: Buffer, wanted: (name: string) => boolean): Buffer | null {
  let offset = 0;
  let longName: string | null = null;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) return null;
    const field = (start: number, length: number) =>
      header.subarray(start, start + length).toString("utf8").replace(/\0.*$/s, "");
    const prefix = field(345, 155);
    const name = longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    longName = null;
    const size = parseInt(field(124, 12).trim() || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    const start = offset + 512;
    if (!Number.isFinite(size) || size < 0 || start + size > archive.length) return null;
    const body = archive.subarray(start, start + size);
    if (type === "L") {
      longName = body.toString("utf8").replace(/\0.*$/s, "");
    } else if ((type === "0" || type === "\0") && wanted(name)) {
      return Buffer.from(body);
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
  return null;
}
