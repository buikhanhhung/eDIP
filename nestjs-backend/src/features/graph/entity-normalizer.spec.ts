import { coerceEntityType, isEntityType, normalizeEntityName } from './entity-normalizer';

describe('normalizeEntityName', () => {
  it('folds Vietnamese diacritics', () => {
    expect(normalizeEntityName('Công ty Hà Nội Logistics')).toBe('ha noi logistics');
  });

  it('merges the same company written with and without a legal suffix', () => {
    const a = normalizeEntityName('Ecloudvalley Vietnam Ltd');
    const b = normalizeEntityName('ECLOUDVALLEY VIETNAM');
    expect(a).toBe(b);
    expect(a).toBe('ecloudvalley vietnam');
  });

  it('merges across punctuation and spacing noise', () => {
    expect(normalizeEntityName('Saigon Retail, JSC.')).toBe('saigon retail');
    expect(normalizeEntityName('  Saigon   Retail JSC ')).toBe('saigon retail');
  });

  it('does NOT merge two different companies that share a suffix', () => {
    expect(normalizeEntityName('Saigon Retail JSC')).not.toBe(
      normalizeEntityName('Hanoi Retail JSC'),
    );
  });

  it('leaves content words that merely look like suffixes inside a longer word', () => {
    // "cong" must not be eaten by the "co" suffix rule.
    expect(normalizeEntityName('Congress Tower')).toBe('congress tower');
  });

  it('is idempotent', () => {
    const once = normalizeEntityName('Ecloudvalley Vietnam Ltd.');
    expect(normalizeEntityName(once)).toBe(once);
  });

  it('returns empty string for a name made only of suffixes', () => {
    expect(normalizeEntityName('Ltd.')).toBe('');
  });
});

describe('entity types', () => {
  it('recognises department, which the seed corpus uses seven times', () => {
    expect(isEntityType('department')).toBe(true);
  });

  it('keeps an unknown kind rather than dropping it', () => {
    expect(coerceEntityType('spaceship')).toBe('project');
  });

  it('passes known kinds through unchanged', () => {
    for (const t of ['company', 'person', 'project', 'invoice', 'contract', 'date', 'amount']) {
      expect(coerceEntityType(t)).toBe(t);
    }
  });
});
