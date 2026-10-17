import {
  citationSchema,
  deviceSchema,
  ENTITY_SCHEMAS,
  type EntityName,
  meResponseSchema,
} from '@lamp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createPrisma } from './int/db.js';

/**
 * The contract between the database and the shared Zod schemas (BACKLOG M1-11). The migrations
 * test already proves the database matches schema.prisma, so comparing the schemas with the
 * migrated database catches a Prisma model and its schema drifting apart: a column added,
 * removed or renamed, a change of nullability or type, or a different list of allowed values.
 */

const ENTITY_TABLES: Record<EntityName, string> = {
  userSettings: 'user_settings',
  series: 'series',
  lesson: 'lesson',
  section: 'section',
  tag: 'tag',
  sectionTag: 'section_tag',
  lessonTag: 'lesson_tag',
  takeaway: 'takeaway',
  question: 'question',
  highlight: 'highlight',
  memoryItem: 'memory_item',
  inboxItem: 'inbox_item',
};

interface Contract {
  table: string;
  schema: z.ZodObject;
  /** Columns the schema leaves out on purpose. */
  serverOnly: string[];
}

const CONTRACTS: Contract[] = [
  ...Object.entries(ENTITY_TABLES).map(([entity, table]) => ({
    table,
    schema: ENTITY_SCHEMAS[entity as EntityName] as z.ZodObject,
    // section.body_rev tells the push whether a body changed after a change's baseRev, and
    // body_device which device wrote it, for a conflicted copy's label (§6.4).
    serverOnly: entity === 'section' ? ['user_id', 'body_rev', 'body_device'] : ['user_id'],
  })),
  { table: 'citation', schema: citationSchema, serverOnly: ['user_id'] },
  { table: 'device', schema: deviceSchema, serverOnly: ['user_id'] },
  {
    table: 'user',
    schema: meResponseSchema,
    serverOnly: ['password_hash', 'sync_rev', 'disabled_at', 'created_at', 'updated_at'],
  },
];

/** Tables that never leave the server, so they have no schema. */
const SERVER_ONLY_TABLES = ['_prisma_migrations', 'session', 'email_token', 'sync_change'];

/** The JSON Schema types each Postgres column type may appear as on the wire. */
const WIRE_TYPES: Record<string, string> = {
  uuid: 'string',
  text: 'string',
  'USER-DEFINED': 'string', // citext
  date: 'string',
  'timestamp with time zone': 'string',
  integer: 'integer',
  bigint: 'integer', // rev travels as a number
  'double precision': 'number',
  boolean: 'boolean',
};

interface Column {
  table: string;
  name: string;
  nullable: boolean;
  type: string;
  /** From a CHECK constraint: the allowed values, or the allowed range. */
  values?: string[];
  min?: number;
  max?: number;
}

interface Property {
  types: string[];
  enum?: string[];
  minimum?: number;
  maximum?: number;
}

const prisma: PrismaClient = createPrisma();
let columns: Column[];

beforeAll(async () => {
  const rows = await prisma.$queryRaw<
    { table: string; name: string; nullable: string; type: string }[]
  >`SELECT table_name AS table, column_name AS name, is_nullable AS nullable, data_type AS type
    FROM information_schema.columns WHERE table_schema = 'public'`;
  const checks = await prisma.$queryRaw<{ table: string; def: string }[]>`
    SELECT replace(conrelid::regclass::text, '"', '') AS table, pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace`;
  columns = rows.map((r) => ({
    table: r.table,
    name: r.name,
    nullable: r.nullable === 'YES',
    type: r.type,
  }));
  for (const { table, def } of checks) {
    const column = columns.find((c) => c.table === table && def.includes(`(${c.name} `));
    if (!column) continue; // e.g. citation_ord_check compares two columns
    if (def.includes('ANY (ARRAY[')) {
      column.values = [...def.matchAll(/'([^']*)'::text/g)].map((m) => m[1]!);
    }
    const min = /\w+ >= (\d+)/.exec(def);
    const max = /\w+ <= (\d+)/.exec(def);
    if (min) column.min = Number(min[1]);
    if (max) column.max = Number(max[1]);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

const snakeCase = (key: string) => key.replaceAll(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** The schema's fields as JSON Schema, keyed by column name. */
function properties(schema: z.ZodObject): Map<string, Property> {
  const json = z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' }) as {
    properties: Record<string, z.core.JSONSchema.JSONSchema>;
  };
  return new Map(
    Object.entries(json.properties).map(([key, prop]) => {
      const variants = prop.anyOf ?? [prop];
      const types = variants.flatMap((v) => (typeof v === 'object' && v.type ? [v.type] : []));
      const main = variants.find((v) => typeof v === 'object' && v.type !== 'null') as
        z.core.JSONSchema.JSONSchema | undefined;
      return [
        snakeCase(key),
        {
          types: types.flat() as string[],
          enum: main?.enum as string[] | undefined,
          minimum: main?.minimum,
          maximum: main?.maximum,
        },
      ];
    }),
  );
}

describe('database ↔ domain schemas', () => {
  it('gives every table a schema, or lists it as server-only', () => {
    const tables = new Set(columns.map((c) => c.table));
    const covered = [...CONTRACTS.map((c) => c.table), ...SERVER_ONLY_TABLES];
    expect([...tables].toSorted()).toEqual(covered.toSorted());
  });

  describe.each(CONTRACTS)('$table', ({ table, schema, serverOnly }) => {
    const tableColumns = () => columns.filter((c) => c.table === table);

    it('has the same fields', () => {
      const names = tableColumns()
        .map((c) => c.name)
        .filter((name) => !serverOnly.includes(name));
      expect([...properties(schema).keys()].toSorted()).toEqual(names.toSorted());
    });

    it('agrees on nullability, type and allowed values', () => {
      const props = properties(schema);
      // Facts about each column as the database states them, and as the schema states them.
      // Allowed values and ranges are compared where the database has a CHECK constraint.
      const shared = tableColumns().filter((c) => props.has(c.name));
      const fromDb = shared.map((c) => ({
        where: `${table}.${c.name}`,
        nullable: c.nullable,
        type: c.type === 'jsonb' ? 'json' : WIRE_TYPES[c.type],
        values: c.values?.toSorted(),
        range: c.min === undefined && c.max === undefined ? undefined : [c.min, c.max],
      }));
      const fromSchema = shared.map((c) => {
        const prop = props.get(c.name)!;
        return {
          where: `${table}.${c.name}`,
          nullable: prop.types.includes('null'),
          type: c.type === 'jsonb' ? 'json' : prop.types.filter((t) => t !== 'null').join('|'),
          values: c.values ? prop.enum?.toSorted() : undefined,
          range:
            c.min === undefined && c.max === undefined ? undefined : [prop.minimum, prop.maximum],
        };
      });
      expect(fromSchema).toEqual(fromDb);
    });
  });
});
