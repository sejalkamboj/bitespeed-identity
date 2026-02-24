import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10,
});

pool.on('error', (err) => {
  console.error('Postgres pool error (will reconnect):', err.message);
});

export interface Contact {
  id: number;
  phonenumber: string | null;
  email: string | null;
  linkedid: number | null;
  linkprecedence: 'primary' | 'secondary';
  createdat: Date;
  updatedat: Date;
  deletedat: Date | null;
}

export async function initDB(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Contact (
      id            SERIAL PRIMARY KEY,
      phonenumber   VARCHAR(20),
      email         VARCHAR(255),
      linkedid      INTEGER REFERENCES Contact(id),
      linkprecedence VARCHAR(10) NOT NULL CHECK (linkprecedence IN ('primary', 'secondary')),
      createdat     TIMESTAMP NOT NULL DEFAULT NOW(),
      updatedat     TIMESTAMP NOT NULL DEFAULT NOW(),
      deletedat     TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_contact_email ON Contact(email) WHERE deletedat IS NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_contact_phone ON Contact(phonenumber) WHERE deletedat IS NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_contact_linkedid ON Contact(linkedid) WHERE deletedat IS NULL;
  `);
}
