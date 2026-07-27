import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import productoRoutes from './routes/producto.routes';
import authRoutes from './routes/auth.routes';

const app = express();
const port = process.env.PORT || 8080;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/productos', productoRoutes);

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
