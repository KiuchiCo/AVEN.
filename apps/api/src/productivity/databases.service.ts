import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { PrismaService } from '../database/prisma.service.js';
import { computeRollup, parseBulkIds, rollupFunctions, type RollupFunction } from './database-records.js';
import { parseBaseUpdatedAt, recordConflict } from './document-concurrency.js';

@Injectable()
export class DatabasesService {
  constructor(private readonly prisma: PrismaService, private readonly entitlements: EntitlementsService) {}

  /** Most records per database that the plain list sends. Past it `hasMore` is true and `recordTotal` says how many there are; the records endpoint pages through all of them. */
  static readonly listRecordCap = 2000;

  /**
   * The databases with their views, properties and record counts, and up to `recordLimit` of each one's newest records (0 sends none: the Databases page then asks for pages itself).
   * `recordTotal` is always the real number of records, so nothing is ever silently left out.
   */
  async list(identity: AuthenticatedIdentity, workspaceId: string, recordLimitRaw?: string) {
    await this.requireMembership(identity, workspaceId);
    const requested = recordLimitRaw === undefined || recordLimitRaw === '' ? DatabasesService.listRecordCap : Number(recordLimitRaw);
    if (!Number.isInteger(requested) || requested < 0) throw new BadRequestException('recordLimit must be a whole number of 0 or more.');
    const recordLimit = Math.min(requested, DatabasesService.listRecordCap);
    const databases = await this.prisma.workspaceDatabase.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      include: {
        records: { orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: recordLimit, include: { outgoingLinks: { select: { propertyId: true, targetRecordId: true } } } },
        views: { orderBy: { createdAt: 'asc' } },
        _count: { select: { records: true } },
      },
    });
    const withRecords = databases.map(({ _count, records, ...database }) => ({ ...database, records, recordTotal: _count.records }));
    const linkSource = await this.loadRollupSource(workspaceId, withRecords);
    return withRecords.map((database) => ({
      ...database,
      hasMore: database.recordTotal > database.records.length,
      records: database.records.map((record) => this.withRelationValues(record, database.properties, linkSource)),
    }));
  }

  static readonly pageSizes = [25, 50, 100, 200, 500] as const;

  /**
   * One page of a database's records, sorted and searched on the server across ALL of them. Formulas and rollups are worked out per record on the server, so a page
   * holds correct values; totals (`total`, `pageCount`) are counts over every matching record, never over the page.
   */
  async listRecords(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string, query: { page?: string; pageSize?: string; q?: string; sort?: string; dir?: string }) {
    await this.requireMembership(identity, workspaceId);
    const database = await this.prisma.workspaceDatabase.findFirst({ where: { id: databaseId, workspaceId }, select: { id: true, properties: true } });
    if (!database) throw new NotFoundException('Database not found in this workspace.');
    const pageSize = query.pageSize === undefined || query.pageSize === '' ? 50 : Number(query.pageSize);
    if (!(DatabasesService.pageSizes as readonly number[]).includes(pageSize)) throw new BadRequestException(`pageSize must be one of ${DatabasesService.pageSizes.join(', ')}.`);
    const page = query.page === undefined || query.page === '' ? 1 : Number(query.page);
    if (!Number.isInteger(page) || page < 1 || page > 1_000_000) throw new BadRequestException('page must be a whole number of 1 or more.');
    const search = query.q?.trim() ?? '';
    if (search.length > 200) throw new BadRequestException('Search can be up to 200 characters.');
    const direction = query.dir === 'desc' ? 'desc' : query.dir === undefined || query.dir === '' || query.dir === 'asc' ? 'asc' : null;
    if (!direction) throw new BadRequestException('dir must be asc or desc.');
    const properties = propertyList(database.properties);
    const sortKey = query.sort ?? 'updatedAt';
    const sortProperty = properties.find((property) => property.id === sortKey);
    if (sortKey !== 'updatedAt' && sortKey !== 'createdAt' && !(sortProperty && ['text', 'number', 'checkbox', 'date', 'status'].includes(sortProperty.type))) throw new BadRequestException('Sort by a stored property, updatedAt or createdAt.');

    const where = Prisma.sql`"workspaceId" = ${workspaceId}::uuid AND "databaseId" = ${databaseId}::uuid${search ? Prisma.sql` AND EXISTS (SELECT 1 FROM jsonb_each_text(values) AS cell WHERE cell.value ILIKE ${`%${search.replace(/[\\%_]/g, '\\$&')}%`})` : Prisma.empty}`;
    const dir = direction === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const order = sortKey === 'updatedAt' || sortKey === 'createdAt'
      ? Prisma.sql`${sortKey === 'updatedAt' ? Prisma.sql`"updatedAt"` : Prisma.sql`"createdAt"`} ${dir}`
      : sortProperty!.type === 'number' ? Prisma.sql`(CASE WHEN values ->> ${sortKey}::text ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (values ->> ${sortKey}::text)::numeric END) ${dir} NULLS LAST`
      : sortProperty!.type === 'checkbox' ? Prisma.sql`(values ->> ${sortKey}::text) ${dir} NULLS LAST`
      : Prisma.sql`lower(values ->> ${sortKey}::text) ${dir} NULLS LAST`;
    const [idRows, totalRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM database_records WHERE ${where} ORDER BY ${order}, "updatedAt" DESC, id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
      this.prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT count(*) AS n FROM database_records WHERE ${where}`),
    ]);
    const total = Number(totalRows[0]?.n ?? 0);
    const found = await this.prisma.databaseRecord.findMany({ where: { id: { in: idRows.map((row) => row.id) }, workspaceId, databaseId }, include: { outgoingLinks: { select: { propertyId: true, targetRecordId: true } } } });
    const byId = new Map(found.map((record) => [record.id, record]));
    const ordered = idRows.flatMap((row) => { const record = byId.get(row.id); return record ? [record] : []; });
    const linkSource = await this.loadRollupSource(workspaceId, [{ properties: database.properties, records: ordered }]);
    return { records: ordered.map((record) => this.withRelationValues(record, database.properties, linkSource)), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)), sort: sortKey, dir: direction, q: search };
  }

  async create(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const name = textField(body.name, 'Database name', 160);
    const description = body.description == null || body.description === ''
      ? null
      : textField(body.description, 'Database description', 500);
    return this.entitlements.addWithinLimit(workspaceId, 'databases', (transaction) => transaction.workspaceDatabase.create({ data: { workspaceId, name, description } }));
  }

  async update(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const data: { name?: string; description?: string | null } = {};
    if ('name' in body) data.name = textField(body.name, 'Database name', 160);
    if ('description' in body) data.description = body.description == null || body.description === ''
      ? null
      : textField(body.description, 'Database description', 500);
    if (!Object.keys(data).length) throw new BadRequestException('Provide a database name or description to update.');
    const result = await this.prisma.workspaceDatabase.updateMany({ where: { id: databaseId, workspaceId }, data });
    if (result.count !== 1) throw new NotFoundException('Database not found in this workspace.');
    return this.prisma.workspaceDatabase.findFirstOrThrow({ where: { id: databaseId, workspaceId } });
  }

  /**
   * Deletes a database with its records and views (they cascade). Refused while another database has a relation property
   * pointing here, because that property would be left pointing at nothing; the message names them so they can be removed first.
   */
  async remove(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const database = await this.prisma.workspaceDatabase.findFirst({ where: { id: databaseId, workspaceId }, select: { id: true, name: true } });
    if (!database) throw new NotFoundException('Database not found in this workspace.');
    const others = await this.prisma.workspaceDatabase.findMany({ where: { workspaceId, id: { not: databaseId } }, select: { name: true, properties: true } });
    const dependants = others.flatMap((other) => propertyList(other.properties).filter((property) => property.relatedDatabaseId === databaseId).map((property) => `“${property.name}” in ${other.name}`));
    if (dependants.length) throw new ConflictException(`Other databases link to this one: ${dependants.slice(0, 5).join(', ')}. Remove those relation properties first.`);
    await this.prisma.$transaction([
      this.prisma.workspaceActivity.create({ data: { workspaceId, actorId, entityType: 'DATABASE', entityId: database.id, message: `deleted database “${database.name}”` } }),
      this.prisma.workspaceDatabase.delete({ where: { id: database.id } }),
    ]);
    return { id: database.id, deleted: true };
  }

  async createRecord(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId, true);
    const database = await this.prisma.workspaceDatabase.findFirst({ where: { id: databaseId, workspaceId }, select: { id: true, properties: true } });
    if (!database) throw new NotFoundException('Database not found in this workspace.');
    const values = recordValues(database.properties, objectInput(input).values);
    const { scalarValues, links } = await this.extractRelationLinks(workspaceId, database.properties, values);
    const record = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.databaseRecord.create({ data: { workspaceId, databaseId, values: scalarValues as Prisma.InputJsonValue } });
      if (links.length) await transaction.databaseRecordLink.createMany({ data: links.map((link) => ({ workspaceId, sourceRecordId: created.id, ...link })) });
      return transaction.databaseRecord.findUniqueOrThrow({
        where: { id: created.id }, include: { outgoingLinks: { select: { propertyId: true, targetRecordId: true } } },
      });
    });
    return this.withRelationValues(record, database.properties, await this.loadRollupSource(workspaceId, [{ properties: database.properties, records: [record] }]));
  }

  async importRecords(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > 500) {
      throw new BadRequestException('Import between 1 and 500 CSV rows at a time.');
    }
    const database = await this.prisma.workspaceDatabase.findFirst({
      where: { id: databaseId, workspaceId },
      select: { id: true, properties: true },
    });
    if (!database) throw new NotFoundException('Database not found in this workspace.');
    const properties = propertyList(database.properties);
    const relationIds = new Set(properties.filter((property) => property.type === 'relation').map((property) => property.id));
    const rows = body.rows.map((row) => {
      const values = recordValues(database.properties, row);
      if (Object.keys(values).some((propertyId) => relationIds.has(propertyId))) {
        throw new BadRequestException('Import relation fields separately after the related records exist.');
      }
      if (properties.some((property) => property.id === 'name') && (typeof values.name !== 'string' || !values.name.trim())) {
        throw new BadRequestException('Every imported row must include a record name.');
      }
      return { workspaceId, databaseId, values: values as Prisma.InputJsonValue };
    });
    const result = await this.prisma.databaseRecord.createMany({ data: rows });
    return { imported: result.count };
  }

  async addProperty(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const name = textField(body.name, 'Property name', 80);
    const type = enumValue(body.type, ['text', 'number', 'checkbox', 'date', 'status', 'relation', 'formula', 'rollup'] as const);
    const database = await this.prisma.workspaceDatabase.findFirst({
      where: { id: databaseId, workspaceId },
      select: { id: true, properties: true },
    });
    if (!database) throw new NotFoundException('Database not found in this workspace.');
    const properties = propertyList(database.properties);
    if (properties.some((property) => property.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new BadRequestException('A property with that name already exists.');
    }
    const id = `field_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
    let relatedDatabaseId: string | undefined;
    if (type === 'relation') {
      relatedDatabaseId = textField(body.relatedDatabaseId, 'Related database', 80);
      if (relatedDatabaseId === database.id) throw new BadRequestException('Choose a different database for this relation.');
      const relatedDatabase = await this.prisma.workspaceDatabase.findFirst({ where: { id: relatedDatabaseId, workspaceId }, select: { id: true } });
      if (!relatedDatabase) throw new BadRequestException('Related database must belong to this workspace.');
    }
    const formula = type === 'formula' ? textField(body.formula, 'Formula', 500) : undefined;
    let rollup: { rollupRelationId: string; rollupFunction: RollupFunction; rollupPropertyId?: string } | undefined;
    if (type === 'rollup') {
      const rollupRelationId = textField(body.rollupRelationId, 'Relation', 80);
      const relation = properties.find((property) => property.id === rollupRelationId && property.type === 'relation');
      if (!relation?.relatedDatabaseId) throw new BadRequestException('Choose a relation property in this database.');
      const rollupFunction = enumValue(body.rollupFunction, rollupFunctions, 'Rollup function');
      let rollupPropertyId: string | undefined;
      if (rollupFunction !== 'count') {
        rollupPropertyId = textField(body.rollupPropertyId, 'Rollup property', 80);
        const related = await this.prisma.workspaceDatabase.findFirst({ where: { id: relation.relatedDatabaseId, workspaceId }, select: { properties: true } });
        const target = related && propertyList(related.properties).find((property) => property.id === rollupPropertyId);
        if (target?.type !== 'number') throw new BadRequestException('A rollup can only summarise a number property in the related database.');
      }
      rollup = { rollupRelationId, rollupFunction, ...(rollupPropertyId ? { rollupPropertyId } : {}) };
    }
    const nextProperties = [...properties, { id, name, type, ...(relatedDatabaseId ? { relatedDatabaseId } : {}), ...(formula ? { formula } : {}), ...(rollup ?? {}) }];
    if (type === 'formula') validateFormulaSet(nextProperties);
    return this.prisma.workspaceDatabase.update({
      where: { id: database.id },
      data: { properties: nextProperties as Prisma.InputJsonValue },
    });
  }

  async saveView(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const name = textField(body.name, 'View name', 80);
    const filterQuery = optionalText(body.filterQuery, 'Filter', 200) ?? '';
    const sortPropertyId = body.sortPropertyId === undefined ? 'updatedAt' : textField(body.sortPropertyId, 'Sort property', 80);
    const sortDirection = enumValue(body.sortDirection, ['ASC', 'DESC'] as const, 'Sort direction', 'DESC');
    const layout = enumValue(body.layout, ['TABLE', 'BOARD', 'GALLERY', 'CALENDAR', 'LIST', 'TIMELINE', 'CHART'] as const, 'View layout', 'TABLE');
    const groupByPropertyId = body.groupByPropertyId === undefined ? 'status' : textField(body.groupByPropertyId, 'Group property', 80);
    const datePropertyId = body.datePropertyId === undefined || body.datePropertyId === '' ? '' : textField(body.datePropertyId, 'Date property', 80);
    const chartPropertyId = body.chartPropertyId === undefined || body.chartPropertyId === '' ? '' : textField(body.chartPropertyId, 'Chart property', 80);
    const database = await this.prisma.workspaceDatabase.findFirst({
      where: { id: databaseId, workspaceId },
      select: { id: true, properties: true },
    });
    if (!database) throw new NotFoundException('Database not found in this workspace.');
    if (sortPropertyId !== 'updatedAt' && !propertyList(database.properties).some((property) => property.id === sortPropertyId)) {
      throw new BadRequestException('Sort property must belong to this database.');
    }
    if (layout === 'BOARD' && !propertyList(database.properties).some((property) => property.id === groupByPropertyId && property.type === 'status')) {
      throw new BadRequestException('Board views must group by a status property in this database.');
    }
    if (layout === 'CALENDAR' && !propertyList(database.properties).some((property) => property.id === datePropertyId && property.type === 'date')) {
      throw new BadRequestException('Calendar views must use a date property in this database.');
    }
    if (layout === 'TIMELINE' && !propertyList(database.properties).some((property) => property.id === datePropertyId && property.type === 'date')) {
      throw new BadRequestException('Timeline views must use a date property in this database.');
    }
    if (layout === 'CHART' && !propertyList(database.properties).some((property) => property.id === groupByPropertyId && property.type === 'status')) {
      throw new BadRequestException('Charts must group by a status property in this database.');
    }
    if (chartPropertyId && !propertyList(database.properties).some((property) => property.id === chartPropertyId && ['number', 'formula'].includes(property.type))) {
      throw new BadRequestException('The chart measure must be a number or formula property in this database.');
    }
    if (await this.prisma.databaseView.findFirst({ where: { databaseId, name }, select: { id: true } })) {
      throw new BadRequestException('A saved view with that name already exists.');
    }
    return this.prisma.databaseView.create({
      data: { workspaceId, databaseId, name, filterQuery, sortPropertyId, sortDirection, layout, groupByPropertyId, datePropertyId, chartPropertyId },
    });
  }

  async deleteView(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string, viewId: string) {
    await this.requireMembership(identity, workspaceId, true);
    const result = await this.prisma.databaseView.deleteMany({ where: { id: viewId, databaseId, workspaceId } });
    if (result.count !== 1) throw new NotFoundException('Saved view not found in this database.');
    return { deleted: true };
  }

  async updateRecord(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string, recordId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId, true);
    const database = await this.prisma.workspaceDatabase.findFirst({
      where: { id: databaseId, workspaceId },
      select: { id: true, properties: true },
    });
    if (!database) throw new NotFoundException('Database not found in this workspace.');
    const body = objectInput(input);
    const baseUpdatedAt = parseBaseUpdatedAt(body.baseUpdatedAt);
    const values = recordValues(database.properties, body.values);
    const { scalarValues, links } = await this.extractRelationLinks(workspaceId, database.properties, values);
    const relationPropertyIds = propertyList(database.properties).filter((property) => property.type === 'relation').map((property) => property.id);
    const outcome = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.databaseRecord.updateMany({
        where: { id: recordId, databaseId, workspaceId, updatedAt: baseUpdatedAt },
        data: { values: scalarValues as Prisma.InputJsonValue },
      });
      if (result.count !== 1) {
        const current = await transaction.databaseRecord.findFirst({ where: { id: recordId, databaseId, workspaceId }, include: { outgoingLinks: { select: { propertyId: true, targetRecordId: true } } } });
        if (!current) throw new NotFoundException('Record not found in this database.');
        return { record: current, conflict: true };
      }
      if (relationPropertyIds.length) await transaction.databaseRecordLink.deleteMany({ where: { workspaceId, sourceRecordId: recordId, propertyId: { in: relationPropertyIds } } });
      if (links.length) await transaction.databaseRecordLink.createMany({ data: links.map((link) => ({ workspaceId, sourceRecordId: recordId, ...link })) });
      const updated = await transaction.databaseRecord.findFirstOrThrow({
        where: { id: recordId, databaseId, workspaceId },
        include: { outgoingLinks: { select: { propertyId: true, targetRecordId: true } } },
      });
      return { record: updated, conflict: false };
    });
    const shaped = this.withRelationValues(outcome.record, database.properties, await this.loadRollupSource(workspaceId, [{ properties: database.properties, records: [outcome.record] }]));
    if (outcome.conflict) throw recordConflict(shaped);
    return shaped;
  }

  async bulkUpdateRecords(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const recordIds = parseBulkIds(body.recordIds);
    const database = await this.prisma.workspaceDatabase.findFirst({ where: { id: databaseId, workspaceId }, select: { id: true, properties: true } });
    if (!database) throw new NotFoundException('Database not found in this workspace.');
    const properties = propertyList(database.properties);
    const values = recordValues(database.properties, body.values);
    if (!Object.keys(values).length) throw new BadRequestException('Choose at least one value to apply.');
    if (Object.keys(values).some((propertyId) => properties.find((property) => property.id === propertyId)?.type === 'relation')) {
      throw new BadRequestException('Relations must be edited one record at a time.');
    }
    if (properties.some((property) => property.id === 'name') && 'name' in values && (typeof values.name !== 'string' || !values.name.trim())) {
      throw new BadRequestException('Record names cannot be empty.');
    }
    await this.prisma.$transaction(async (transaction) => {
      const records = await transaction.databaseRecord.findMany({ where: { id: { in: recordIds }, databaseId, workspaceId }, select: { id: true, values: true } });
      if (records.length !== recordIds.length) throw new NotFoundException('Some selected records no longer exist. Refresh and try again.');
      for (const record of records) {
        const current = record.values && typeof record.values === 'object' && !Array.isArray(record.values) ? record.values as Record<string, Prisma.JsonValue> : {};
        await transaction.databaseRecord.update({ where: { id: record.id }, data: { values: { ...current, ...values } as Prisma.InputJsonValue } });
      }
    });
    return { updated: recordIds.length };
  }

  async bulkDeleteRecords(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId, true);
    const recordIds = parseBulkIds(objectInput(input).recordIds);
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.databaseRecord.deleteMany({ where: { id: { in: recordIds }, databaseId, workspaceId } });
      if (result.count !== recordIds.length) throw new NotFoundException('Some selected records no longer exist. Refresh and try again.');
    });
    return { deleted: recordIds.length };
  }

  async deleteRecord(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string, recordId: string) {
    await this.requireMembership(identity, workspaceId, true);
    const result = await this.prisma.databaseRecord.deleteMany({
      where: { id: recordId, databaseId, workspaceId },
    });
    if (result.count !== 1) throw new NotFoundException('Record not found in this database.');
    return { id: recordId, deleted: true };
  }

  async duplicateRecord(identity: AuthenticatedIdentity, workspaceId: string, databaseId: string, recordId: string) {
    await this.requireMembership(identity, workspaceId, true);
    const [database, source] = await Promise.all([
      this.prisma.workspaceDatabase.findFirst({ where: { id: databaseId, workspaceId }, select: { id: true, properties: true } }),
      this.prisma.databaseRecord.findFirst({
        where: { id: recordId, databaseId, workspaceId },
        include: { outgoingLinks: { select: { propertyId: true, targetRecordId: true } } },
      }),
    ]);
    if (!database) throw new NotFoundException('Database not found in this workspace.');
    if (!source) throw new NotFoundException('Record not found in this database.');
    const values = this.withRelationValues(source, database.properties).values as Record<string, unknown>;
    const nameProperty = propertyList(database.properties).find((property) => property.id === 'name');
    if (nameProperty && typeof values.name === 'string') values.name = `${values.name} (copy)`.slice(0, 200);
    return this.createRecord(identity, workspaceId, databaseId, { values });
  }

  private async extractRelationLinks(workspaceId: string, propertiesValue: unknown, values: Record<string, string | number | boolean | null | string[]>) {
    const properties = propertyList(propertiesValue);
    const links: Array<{ propertyId: string; targetRecordId: string }> = [];
    for (const property of properties.filter((item) => item.type === 'relation')) {
      if (!property.relatedDatabaseId) throw new BadRequestException(`${property.name} has an invalid relation definition.`);
      const targetIds = [...new Set(Array.isArray(values[property.id]) ? values[property.id] as string[] : [])];
      if (targetIds.length > 100) throw new BadRequestException('A relation property can link to at most 100 records.');
      if (!targetIds.length) continue;
      const targets = await this.prisma.databaseRecord.findMany({
        where: { id: { in: targetIds }, databaseId: property.relatedDatabaseId, workspaceId },
        select: { id: true },
      });
      if (targets.length !== targetIds.length) throw new BadRequestException(`${property.name} can only link to records in its selected workspace database.`);
      links.push(...targetIds.map((targetRecordId) => ({ propertyId: property.id, targetRecordId })));
    }
    const relationPropertyIds = new Set(properties.filter((property) => property.type === 'relation').map((property) => property.id));
    const scalarValues = Object.fromEntries(Object.entries(values).filter(([propertyId]) => !relationPropertyIds.has(propertyId)));
    return { scalarValues, links };
  }

  private withRelationValues<T extends { values: Prisma.JsonValue; outgoingLinks: Array<{ propertyId: string; targetRecordId: string }> }>(record: T, propertiesValue: unknown, rollupSource: RollupSource = new Map()) {
    const { outgoingLinks, ...base } = record;
    const values = record.values && typeof record.values === 'object' && !Array.isArray(record.values)
      ? { ...record.values as Record<string, Prisma.JsonValue> }
      : {};
    const properties = propertyList(propertiesValue);
    for (const property of properties.filter((item) => item.type === 'relation')) {
      values[property.id] = outgoingLinks.filter((link) => link.propertyId === property.id).map((link) => link.targetRecordId);
    }
    for (const property of properties.filter((item) => item.type === 'rollup' && item.rollupRelationId && item.rollupFunction)) {
      const linkedIds = values[property.rollupRelationId!];
      const linked = (Array.isArray(linkedIds) ? linkedIds : []).flatMap((id) => { const target = rollupSource.get(String(id)); return target ? [target] : []; });
      values[property.id] = computeRollup(property.rollupFunction!, linked, property.rollupPropertyId);
    }
    const formulas = new Map(properties.filter((item) => item.type === 'formula').map((item) => [item.id, item]));
    const evaluateProperty = (id: string, stack = new Set<string>()): number | null => {
      const property = formulas.get(id);
      if (!property) {
        const value = values[id];
        return typeof value === 'number' && Number.isFinite(value) ? value : 0;
      }
      if (stack.has(id)) return null;
      stack.add(id);
      const result = evaluateFormula(property.formula ?? '', properties, (referenceId) => evaluateProperty(referenceId, new Set(stack)), values);
      return result;
    };
    for (const property of formulas.values()) values[property.id] = evaluateProperty(property.id);
    const linkNames: Record<string, string> = {};
    for (const link of outgoingLinks) {
      const target = rollupSource.get(link.targetRecordId);
      if (!target || link.targetRecordId in linkNames) continue;
      const label = target.name ?? Object.values(target).find((value) => typeof value === 'string' && value.trim());
      linkNames[link.targetRecordId] = String(label ?? 'Untitled record').slice(0, 120);
    }
    return { ...base, values, linkNames };
  }

  /** One query for every linked record that a rollup needs, shared by all records being returned. */
  private async loadRollupSource(workspaceId: string, entries: Array<{ properties: unknown; records: Array<{ outgoingLinks: Array<{ propertyId: string; targetRecordId: string }> }> }>): Promise<RollupSource> {
    const ids = new Set<string>();
    // Every record these ones link to: rollups need their values, and the screens need their names, so a linked record shows by name even when it is not in the loaded page.
    for (const { records } of entries) for (const record of records) for (const link of record.outgoingLinks) ids.add(link.targetRecordId);
    if (!ids.size) return new Map();
    const rows = await this.prisma.databaseRecord.findMany({ where: { id: { in: [...ids] }, workspaceId }, select: { id: true, values: true } });
    return new Map(rows.map((row) => [row.id, row.values && typeof row.values === 'object' && !Array.isArray(row.values) ? row.values as Record<string, Prisma.JsonValue> : {}]));
  }

  private requireMembership(identity: AuthenticatedIdentity, workspaceId: string, write = false) {
    return requireWorkspaceMember(this.prisma, identity, workspaceId, write);
  }
}

