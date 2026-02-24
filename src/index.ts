import express, { Request, Response } from 'express';
import { initDB } from './db';
import { identify } from './identify';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/identify', async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber } = req.body;

    if (
      (email === undefined || email === null) &&
      (phoneNumber === undefined || phoneNumber === null)
    ) {
      return res.status(400).json({ error: 'At least one of email or phoneNumber must be provided' });
    }

    const result = await identify({
      email: email ?? null,
      phoneNumber: phoneNumber ? String(phoneNumber) : null,
    });

    return res.status(200).json({ contact: result });
  } catch (err: any) {
    console.error('Error in /identify:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

async function start() {
  await initDB();
  console.log('Database initialized');
  app.listen(PORT, () => {
    console.log(`Bitespeed Identity Service running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
