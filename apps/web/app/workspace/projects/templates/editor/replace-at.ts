export function replaceAt<T>(items: T[], index: number, value: T): T[] { return items.map((item, current) => current === index ? value : item); }
