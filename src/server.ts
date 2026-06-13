import express, { Request, Response } from 'express';
import { greet } from './utils/greet';

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.get('/', (_req: Request, res: Response) => {
  res.json({ message: greet('world') });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Aegis listening on :${port}`);
  });
}

export default app;
