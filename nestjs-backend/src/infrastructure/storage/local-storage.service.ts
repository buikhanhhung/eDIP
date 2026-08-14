import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@config/env.config';
import { extensionOf } from './allowlist';

/**
 * Files on local disk. No S3 today.
 *
 * The stored name is always a fresh UUID plus the extension — the client's
 * filename never reaches the filesystem. A multipart part named
 * `../../.env` would otherwise resolve outside STORAGE_DIR and overwrite the
 * file holding JWT_SECRET. The containment check below is the second layer,
 * kept because the first one is a single line that a later edit could drop.
 */
@Injectable()
export class LocalStorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly root: string;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.root = path.resolve(this.config.get('STORAGE_DIR', { infer: true }));
  }

  /** Returns the storage-relative path to record on the document. */
  async save(buffer: Buffer, originalName: string): Promise<string> {
    const extension = extensionOf(originalName);
    const name = extension ? `${randomUUID()}.${extension}` : randomUUID();
    const target = this.resolveWithin(name);

    await mkdir(this.root, { recursive: true });
    await writeFile(target, buffer);
    this.logger.log(`stored ${originalName} as ${name} (${buffer.length} bytes)`);

    return path.posix.join('storage', name);
  }

  async read(storagePath: string): Promise<Buffer> {
    return readFile(this.resolveWithin(path.basename(storagePath)));
  }

  /** Missing file is not an error: the DB row is the record of truth. */
  async remove(storagePath: string): Promise<void> {
    try {
      await unlink(this.resolveWithin(path.basename(storagePath)));
    } catch (error) {
      this.logger.warn(`could not delete ${storagePath}: ${(error as Error).message}`);
    }
  }

  private resolveWithin(name: string): string {
    const target = path.resolve(this.root, name);
    if (target !== this.root && !target.startsWith(this.root + path.sep)) {
      throw new Error(`Refusing to touch a path outside the storage directory: ${name}`);
    }
    return target;
  }
}
