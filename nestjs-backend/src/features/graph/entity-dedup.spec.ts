import {
  DEFAULT_DEDUP_THRESHOLD,
  MIN_VECTOR_DEDUP_LENGTH,
  decideDedupe,
  type VectorMatch,
} from './entity-dedup';

const candidate = { name: 'Ecloudvalley Vietnam', type: 'company' };
const near = (similarity: number, type = 'company'): VectorMatch => ({
  entityId: 'e1',
  similarity,
  type,
});

describe('decideDedupe', () => {
  it('reuses the node on an exact key match, without consulting the vector index', () => {
    const plan = decideDedupe(candidate, { entityId: 'exact' }, near(0.1));
    expect(plan).toEqual({ action: 'REUSE', matchedEntityId: 'exact', reason: 'exact-match' });
  });

  it('folds a near-identical spelling into the existing node', () => {
    const plan = decideDedupe(candidate, null, near(0.97));
    expect(plan.action).toBe('MERGE_AS_ALIAS');
    expect(plan.matchedEntityId).toBe('e1');
  });

  it('creates rather than merging when similarity is below the threshold', () => {
    const plan = decideDedupe(candidate, null, near(DEFAULT_DEDUP_THRESHOLD - 0.01));
    expect(plan.action).toBe('CREATE');
    expect(plan.reason).toBe('vector-below-threshold');
  });

  it('never merges across types, however close the names are', () => {
    // `Atlas` the project and `Atlas` the company are different things; merging
    // them would corrupt every edge attached to either.
    const plan = decideDedupe({ name: 'Atlas', type: 'project' }, null, near(0.99, 'company'));
    expect(plan.action).toBe('CREATE');
    expect(plan.reason).toBe('vector-type-mismatch');
  });

  it('skips the vector index for short names, which over-merge', () => {
    const plan = decideDedupe({ name: 'ECV', type: 'company' }, null, near(0.99));
    expect(plan.action).toBe('CREATE');
    expect(plan.reason).toContain('name-too-short');
  });

  it('applies the length gate to the normalised name, not the raw one', () => {
    // "Co., Ltd" normalises away to nothing — the gate must see the result.
    const plan = decideDedupe({ name: 'Co., Ltd', type: 'company' }, null, near(0.99));
    expect(plan.action).toBe('CREATE');
    expect(plan.reason).toContain('name-too-short');
  });

  it('creates when there is no neighbour at all', () => {
    expect(decideDedupe(candidate, null, null)).toEqual({
      action: 'CREATE',
      reason: 'vector-no-match',
    });
  });

  it('keeps the gate above the length of common acronyms', () => {
    expect(MIN_VECTOR_DEDUP_LENGTH).toBeGreaterThan(3);
  });
});
