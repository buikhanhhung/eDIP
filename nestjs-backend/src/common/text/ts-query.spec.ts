import { buildOrTsQuery } from './ts-query';

describe('buildOrTsQuery', () => {
  it('joins terms with OR so one filler word cannot empty the results', () => {
    // The failure this replaced: plainto_tsquery ANDs every term, and no
    // document contains "voi", so the whole query returned nothing.
    expect(buildOrTsQuery('hợp đồng với Saigon Retail')).toBe('hop | dong | voi | saigon | retail');
  });

  it('folds accents the same way the indexed column does', () => {
    expect(buildOrTsQuery('Hồ Sơ')).toBe('ho | so');
  });

  it('strips characters to_tsquery would read as operators', () => {
    expect(buildOrTsQuery('hợp-đồng & !invoice')).toBe('hopdong | invoice');
  });

  it('de-duplicates repeated terms', () => {
    expect(buildOrTsQuery('hop hop dong')).toBe('hop | dong');
  });

  it('returns an empty string when nothing searchable is left', () => {
    expect(buildOrTsQuery('!!! ???')).toBe('');
    expect(buildOrTsQuery('   ')).toBe('');
  });
});
