import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

// Auth
import authRoutes from './routes/auth.routes';

// Recursos
import productoRoutes        from './routes/producto.routes';
import sucursalRoutes        from './routes/sucursal.routes';
import rolRoutes             from './routes/rol.routes';
import proveedorRoutes       from './routes/proveedor.routes';
import tipoRoutes            from './routes/tipo.routes';
import subtipoRoutes         from './routes/subtipo.routes';
import cuentaFinancieraRoutes from './routes/cuenta-financiera.routes';
import usuarioSucursalRoutes from './routes/usuario-sucursal.routes';
import productoSucursalRoutes from './routes/producto-sucursal.routes';
import operacionRoutes       from './routes/operacion.routes';
import pedidoReposicionRoutes from './routes/pedido-reposicion.routes';

const app = express();
const port = process.env.PORT || 8080;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Rutas de autenticación
app.use('/api/auth', authRoutes);

// Rutas de recursos (requieren autenticación)
app.use('/api/productos',          productoRoutes);
app.use('/api/sucursales',         sucursalRoutes);
app.use('/api/roles',              rolRoutes);
app.use('/api/proveedores',        proveedorRoutes);
app.use('/api/tipos',              tipoRoutes);
app.use('/api/subtipos',           subtipoRoutes);
app.use('/api/cuentas-financieras', cuentaFinancieraRoutes);
app.use('/api/usuarios-sucursal',  usuarioSucursalRoutes);
app.use('/api/producto-sucursal',  productoSucursalRoutes);
app.use('/api/operaciones',        operacionRoutes);
app.use('/api/pedidos-reposicion', pedidoReposicionRoutes);

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