type RollupSource = Map<string, Record<string, Prisma.JsonValue>>;

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('A JSON object is required.');
  return input as Record<string, unknown>;
}

function textField(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new BadRequestException(`${label} must be between 1 and ${max} characters.`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string, max: number) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw new BadRequestException(`${label} must be ${max} characters or fewer.`);
  return value.trim();
}

function recordValues(propertiesValue: unknown, value: unknown): Record<string, string | number | boolean | null | string[]> {
  const values = objectInput(value);
  const properties = propertyList(propertiesValue);
  if (Object.keys(values).length > properties.length) throw new BadRequestException('Record values can only use properties defined in this database.');
  for (const [key, item] of Object.entries(values)) {
    const property = properties.find((candidate) => candidate.id === key);
    if (!property) throw new BadRequestException('Record values can only use properties defined in this database.');
    if (property.type === 'formula' || property.type === 'rollup') throw new BadRequestException(`${property.name} is calculated automatically and cannot be edited.`);
    if (item !== null && !matchesType(item, property.type)) throw new BadRequestException(`${property.name} has an invalid value.`);
    if (typeof item === 'string' && item.length > 2000) throw new BadRequestException('Text values must be 2,000 characters or fewer.');
  }
  return values as Record<string, string | number | boolean | null>;
}

