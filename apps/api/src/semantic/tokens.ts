import type { Embeddings } from './embeddings.js';
export const EMBEDDINGS = Symbol('EMBEDDINGS');
export type OptionalEmbeddings = Embeddings | null;
