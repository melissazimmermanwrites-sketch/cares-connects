/**
 * Creates an admin login, or resets the password if the email already exists.
 *
 *   npm run admin:create -- mel@example.org "Mel"
 *
 * The password is prompted for (hidden), or read from ADMIN_PASSWORD for scripted setups.
 */
import { createInterface } from 'node:readline/promises';
import { eq } from 'drizzle-orm';
import { client, db, DATABASE_URL } from '../src/server/db/client';
import { admins } from '../src/server/db/schema';
import { deleteSessionsForAdmin, hashPassword } from '../src/server/auth';

const [emailArg, nameArg] = process.argv.slice(2);
const email = emailArg?.trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('Usage: npm run admin:create -- <email> ["Display Name"]');
  process.exit(1);
}

async function promptHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl);
  let prompted = false;
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
    if (!prompted) {
      write(s);
      prompted = true;
    }
  };
  const answer = await rl.question(question);
  rl.close();
  process.stdout.write('\n');
  return answer;
}

const password = process.env['ADMIN_PASSWORD'] ?? (await promptHidden('Password (10+ characters): '));
if (password.length < 10) {
  console.error('Password must be at least 10 characters.');
  process.exit(1);
}

const passwordHash = await hashPassword(password);
const [existing] = await db.select().from(admins).where(eq(admins.email, email));

if (existing) {
  await db
    .update(admins)
    .set({ passwordHash, name: nameArg ?? existing.name, updatedAt: new Date() })
    .where(eq(admins.id, existing.id));
  await deleteSessionsForAdmin(existing.id);
  console.log(`Reset password for ${email} on ${DATABASE_URL} (signed out everywhere).`);
} else {
  await db.insert(admins).values({ email, name: nameArg ?? email.split('@')[0], passwordHash });
  console.log(`Created admin ${email} on ${DATABASE_URL}.`);
}
client.close();
