import { foldForMatching } from '@common/text/fold-accents';
import { buildSnippet } from './snippet';

const OPENING = 'Tài liệu này mở đầu bằng một đoạn giới thiệu dài dòng. '.repeat(4);
const BODY = 'Bên B là Saigon Retail JSC, trụ sở tại Quận 1. ';
const TAIL = 'Các điều khoản còn lại không liên quan. '.repeat(4);
const TEXT = OPENING + BODY + TAIL;

describe('foldForMatching', () => {
  // Expectations copied from the running database, not from intuition:
  //   SELECT immutable_unaccent('Hợp Đồng') -> 'Hop Dong'
  it.each([
    ['Hợp Đồng', 'hop dong'],
    ['đồng', 'dong'],
    ['Đông Nam Á', 'dong nam a'],
  ])('folds %s like immutable_unaccent', (input, expected) => {
    expect(foldForMatching(input)).toBe(expected);
  });

  it('preserves length, so a folded index addresses the original string', () => {
    const source = 'Hợp đồng dịch vụ';
    expect(foldForMatching(source)).toHaveLength(source.length);
  });
});

describe('buildSnippet', () => {
  it('returns the passage around the match, not the opening of the document', () => {
    const snippet = buildSnippet(TEXT, 'Saigon Retail');
    expect(snippet.text).toContain('Saigon Retail');
    expect(snippet.text.startsWith('Tài liệu này mở đầu')).toBe(false);
  });

  it('finds an accented passage from an unaccented query', () => {
    const snippet = buildSnippet('Đây là hợp đồng dịch vụ giữa hai bên.', 'hop dong');
    expect(snippet.matchStart).not.toBeNull();
    expect(snippet.text.slice(snippet.matchStart!, snippet.matchEnd!)).toBe('hợp');
  });

  it('gives different queries different snippets', () => {
    const first = buildSnippet(TEXT, 'Saigon Retail');
    const second = buildSnippet(TEXT, 'giới thiệu');
    expect(first.text).not.toBe(second.text);
  });

  it('reports offsets relative to the returned text, including the ellipsis', () => {
    const snippet = buildSnippet(TEXT, 'Saigon');
    expect(snippet.text.slice(snippet.matchStart!, snippet.matchEnd!)).toBe('Saigon');
  });

  it('falls back to the head with no match range when nothing matches', () => {
    const snippet = buildSnippet(TEXT, 'zzzz');
    expect(snippet.matchStart).toBeNull();
    expect(snippet.matchEnd).toBeNull();
    expect(snippet.text.length).toBeGreaterThan(0);
  });

  it('handles empty text without throwing', () => {
    expect(buildSnippet('', 'anything')).toEqual({ text: '', matchStart: null, matchEnd: null });
  });

  it('ignores one-character noise terms', () => {
    const snippet = buildSnippet('Bên B là Saigon Retail JSC.', 'b');
    expect(snippet.matchStart).toBeNull();
  });
});
