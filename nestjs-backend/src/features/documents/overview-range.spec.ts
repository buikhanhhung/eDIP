import { delta, precedingWindow, resolveRange, toWindow } from './overview-range';

const TODAY = new Date('2026-08-12T09:30:00.000Z');

describe('resolveRange', () => {
  it('defaults to the last 30 days ending today, today included', () => {
    expect(resolveRange(undefined, undefined, TODAY)).toEqual({
      from: '2026-07-14',
      to: '2026-08-12',
    });
  });

  it('keeps both ends when both are given', () => {
    expect(resolveRange('2026-01-01', '2026-03-31', TODAY)).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
    });
  });

  it('falls back to the default span when only the end is given', () => {
    expect(resolveRange(undefined, '2026-03-31', TODAY)).toEqual({
      from: '2026-03-02',
      to: '2026-03-31',
    });
  });

  // A bookmarked URL with a mangled date should still render a dashboard.
  it.each(['', 'yesterday', '2026-8-1', '2026-08-12T00:00:00Z'])(
    'ignores %p rather than failing the request',
    (bad) => {
      expect(resolveRange(bad, bad, TODAY)).toEqual({ from: '2026-07-14', to: '2026-08-12' });
    },
  );

  it('ignores a start that comes after the end, which describes no days', () => {
    expect(resolveRange('2026-08-12', '2026-08-01', TODAY)).toEqual({
      from: '2026-07-03',
      to: '2026-08-01',
    });
  });
});

describe('toWindow', () => {
  it('ends the day after `to`, so the last day is fully included', () => {
    const window = toWindow({ from: '2026-08-01', to: '2026-08-31' });
    expect(window.start.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('covers exactly one day when both ends are the same date', () => {
    const window = toWindow({ from: '2026-08-12', to: '2026-08-12' });
    expect(window.end.getTime() - window.start.getTime()).toBe(86_400_000);
  });
});

describe('precedingWindow', () => {
  it('is the same length and ends where the current one starts', () => {
    const current = toWindow({ from: '2026-07-14', to: '2026-08-12' });
    const previous = precedingWindow(current);

    expect(previous.end).toEqual(current.start);
    expect(previous.start.toISOString()).toBe('2026-06-14T00:00:00.000Z');
    expect(previous.end.getTime() - previous.start.getTime()).toBe(
      current.end.getTime() - current.start.getTime(),
    );
  });
});

describe('delta', () => {
  it('reports the percentage change against the earlier window', () => {
    expect(delta(120, 100)).toEqual({ value: 120, previous: 100, changePct: 20 });
    expect(delta(80, 100)).toEqual({ value: 80, previous: 100, changePct: -20 });
  });

  // The rule that keeps "the first documents ever" from being read as growth.
  it('has no percentage when the earlier window was empty', () => {
    expect(delta(22, 0).changePct).toBeNull();
    expect(delta(0, 0).changePct).toBeNull();
  });

  it('reports a total collapse as -100%', () => {
    expect(delta(0, 22).changePct).toBe(-100);
  });
});
