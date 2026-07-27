import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './config/db';

import productoRoutes from './routes/producto.routes';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/productos', productoRoutes);

app.get('/health', async (req, res) => {
  try {
    const { rowCount } = await pool.query('SELECT id FROM public.tenant LIMIT 1');
    
    res.json({ status: 'ok', message: 'Server is running and connected to Database' });
  } catch (err: any) {
    console.error('Database connection error:', err.message);
    res.status(500).json({ status: 'error', message: 'Internal Server Error / Database connection failed' });
  }
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
