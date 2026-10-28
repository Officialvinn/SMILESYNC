/**
 * FR 3.3: turns a camera photo into a compressed JPEG held in memory, then
 * deletes every temporary file. The bytes go straight into the encrypted
 * database, so no unencrypted photo is left on the phone (NFR 1).
 */
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { compressToLimit, resizeFor } from '../core/compression';
import { toHex } from '../core/hex';

export interface CameraPhoto {
  uri: string;
  width: number;
  height: number;
}

export interface ProcessedPhoto {
  bytes: Uint8Array;
  sha256: string;
}

function deleteQuietly(target: File | Directory): void {
  try {
    if (target.exists) target.delete();
  } catch {
    // Best effort: startup cleanup tries again.
  }
}

export function discardPhoto(photo: CameraPhoto): void {
  deleteQuietly(new File(photo.uri));
}

export async function processPhoto(photo: CameraPhoto): Promise<ProcessedPhoto> {
  try {
    const { bytes } = await compressToLimit(async (step) => {
      const context = ImageManipulator.manipulate(photo.uri);
      const size = resizeFor(photo.width, photo.height, step.maxEdge);
      if (size) context.resize(size);
      const image = await context.renderAsync();
      try {
        const saved = await image.saveAsync({ compress: step.quality, format: SaveFormat.JPEG });
        const file = new File(saved.uri);
        try {
          return await file.bytes();
        } finally {
          deleteQuietly(file);
        }
      } finally {
        image.release();
        context.release();
      }
    });
    const hash = await digest(CryptoDigestAlgorithm.SHA256, bytes);
    return { bytes, sha256: toHex(new Uint8Array(hash)) };
  } finally {
    discardPhoto(photo);
  }
}

/**
 * Deletes temporary photos left by a crash or a killed app. expo-camera and
 * expo-image-manipulator write to these cache folders on iOS and Android.
 */
export function cleanUpTemporaryPhotos(): void {
  for (const name of ['Camera', 'ImageManipulator']) deleteQuietly(new Directory(Paths.cache, name));
}
