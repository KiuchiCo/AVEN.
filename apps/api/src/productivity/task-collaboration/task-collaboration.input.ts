import { BadRequestException } from '@nestjs/common';

export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Request body must be an object.');
  return value as Record<string, unknown>;
}

export function cleanText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string') throw new BadRequestException(`${label} is required.`);
  const result = value.trim();
  if (!result || result.length > maximum) throw new BadRequestException(`${label} must be between 1 and ${maximum} characters.`);
  return result;
}

export function memberIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20 || value.some((id) => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) {
    throw new BadRequestException('Choose up to 20 valid workspace members to mention.');
  }
  return [...new Set(value as string[])];
}

export function checklistPosition(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 999) throw new BadRequestException('Checklist position must be a whole number from 0 to 999.');
  return value;
}
