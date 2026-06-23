const MOJIBAKE_PATTERN = /[\u00c0-\u00ff]/;

export function normalizeUploadedFilename(filename: string): string {
  if (!filename || !MOJIBAKE_PATTERN.test(filename)) {
    return filename;
  }

  const decoded = Buffer.from(filename, 'latin1').toString('utf8');

  if (!decoded || decoded.includes('\uFFFD')) {
    return filename;
  }

  return decoded;
}
