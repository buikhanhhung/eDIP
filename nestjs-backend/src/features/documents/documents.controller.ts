import { Controller, Get, Header, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RequirePermission } from '@common/rbac/rbac.decorators';
import { DocumentsService, type ListDocumentsQuery } from './documents.service';

@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @RequirePermission('view')
  @Get('documents')
  list(@Query() query: ListDocumentsQuery) {
    return this.documents.list({
      ...query,
      take: query.take ? Number(query.take) : undefined,
      skip: query.skip ? Number(query.skip) : undefined,
    });
  }

  @RequirePermission('view')
  @Get('documents/:id')
  findOne(@Param('id') id: string) {
    return this.documents.findOne(id);
  }

  /** Polled by the upload page while a job runs. */
  @RequirePermission('view')
  @Get('documents/:id/status')
  status(@Param('id') id: string) {
    return this.documents.status(id);
  }

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
   * Carries the same counts the dashboard shows. Behind `view` rather than
   * public: the type breakdown is a summary of the corpus.
   */
  @RequirePermission('view')
  @Get('stats')
  stats() {
    return this.documents.stats();
  }
}
