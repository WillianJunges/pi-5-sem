import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { routes } from './routes';
import { errorHandler } from './shared/middlewares/errorHandler';

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use(routes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.use(errorHandler);
