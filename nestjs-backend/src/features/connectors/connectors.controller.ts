import { Body, ConflictException, Controller, Delete, Get, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Audit } from '@common/decorators/audit.decorator';
import { CurrentUser, Public, RequirePermission, type AuthUser } from '@common/rbac/rbac.decorators';
import type { EnvConfig } from '@config/env.config';
import { IngestionService } from '@features/ingestion/ingestion.service';
import { GoogleDriveService } from './google-drive.service';

/** Enough per press that a demo moves, few enough that the AI quota survives. */
const MAX_FILES_PER_IMPORT = 20;

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
    .max(MAX_FILES_PER_IMPORT),
});

class ImportDto extends createZodDto(importSchema) {}

@Controller('connectors/google')
export class ConnectorsController {
  constructor(
    private readonly drive: GoogleDriveService,
    private readonly ingestion: IngestionService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @RequirePermission('upload')
  @Get('status')
  async status(@CurrentUser() user: AuthUser) {
    return { configured: this.drive.configured, ...(await this.drive.getConnection(user.id)) };
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
   * Pulls each file and hands it to the same upload path a browser uses, so an
   * import gets the allowlist, the duplicate check and the ingest queue
   * without a second implementation of any of them.
   *
   * One file failing does not stop the rest: a selection of twenty should not
   * be lost to one document whose sharing was revoked this morning.
   */
  @Audit('document.import')
  @RequirePermission('upload')
  @Post('import')
  async import(@CurrentUser() user: AuthUser, @Body() body: ImportDto) {
    const results = [];

    for (const file of body.files) {
      try {
        const { filename, bytes } = await this.drive.fetchFile(user.id, file);
        const document = await this.ingestion.upload(
          { originalname: filename, buffer: bytes, size: bytes.length },
          user.id,
          'google_drive',
        );
        results.push({ driveId: file.id, name: file.name, status: 'queued', document });
      } catch (failure) {
        const duplicate = failure instanceof ConflictException;
        results.push({
          driveId: file.id,
          name: file.name,
          status: duplicate ? 'duplicate' : 'failed',
          error: failure instanceof Error ? failure.message : 'import failed',
        });
      }
    }

    return { results };
  }
}
