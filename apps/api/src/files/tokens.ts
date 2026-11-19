export const STORAGE = Symbol('STORAGE');
export const FILE_LIMITS = Symbol('FILE_LIMITS');
export type FileLimits = { maxUploadBytes: number; storageQuotaBytes: number };