type DatabaseProperty = { id: string; name: string; type: string; relatedDatabaseId?: string; formula?: string; rollupRelationId?: string; rollupPropertyId?: string; rollupFunction?: RollupFunction };

function propertyList(value: unknown): DatabaseProperty[] {
  if (!Array.isArray(value)) throw new BadRequestException('This database has an invalid property definition.');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || !('id' in entry) || !('name' in entry) || !('type' in entry)
      || typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.type !== 'string') {
      throw new BadRequestException('This database has an invalid property definition.');
    }
    return {
      id: entry.id,
      name: entry.name,
      type: entry.type,
      ...('relatedDatabaseId' in entry && typeof entry.relatedDatabaseId === 'string' ? { relatedDatabaseId: entry.relatedDatabaseId } : {}),
      ...('formula' in entry && typeof entry.formula === 'string' ? { formula: entry.formula } : {}),
      ...('rollupRelationId' in entry && typeof entry.rollupRelationId === 'string' ? { rollupRelationId: entry.rollupRelationId } : {}),
      ...('rollupPropertyId' in entry && typeof entry.rollupPropertyId === 'string' ? { rollupPropertyId: entry.rollupPropertyId } : {}),
      ...('rollupFunction' in entry && typeof entry.rollupFunction === 'string' && (rollupFunctions as readonly string[]).includes(entry.rollupFunction) ? { rollupFunction: entry.rollupFunction as RollupFunction } : {}),
    };
  });
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, label = 'Property type', fallback?: T[number]): T[number] {
  if (value === undefined && fallback) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value)) throw new BadRequestException(`${label} is invalid.`);
  return value as T[number];
}

