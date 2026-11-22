export const PUSH_SETTINGS = Symbol('PUSH_SETTINGS');
export const APNS = Symbol('APNS');
export type PushSettings = { publicKey: string; privateKey: string; subject: string; /** Only for tests and local development. */ allowPrivate: boolean };
