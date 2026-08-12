import { Body, Controller, Delete, Get, Header, Param, Patch, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Audit } from '@common/decorators/audit.decorator';
import { CurrentUser, RequirePermission, type AuthUser } from '@common/rbac/rbac.decorators';
import { DOCUMENT_TYPES } from '@features/ingestion/schemas/analysis.schema';
import { DocumentsService, type ListDocumentsQuery } from './documents.service';
import { resolveRange } from './overview-range';
import { OverviewStatsService } from './overview-stats.service';

/** Every field optional: the panel sends only what the editor changed. */
const metadataPatchSchema = z
  .object({
    title: z.string().min(1).max(500),
    documentType: z.enum(DOCUMENT_TYPES),
    parties: z.array(z.string().min(1)),
    date: z.string().nullable(),
    amount: z.string().nullable(),
    keywords: z.array(z.string().min(1)),
  })
  .partial();

class MetadataPatchDto extends createZodDto(metadataPatchSchema) {}

@Controller()
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly overview: OverviewStatsService,
  ) {}

  @RequirePermission('view')
  @Get('documents')
  list(@Query() query: ListDocumentsQuery) {
    return this.documents.list({
      ...query,
      take: query.take ? Number(query.take) : undefined,
      skip: query.skip ? Number(query.skip) : undefined,
    });
  }

  /**
   * Declared before `documents/:id` so the literal wins the route match —
   * otherwise "export" is read as a document id and every export 404s.
   */
  @Audit('document.export')
  @RequirePermission('view')
  @Get('documents/export')
  async export(@Query() query: ListDocumentsQuery, @Res() res: Response) {
    const csv = await this.documents.exportCsv({
      ...query,
      take: undefined,
      skip: undefined,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="edip-metadata-${stamp}.csv"`);
    res.send(csv);
  }

  @Audit('document.view')
  @RequirePermission('view')
  @Get('documents/:id')
  findOne(@Param('id') id: string) {
    return this.documents.findOne(id);
  }

  @Audit('document.edit-metadata')
  @RequirePermission('edit-metadata')
  @Patch('documents/:id/metadata')
  updateMetadata(
    @Param('id') id: string,
    @Body() body: MetadataPatchDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documents.updateMetadata(id, body, user.id);
  }

  @Audit('document.delete')
  @RequirePermission('delete')
  @Delete('documents/:id')
  remove(@Param('id') id: string) {
    return this.documents.remove(id);
  }

  /** Polled by the upload page while a job runs. */
  @RequirePermission('view')
  @Get('documents/:id/status')
  status(@Param('id') id: string) {
    return this.documents.status(id);
  }

  @Audit('document.download')
  @RequirePermission('download')
  @Header('X-Content-Type-Options', 'nosniff')
  @Get('documents/:id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const file = await this.documents.download(id);
    res.setHeader('Content-Type', file.mimeType);
    // Always an attachment: nothing uploaded here is ever rendered by the
    // browser in this origin's context.
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.send(file.buffer);
  }

  /**
   * Everything the overview page draws, for one window of time.
   *
   * Behind `view` rather than public: the type breakdown is a summary of the
   * corpus. The window defaults to the last 30 days ending today, so a caller
   * that passes nothing still gets a well-defined range rather than "all time
   * except the parts that were filtered".
   */
  @RequirePermission('view')
  @Get('stats')
  stats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.overview.build(resolveRange(from, to));
  }
}