function matchesType(value: unknown, type: string) {
  switch (type) {
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'checkbox': return typeof value === 'boolean';
    case 'date': return typeof value === 'string' && Number.isFinite(Date.parse(value));
    case 'text':
    case 'status': return typeof value === 'string';
    case 'relation': return Array.isArray(value) && value.every((item) => typeof item === 'string');
    case 'formula': return false;
    default: return false;
  }
}

type FormulaNode = { kind: 'number'; value: number } | { kind: 'field'; id: string } | { kind: 'unary'; op: '+' | '-'; value: FormulaNode } | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: FormulaNode; right: FormulaNode } | { kind: 'call'; name: string; args: FormulaNode[] };

function parseFormula(source: string, properties: DatabaseProperty[]): FormulaNode {
  const tokens = source.match(/\[[^\]]+\]|(?:\d+(?:\.\d+)?|\.\d+)|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/,]/g) ?? [];
  if (!tokens.length || tokens.join('').replace(/\s/g, '') !== source.replace(/\s/g, '')) throw new BadRequestException('Formula contains unsupported characters or syntax.');
  let cursor = 0;
  const peek = () => tokens[cursor];
  const take = () => tokens[cursor++];
  const expect = (token: string) => { if (take() !== token) throw new BadRequestException(`Formula expected “${token}”.`); };
  const expression = (): FormulaNode => {
    let node = term();
    while (peek() === '+' || peek() === '-') { const op = take() as '+' | '-'; node = { kind: 'binary', op, left: node, right: term() }; }
    return node;
  };
  const term = (): FormulaNode => {
    let node = factor();
    while (peek() === '*' || peek() === '/') { const op = take() as '*' | '/'; node = { kind: 'binary', op, left: node, right: factor() }; }
    return node;
  };
  const factor = (): FormulaNode => {
    if (peek() === '+' || peek() === '-') return { kind: 'unary', op: take() as '+' | '-', value: factor() };
    if (peek() === '(') { take(); const node = expression(); expect(')'); return node; }
    const token = take();
    if (!token) throw new BadRequestException('Formula is incomplete.');
    if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) return { kind: 'number', value: Number(token) };
    if (token.startsWith('[')) {
      const name = token.slice(1, -1).trim();
      const property = properties.find((item) => item.id === name || item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      if (!property || !['number', 'formula'].includes(property.type)) throw new BadRequestException(`Formula field “[${name}]” must be a number or another formula in this database.`);
      return { kind: 'field', id: property.id };
    }
    if (/^[A-Za-z_]/.test(token)) {
      const name = token.toUpperCase();
      if (!['SUM', 'MIN', 'MAX', 'ROUND', 'ABS'].includes(name)) throw new BadRequestException(`Formula function “${token}” is not supported.`);
      expect('(');
      const args: FormulaNode[] = [];
      if (peek() !== ')') { args.push(expression()); while (peek() === ',') { take(); args.push(expression()); } }
      expect(')');
      const valid = name === 'ABS' ? args.length === 1 : name === 'ROUND' ? args.length >= 1 && args.length <= 2 : args.length >= 1;
      if (!valid) throw new BadRequestException(`Formula function ${name} has the wrong number of arguments.`);
      return { kind: 'call', name, args };
    }
    throw new BadRequestException(`Formula token “${token}” is invalid.`);
  };
  const node = expression();
  if (cursor !== tokens.length) throw new BadRequestException(`Unexpected formula token “${peek()}”.`);
  return node;
}

