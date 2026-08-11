import { ALL_PERMISSIONS, can, type Permission, type Role } from './permissions';

/**
 * The full 3 roles x 8 permissions matrix, written out by hand rather than
 * derived from PERMISSIONS — a test that recomputes the thing it is testing
 * proves nothing. Ported from eDIP v1, which shipped the same table.
 */
const EXPECTED: Record<Role, Record<Permission, boolean>> = {
  admin: {
    view: true,
    search: true,
    ask: true,
    download: true,
    upload: true,
    'edit-metadata': true,
    delete: true,
    audit: true,
  },
  user: {
    view: true,
    search: true,
    ask: true,
    download: true,
    upload: false,
    'edit-metadata': false,
    delete: false,
    audit: false,
  },
  viewer: {
    view: true,
    search: false,
    ask: false,
    download: false,
    upload: false,
    'edit-metadata': false,
    delete: false,
    audit: false,
  },
};

describe('RBAC permission matrix', () => {
  const roles = Object.keys(EXPECTED) as Role[];

  it('covers every role and permission (24 cases)', () => {
    expect(roles).toHaveLength(3);
    expect(ALL_PERMISSIONS).toHaveLength(8);
  });

  for (const role of Object.keys(EXPECTED) as Role[]) {
    for (const permission of ALL_PERMISSIONS) {
      const expected = EXPECTED[role][permission];
      it(`${role} ${expected ? 'can' : 'cannot'} ${permission}`, () => {
        expect(can(role, permission)).toBe(expected);
      });
    }
  }

  it('viewer holds exactly one permission', () => {
    const held = ALL_PERMISSIONS.filter((p) => can('viewer', p));
    expect(held).toEqual(['view']);
  });

  it('separates download from view so a viewer cannot fetch originals', () => {
    expect(can('viewer', 'view')).toBe(true);
    expect(can('viewer', 'download')).toBe(false);
  });

  it('gives no write permission to a non-admin role', () => {
    for (const role of ['user', 'viewer'] as Role[]) {
      expect(can(role, 'upload')).toBe(false);
      expect(can(role, 'edit-metadata')).toBe(false);
      expect(can(role, 'delete')).toBe(false);
    }
  });
});
