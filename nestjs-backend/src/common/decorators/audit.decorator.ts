import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'edip:audit';

/**
 * Marks a route for the audit trail. The interceptor records it after the
 * handler succeeds, so a rejected request never appears as a completed action.
 *
 * Declared per-route rather than by scattering `auditService.log()` calls: the
 * action name then sits next to the permission it belongs with, and a route
 * cannot half-log by returning early down one branch.
 */
export const Audit = (action: string) => SetMetadata(AUDIT_KEY, action);
