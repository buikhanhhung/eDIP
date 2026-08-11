import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Audit } from '@common/decorators/audit.decorator';
import { CurrentUser, RequirePermission, type AuthUser } from '@common/rbac/rbac.decorators';
import { IngestionService, type UploadedFile as MultipartFile } from './ingestion.service';

/** 20 MB. Enforced by multer before the buffer is fully read. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

@Controller('documents')
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  @Audit('document.upload')
  @RequirePermission('upload')
  @HttpCode(HttpStatus.ACCEPTED)
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(@UploadedFile() file: MultipartFile | undefined, @CurrentUser() user: AuthUser) {
    if (!file) throw new BadRequestException('No file was uploaded under the field "file"');

    return this.ingestion.upload(
      { originalname: file.originalname, buffer: file.buffer, size: file.size },
      user.id,
    );
  }
}
