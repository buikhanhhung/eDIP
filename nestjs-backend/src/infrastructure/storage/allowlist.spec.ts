import { allowedTypeFor, downloadMimeFor, extensionOf } from './allowlist';

describe('upload allowlist', () => {
  it('derives the type from the extension', () => {
    expect(allowedTypeFor('hop-dong.pdf')).toEqual({ tier: 'pdf', mime: 'application/pdf' });
    expect(allowedTypeFor('scan.JPG')).toEqual({ tier: 'image', mime: 'image/jpeg' });
  });

  it('rejects anything not listed', () => {
    for (const name of ['payload.exe', 'script.sh', 'legacy.doc', 'noextension']) {
      expect(allowedTypeFor(name)).toBeNull();
    }
  });

  it('reads only the final extension, so a double extension cannot smuggle a type', () => {
    expect(extensionOf('invoice.pdf.exe')).toBe('exe');
    expect(allowedTypeFor('invoice.pdf.exe')).toBeNull();
  });

  it('treats a traversal filename as a name, not a path', () => {
    // The stored name is a fresh UUID regardless; this only asserts that the
    // extension parse does not follow the path segments.
    expect(extensionOf('../../.env')).toBe('env');
    expect(allowedTypeFor('../../.env')).toBeNull();
  });

  it('serves markup as text so an uploaded page cannot run in this origin', () => {
    expect(downloadMimeFor('stored.html')).toBe('text/plain; charset=utf-8');
    expect(downloadMimeFor('stored.xml')).toBe('text/plain; charset=utf-8');
    expect(downloadMimeFor('stored.pdf')).toBe('application/pdf');
  });

  it('falls back to octet-stream for an unknown extension', () => {
    expect(downloadMimeFor('mystery.bin')).toBe('application/octet-stream');
  });
});
