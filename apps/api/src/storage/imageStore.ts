/**
 * NFR 1 + FR 5.2: encrypted image files on disk.
 *
 *   incoming/<uploaderId>/<imageId>.bin   uploaded, case not stored yet
 *   images/<imageId>.bin                  part of a stored case
 *
 * Incoming files are kept per uploader, so one CHW cannot claim another's
 * upload. Files are written to a temporary name and renamed, so a half-written
 * file is never read. Each file is AES-256-GCM with the image id as
 * associated data.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FieldCrypto } from '../security/fieldCrypto.js';

export class ImageStore {
  constructor(
    private readonly root: string,
    private readonly crypto: FieldCrypto,
  ) {}

  /** The path stored in OralImage.filePath, relative to the storage root. */
  static finalKey(imageId: string): string {
    return `images/${imageId}.bin`;
  }

  private incoming(uploaderId: string, imageId: string): string {
    return join(this.root, 'incoming', uploaderId, `${imageId}.bin`);
  }

  private async writeAtomic(path: string, data: Buffer): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${randomUUID()}.tmp`;
    await writeFile(tmp, data, { mode: 0o600 });
    await rename(tmp, path);
  }

  async putIncoming(uploaderId: string, imageId: string, bytes: Uint8Array): Promise<void> {
    await this.writeAtomic(this.incoming(uploaderId, imageId), this.crypto.encryptBytes(bytes, imageId));
  }

  /** Decrypted bytes of an incoming upload, or null if there is none (or it is damaged). */
  async readIncoming(uploaderId: string, imageId: string): Promise<Buffer | null> {
    let data: Buffer;
    try {
      data = await readFile(this.incoming(uploaderId, imageId));
    } catch {
      return null;
    }
    try {
      return this.crypto.decryptBytes(data, imageId);
    } catch {
      return null;
    }
  }

  /** Moves an incoming file into place for a stored case. */
  async promote(uploaderId: string, imageId: string): Promise<string> {
    const key = ImageStore.finalKey(imageId);
    const target = join(this.root, key);
    await mkdir(dirname(target), { recursive: true });
    await rename(this.incoming(uploaderId, imageId), target);
    return key;
  }

  /** Decrypted bytes of a stored image (dentist download, Sprint 3). */
  async read(key: string, imageId: string): Promise<Buffer> {
    return this.crypto.decryptBytes(await readFile(join(this.root, key)), imageId);
  }
}
