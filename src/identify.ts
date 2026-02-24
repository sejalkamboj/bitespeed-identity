import { pool, Contact } from './db';
import { PoolClient } from 'pg';

interface IdentifyRequest {
  email?: string | null;
  phoneNumber?: string | null;
}

interface ConsolidatedContact {
  primaryContatctId: number;
  emails: string[];
  phoneNumbers: string[];
  secondaryContactIds: number[];
}

async function getCluster(client: PoolClient, primaryId: number): Promise<Contact[]> {
  const result = await client.query<Contact>(
    `SELECT * FROM Contact
     WHERE deletedat IS NULL AND (id = $1 OR linkedid = $1)
     ORDER BY createdat ASC`,
    [primaryId]
  );
  return result.rows;
}

async function getRootPrimary(client: PoolClient, contact: Contact): Promise<Contact> {
  if (contact.linkprecedence === 'primary') return contact;
  const result = await client.query<Contact>(
    'SELECT * FROM Contact WHERE id = $1',
    [contact.linkedid]
  );
  return result.rows[0];
}

function buildResponse(primaryId: number, cluster: Contact[]): ConsolidatedContact {
  const primary = cluster.find(c => c.id === primaryId)!;
  const secondaries = cluster.filter(c => c.id !== primaryId);

  const emails: string[] = [];
  const phoneNumbers: string[] = [];

  if (primary.email) emails.push(primary.email);
  if (primary.phonenumber) phoneNumbers.push(primary.phonenumber);

  for (const c of secondaries) {
    if (c.email && !emails.includes(c.email)) emails.push(c.email);
    if (c.phonenumber && !phoneNumbers.includes(c.phonenumber)) phoneNumbers.push(c.phonenumber);
  }

  return {
    primaryContatctId: primaryId,
    emails,
    phoneNumbers,
    secondaryContactIds: secondaries.map(c => c.id),
  };
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const isConnErr =
        err.code === 'ENOTFOUND' ||
        err.code === 'ECONNREFUSED' ||
        err.code === 'ETIMEDOUT' ||
        err.message?.includes('ENOTFOUND');
      if (isConnErr && i < retries - 1) {
        console.log(`DB connection failed, retrying in 2s... (attempt ${i + 1}/${retries})`);
        await new Promise(res => setTimeout(res, 2000));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

async function _identify(req: IdentifyRequest): Promise<ConsolidatedContact> {
  const { email, phoneNumber } = req;

  if (!email && !phoneNumber) {
    throw new Error('At least one of email or phoneNumber must be provided');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const conditions: string[] = [];
    const params: (string | null)[] = [];
    let paramIdx = 1;

    if (email) {
      conditions.push(`email = $${paramIdx++}`);
      params.push(email);
    }
    if (phoneNumber) {
      conditions.push(`phonenumber = $${paramIdx++}`);
      params.push(String(phoneNumber));
    }

    const matchResult = await client.query<Contact>(
      `SELECT * FROM Contact
       WHERE deletedat IS NULL AND (${conditions.join(' OR ')})
       ORDER BY createdat ASC`,
      params
    );
    const matchedContacts = matchResult.rows;

    if (matchedContacts.length === 0) {
      const insertResult = await client.query<Contact>(
        `INSERT INTO Contact (phonenumber, email, linkedid, linkprecedence)
         VALUES ($1, $2, NULL, 'primary')
         RETURNING *`,
        [phoneNumber ?? null, email ?? null]
      );
      await client.query('COMMIT');
      const newContact = insertResult.rows[0];
      return buildResponse(newContact.id, [newContact]);
    }

    const primaryRoots = new Map<number, Contact>();
    for (const contact of matchedContacts) {
      const root = await getRootPrimary(client, contact);
      primaryRoots.set(root.id, root);
    }

    const sortedRoots = Array.from(primaryRoots.values()).sort(
      (a, b) => new Date(a.createdat).getTime() - new Date(b.createdat).getTime()
    );
    const winner = sortedRoots[0];

    if (sortedRoots.length > 1) {
      for (let i = 1; i < sortedRoots.length; i++) {
        const loser = sortedRoots[i];

        await client.query(
          `UPDATE Contact
           SET linkedid = $1, linkprecedence = 'secondary', updatedat = NOW()
           WHERE id = $2`,
          [winner.id, loser.id]
        );

        await client.query(
          `UPDATE Contact
           SET linkedid = $1, updatedat = NOW()
           WHERE linkedid = $2 AND deletedat IS NULL`,
          [winner.id, loser.id]
        );
      }
    }

    const cluster = await getCluster(client, winner.id);
    const emailCovered = !email || cluster.some(c => c.email === email);
    const phoneCovered = !phoneNumber || cluster.some(c => c.phonenumber === String(phoneNumber));

    if (!emailCovered || !phoneCovered) {
      await client.query(
        `INSERT INTO Contact (phonenumber, email, linkedid, linkprecedence)
         VALUES ($1, $2, $3, 'secondary')`,
        [phoneNumber ?? null, email ?? null, winner.id]
      );
    }

    await client.query('COMMIT');

    const finalCluster = await getCluster(client, winner.id);
    return buildResponse(winner.id, finalCluster);

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function identify(req: IdentifyRequest): Promise<ConsolidatedContact> {
  return withRetry(() => _identify(req));
}
