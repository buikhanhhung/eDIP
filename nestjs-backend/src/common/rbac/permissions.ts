/**
 * The role model, ported from eDIP v1 (`src/lib/roles.ts`).
 *
 * A role is only ever read from a stored user record. There is no default role
 * and no way for a client to assert one; a request without a valid token is
 * refused outright at the guard rather than falling back to a role.
 *
 * `download` is separate from `view` on purpose: a viewer may read a document's
 * extracted text but must not fetch the original file, which can carry
 * identifying detail the extraction does not surface.
 */
export type Role = 'admin' | 'user' | 'viewer';

export const PERMISSIONS = {
  admin: ['upload', 'edit-metadata', 'delete', 'view', 'search', 'ask', 'audit', 'download'],
  user: ['view', 'search', 'ask', 'download'],
  viewer: ['view'],
} as const satisfies Record<Role, readonly string[]>;

export type Permission = (typeof PERMISSIONS)[Role][number];

export const ALL_PERMISSIONS: readonly Permission[] = [
  'view',
  'search',
  'ask',
  'download',
  'upload',
  'edit-metadata',
  'delete',
  'audit',
] as const;

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin — upload, edit, delete',
  user: 'User — search, view, ask AI',
  viewer: 'Viewer — read only',
};

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[role] as readonly string[]).includes(permission);
}
