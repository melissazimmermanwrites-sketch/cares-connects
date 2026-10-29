import type { Client, Config } from '@libsql/client';
// The /web entry, not 'drizzle-orm/libsql': that one imports the native Node client eagerly.
// Either accepts any client instance, which is all we pass it.
import { drizzle } from 'drizzle-orm/libsql/web';
import * as schema from './schema';

/**
 * Local dev uses a SQLite file; production points DATABASE_URL at Turso
 * (libsql://<db>.turso.io) and sets DATABASE_AUTH_TOKEN. Same code either way.
 */
export const DATABASE_URL = process.env['DATABASE_URL'] ?? 'file:data/cares.db';

/**
 * The right libSQL client is loaded on first use: the Node client (native SQLite) for a local
 * file, the pure-HTTP client for Turso. Serverless hosts never load the native module, so a
 * build made on a Mac still runs on Linux. drizzle only calls the four methods below.
 */
let loaded: Promise<Client> | null = null;
function real(): Promise<Client> {
  const config: Config = { url: DATABASE_URL, authToken: process.env['DATABASE_AUTH_TOKEN'] };
  loaded ??= DATABASE_URL.startsWith('file:')
    ? import('@libsql/client').then((m) => m.createClient(config))
    : import('@libsql/client/web').then((m) => m.createClient(config));
  return loaded;
}

export const client = {
  execute: async (...args: Parameters<Client['execute']>) => (await real()).execute(...args),
  batch: async (...args: Parameters<Client['batch']>) => (await real()).batch(...args),
  migrate: async (...args: Parameters<Client['migrate']>) => (await real()).migrate(...args),
  transaction: async (...args: Parameters<Client['transaction']>) => (await real()).transaction(...args),
  close: () => void loaded?.then((c) => c.close()),
} as unknown as Client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