function formulaReferences(node: FormulaNode): string[] {
  if (node.kind === 'field') return [node.id];
  if (node.kind === 'number') return [];
  if (node.kind === 'unary') return formulaReferences(node.value);
  if (node.kind === 'binary') return [...formulaReferences(node.left), ...formulaReferences(node.right)];
  return node.args.flatMap(formulaReferences);
}

function validateFormulaSet(properties: DatabaseProperty[]) {
  const nodes = new Map(properties.filter((item) => item.type === 'formula').map((item) => [item.id, parseFormula(item.formula ?? '', properties)]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new BadRequestException('Formula fields cannot depend on themselves or form a circular calculation.');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of formulaReferences(nodes.get(id)!)) if (nodes.has(dependency)) visit(dependency);
    visiting.delete(id); visited.add(id);
  };
  for (const id of nodes.keys()) visit(id);
}

function evaluateFormula(source: string, properties: DatabaseProperty[], resolve: (id: string) => number | null, values: Record<string, Prisma.JsonValue>): number | null {
  const node = parseFormula(source, properties);
  const evaluate = (part: FormulaNode): number | null => {
    if (part.kind === 'number') return part.value;
    if (part.kind === 'field') return properties.find((property) => property.id === part.id)?.type === 'formula' ? resolve(part.id) : typeof values[part.id] === 'number' ? values[part.id] as number : 0;
    if (part.kind === 'unary') { const value = evaluate(part.value); return value === null ? null : part.op === '-' ? -value : value; }
    const args = part.kind === 'binary' ? [evaluate(part.left), evaluate(part.right)] : part.args.map(evaluate);
    if (args.some((value) => value === null || !Number.isFinite(value))) return null;
    const numbers = args as number[];
    if (part.kind === 'binary') {
      const [left, right] = numbers;
      const result = part.op === '+' ? left + right : part.op === '-' ? left - right : part.op === '*' ? left * right : right === 0 ? null : left / right;
      return result === null || Number.isFinite(result) ? result : null;
    }
    if (part.name === 'SUM') return numbers.reduce((sum, value) => sum + value, 0);
    if (part.name === 'MIN') return Math.min(...numbers);
    if (part.name === 'MAX') return Math.max(...numbers);
    if (part.name === 'ABS') return Math.abs(numbers[0]);
    const digits = Math.max(-6, Math.min(6, Math.trunc(numbers[1] ?? 0)));
    const factor = 10 ** digits;
    return Math.round((numbers[0] + Number.EPSILON) * factor) / factor;
  };
  return evaluate(node);
}
