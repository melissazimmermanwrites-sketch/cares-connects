import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

/**
 * Local dev uses a SQLite file; production points DATABASE_URL at Turso
 * (libsql://<db>.turso.io) and sets DATABASE_AUTH_TOKEN. Same code either way.
 */
export const DATABASE_URL = process.env['DATABASE_URL'] ?? 'file:data/cares.db';

export const client = createClient({
  url: DATABASE_URL,
  authToken: process.env['DATABASE_AUTH_TOKEN'],
});

export const db = drizzle(client, { schema });
export type Db = typeof db;
