/**
 * The sign-in provider's profile (verified email and name) for a person, kept for a few minutes. Every page load used to ask
 * Clerk's backend API again, which cost about 300 ms each time and, at scale, would run into Clerk's rate limits. The session
 * token itself is still verified on every request; only these profile details may be up to `ttlMs` old. Only verified profiles
 * are kept, so someone who has just verified their email is never held back by an old answer.
 */
export type CachedProfile = { email: string; fullName: string | null };

export class ProfileCache {
  private readonly entries = new Map<string, { profile: CachedProfile; until: number }>();
  constructor(private readonly ttlMs = 5 * 60_000, private readonly maxEntries = 5_000, private readonly now = () => Date.now()) {}

  get(subject: string): CachedProfile | null {
    const entry = this.entries.get(subject);
    if (!entry) return null;
    if (entry.until <= this.now()) { this.entries.delete(subject); return null; }
    return entry.profile;
  }

  set(subject: string, profile: CachedProfile) {
    this.entries.delete(subject);
    if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value as string); // the oldest goes first
    this.entries.set(subject, { profile, until: this.now() + this.ttlMs });
  }

  forget(subject: string) { this.entries.delete(subject); }
}
