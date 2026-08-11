/**
 * Injection token for the graph store.
 *
 * The indirection is not decoration: the day-2 plan is a FalkorDB adapter
 * implementing the same interface, swapped by changing one line in
 * `graph.module.ts`. Everything upstream depends on the token, not the class.
 */
export const GRAPH_STORE = Symbol('GRAPH_STORE');
