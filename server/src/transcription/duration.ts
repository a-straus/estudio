import { parseBuffer } from "music-metadata";

/**
 * Injectable audio-duration seam, mirroring SplitAudio: given the raw bytes and
 * the source filename, return the recording's duration in MINUTES. Made a
 * function param (defaulting to the music-metadata impl below) so the upload
 * route and ingestion job are unit-testable with a stub — no real audio file
 * and no system binary required.
 */
export type ReadAudioDurationMinutes = (
  data: Buffer,
  filename: string,
) => Promise<number>;

/**
 * Default duration reader: pure-JS metadata parse (music-metadata), NO ffmpeg /
 * ffprobe. Reads the container/codec headers to recover the duration without
 * decoding the audio. Throws when the file carries no usable duration metadata
 * (e.g. a truncated or non-audio upload) so the boundary can reject it.
 */
export const readAudioDurationMinutes: ReadAudioDurationMinutes = async (
  data,
  filename,
) => {
  const metadata = await parseBuffer(new Uint8Array(data), { path: filename });
  const seconds = metadata.format.duration;
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("could not read a valid audio duration");
  }
  return seconds / 60;
};
