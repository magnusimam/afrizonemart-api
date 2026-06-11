/**
 * Magic-byte sniffer for audio uploads — the audio sibling of
 * `sniff.ts`. Same rationale (audit H8): never trust the client's
 * Content-Type. We read the first bytes off the buffer and only
 * accept files whose header matches a known audio container, then
 * use the detected MIME for both storage Content-Type and extension.
 *
 * Supported: MP3 (ID3 + raw frame sync), WAV (RIFF/WAVE),
 * OGG, M4A/MP4-audio (ftyp), AAC (ADTS).
 */

export type SniffedAudioMime =
  | 'audio/mpeg' // mp3
  | 'audio/wav' // wav
  | 'audio/ogg' // ogg / opus
  | 'audio/mp4' // m4a / mp4 audio
  | 'audio/aac'; // raw AAC (ADTS)

/**
 * Returns the detected audio MIME or null if the buffer doesn't
 * match a supported format. Reads up to the first 16 bytes.
 */
export function sniffAudioMime(buf: Buffer): SniffedAudioMime | null {
  if (buf.length < 4) return null;

  // MP3 with ID3v2 tag: ASCII "ID3"
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    return 'audio/mpeg';
  }

  // MP3 raw frame sync: 0xFF followed by 0xEx or 0xFx (MPEG audio).
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
    // ADTS AAC also starts 0xFF 0xF? — distinguish by the layer bits.
    // ADTS: 0xFF 0xF1 / 0xF9. Treat those as AAC, the rest as MP3.
    if (buf[1] === 0xf1 || buf[1] === 0xf9) return 'audio/aac';
    return 'audio/mpeg';
  }

  // WAV: "RIFF" .... "WAVE"
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && // R
    buf[1] === 0x49 && // I
    buf[2] === 0x46 && // F
    buf[3] === 0x46 && // F
    buf[8] === 0x57 && // W
    buf[9] === 0x41 && // A
    buf[10] === 0x56 && // V
    buf[11] === 0x45 // E
  ) {
    return 'audio/wav';
  }

  // OGG: "OggS"
  if (
    buf[0] === 0x4f &&
    buf[1] === 0x67 &&
    buf[2] === 0x67 &&
    buf[3] === 0x53
  ) {
    return 'audio/ogg';
  }

  // M4A / MP4 audio: bytes 4..7 = "ftyp", brand in {M4A , mp42, isom, mp41}.
  if (
    buf.length >= 12 &&
    buf[4] === 0x66 && // f
    buf[5] === 0x74 && // t
    buf[6] === 0x79 && // y
    buf[7] === 0x70 // p
  ) {
    const brand = buf.toString('ascii', 8, 12).toLowerCase();
    if (
      brand === 'm4a ' ||
      brand === 'mp42' ||
      brand === 'mp41' ||
      brand === 'isom'
    ) {
      return 'audio/mp4';
    }
  }

  return null;
}
