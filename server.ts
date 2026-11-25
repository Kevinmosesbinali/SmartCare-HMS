import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import admissionsRoutes from './src/server/routes/admissions.routes.ts';
import appointmentsRoutes from './src/server/routes/appointments.routes.ts';
import authRoutes from './src/server/routes/auth.routes.ts';
import billingRoutes from './src/server/routes/billing.routes.ts';
import consultationsRoutes from './src/server/routes/consultations.routes.ts';
import dashboardRoutes from './src/server/routes/dashboard.routes.ts';
import inventoryRoutes from './src/server/routes/inventory.routes.ts';
import laboratoryRoutes from './src/server/routes/laboratory.routes.ts';
import patientsRoutes from './src/server/routes/patients.routes.ts';
import pharmacyRoutes from './src/server/routes/pharmacy.routes.ts';
import reportsRoutes from './src/server/routes/reports.routes.ts';
import settingsRoutes from './src/server/routes/settings.routes.ts';
import staffRoutes from './src/server/routes/staff.routes.ts';
import { ensureSeeded } from './src/server/seed.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: {
        policy: 'same-origin-allow-popups',
      },
    })
  );
  app.use(express.json({ limit: '6mb' }));
  app.use(cookieParser());

  // Healthcheck for Render and uptime monitors
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'smartcare-hms', timestamp: new Date().toISOString() });
  });

  // Lazily ensure baseline roles, catalog, and dev/demo seed on first API request
  app.use('/api', async (_req, _res, next) => {
    try {
      await ensureSeeded();
    } catch (e) {
      console.error('Seed check error:', e);
    }
    next();
  });

  // Domain API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/patients', patientsRoutes);
  app.use('/api/appointments', appointmentsRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api/consultations', consultationsRoutes);
  app.use('/api/admissions', admissionsRoutes);
  app.use('/api/pharmacy', pharmacyRoutes);
  app.use('/api/laboratory', laboratoryRoutes);
  app.use('/api/billing', billingRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/settings', settingsRoutes);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SmartCare HMS server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
