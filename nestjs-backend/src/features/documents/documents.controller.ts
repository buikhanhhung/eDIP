import { Controller, Get, Param, Query } from '@nestjs/common';
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
