import { InjectQueue } from '@nestjs/bullmq';
import { Body, Controller, Delete, Get, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Audit } from '@common/decorators/audit.decorator';
import {
  CurrentUser,
  Public,
  RequirePermission,
  type AuthUser,
} from '@common/rbac/rbac.decorators';
import type { EnvConfig } from '@config/env.config';
import {
  DRIVE_IMPORT_JOB,
  DRIVE_IMPORT_JOB_OPTIONS,
  QUEUE_NAMES,
} from '@shared/queue/queue.constants';
import type { DriveImportJobData } from './drive-import.consumer';
import { GoogleDriveService } from './google-drive.service';

/**
 * The ceiling on one press, counted after folders are walked out into files.
 *
 * Higher than the old per-file cap because a picked folder is now expanded
 * here rather than clicked through one file at a time — but still a ceiling:
 * every file queues an ingest behind it, and that pipeline spends AI quota.
 */
const MAX_FILES_PER_IMPORT = 200;

/** Deep enough for any real filing, shallow enough to bound the walk. */
const MAX_FOLDER_DEPTH = 10;

/** What the picker hands back, folders included. */
const importSchema = z.object({
  files: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        mimeType: z.string().min(1),
      }),
    )
    .min(1)
    // Bounds the *selection*, not the import: one folder can stand for
    // hundreds of files, and that total is checked after expansion.
    .max(MAX_FILES_PER_IMPORT),
});

class ImportDto extends createZodDto(importSchema) {}

@Controller('connectors/google')
export class ConnectorsController {
  constructor(
    private readonly drive: GoogleDriveService,
    private readonly config: ConfigService<EnvConfig, true>,
    @InjectQueue(QUEUE_NAMES.DRIVE_IMPORT)
    private readonly driveImports: Queue<DriveImportJobData>,
  ) {}

  @RequirePermission('upload')
  @Get('status')
  async status(@CurrentUser() user: AuthUser) {
    return {
      configured: this.drive.configured,
      ...(await this.drive.getConnection(user.id)),
    };
  }

  /** Returns the URL rather than redirecting: the caller is fetch, not a form. */
  @RequirePermission('upload')
  @Get('authorize')
  authorize(@CurrentUser() user: AuthUser) {
    return { url: this.drive.startAuthorization(user.id) };
  }

  /**
   * Google redirects the browser here, so there is no bearer token on the
   * request — the `state` is what proves this callback belongs to an
   * authorization this server started, and it is single-use.
   */
  @Public()
  @Get('callback')
  async callback(
    @Query('state') state: string | undefined,
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const web = this.config.get('WEB_ORIGIN', { infer: true });

    if (error || !state || !code) {
      return res.redirect(`${web}/sources?error=${encodeURIComponent(error ?? 'cancelled')}`);
    }

    try {
      await this.drive.completeAuthorization(state, code);
      return res.redirect(`${web}/sources?connected=google`);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'connection failed';
      return res.redirect(`${web}/sources?error=${encodeURIComponent(message)}`);
    }
  }

  @RequirePermission('upload')
  @Delete('connection')
  async disconnect(@CurrentUser() user: AuthUser) {
    await this.drive.disconnect(user.id);
    return { connected: false };
  }

  @RequirePermission('upload')
  @Get('files')
  list(
    @CurrentUser() user: AuthUser,
    @Query('folderId') folderId?: string,
    @Query('pageToken') pageToken?: string,
  ) {
    return this.drive.listFolder(user.id, folderId || 'root', pageToken);
  }

  /**
   * Everything the browser needs to open Google's own picker.
   *
   * Behind the same permission as an import, because it carries a Drive access
   * token: the picker runs in the page and will not open without one.
   */
  @RequirePermission('upload')
  @Get('picker-config')
  pickerConfig(@CurrentUser() user: AuthUser) {
    return this.drive.pickerConfig(user.id);
  }

  /**
   * Walks the picked selection out into files and queues one job per file.
   *
   * Returns as soon as the work is scheduled rather than when it is done. A
   * picked folder can hold hundreds of files, and fetching them inside this
   * request would be a request that times out — so the files arrive in the
   * library over the following minutes instead, the same way an upload does.
   *
   * Nothing is imported through a second path: each job ends in the same
   * `ingestion.upload` a dropped file uses, so the allowlist, the duplicate
   * check and the ingest queue all still apply.
   */
  @Audit('document.import')
  @RequirePermission('upload')
  @Post('import')
  async import(@CurrentUser() user: AuthUser, @Body() body: ImportDto) {
    const { files, skipped } = await this.drive.expandSelection(user.id, body.files, {
      maxFiles: MAX_FILES_PER_IMPORT,
      maxDepth: MAX_FOLDER_DEPTH,
    });

    await this.driveImports.addBulk(
      files.map((file) => ({
        name: DRIVE_IMPORT_JOB,
        data: {
          ownerId: user.id,
          file: { id: file.id, name: file.name, mimeType: file.mimeType },
        },
        opts: DRIVE_IMPORT_JOB_OPTIONS,
      })),
    );

    return { queued: files.length, skipped };
  }
}
