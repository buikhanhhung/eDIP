import { BadRequestException } from '@nestjs/common';
import type { AuthUser } from '@common/rbac/rbac.decorators';
import { IngestionController } from './ingestion.controller';

const user = { id: 'owner-1' } as AuthUser;
const file = { originalname: 'hop-dong.txt', buffer: Buffer.from('nội dung'), size: 8 };

function controllerWithStub() {
  const upload = jest.fn().mockResolvedValue({ id: 'doc-1' });
  const controller = new IngestionController({ upload } as never);
  return { controller, upload };
}

describe('IngestionController.upload', () => {
  it('refuses an unknown strategy before a document row exists', async () => {
    const { controller, upload } = controllerWithStub();

    await expect(controller.upload(file, 'KHONG_TON_TAI', user)).rejects.toThrow(
      BadRequestException,
    );
    // The refusal has to come before the write, or a rejected upload still
    // leaves a row and a queued job behind.
    expect(upload).not.toHaveBeenCalled();
  });

  it('says which values it would have accepted', async () => {
    const { controller } = controllerWithStub();

    await expect(controller.upload(file, 'KHONG_TON_TAI', user)).rejects.toThrow(
      /RECURSIVE_CHARACTER/,
    );
  });

  it('passes a valid strategy through to the service', async () => {
    const { controller, upload } = controllerWithStub();

    await controller.upload(file, 'RECURSIVE_CHARACTER', user);

    expect(upload).toHaveBeenCalledWith(
      expect.anything(),
      'owner-1',
      'upload',
      'RECURSIVE_CHARACTER',
    );
  });

  it('applies the default when the field is absent', async () => {
    const { controller, upload } = controllerWithStub();

    await controller.upload(file, undefined, user);

    expect(upload).toHaveBeenCalledWith(
      expect.anything(),
      'owner-1',
      'upload',
      'RECURSIVE_CHARACTER',
    );
  });

  it('still refuses a request with no file at all', async () => {
    const { controller, upload } = controllerWithStub();

    await expect(controller.upload(undefined, undefined, user)).rejects.toThrow(
      BadRequestException,
    );
    expect(upload).not.toHaveBeenCalled();
  });
});
