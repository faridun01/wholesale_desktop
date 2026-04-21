import express from 'express';
import authRoutes from './routes/auth.routes.js';
import invoiceRoutes from './routes/invoices.routes.js';
import productRoutes from './routes/products.routes.js';
import warehouseRoutes from './routes/warehouses.routes.js';
import customerRoutes from './routes/customers.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import reminderRoutes from './routes/reminders.routes.js';
import paymentRoutes from './routes/payments.routes.js';
import expenseRoutes from './routes/expenses.routes.js';
import { authenticate } from './middlewares/auth.middleware.js';
import { corsMiddleware, securityHeaders } from './middlewares/security.middleware.js';
import { imageUpload, uploadsDir } from './utils/upload.js';

import { errorHandler } from './middlewares/error.handler.js';

const app = express();

app.use(corsMiddleware);
app.use(securityHeaders);
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/invoices', authenticate, invoiceRoutes);
app.use('/api/products', authenticate, productRoutes);
app.use('/api/warehouses', authenticate, warehouseRoutes);
app.use('/api/customers', authenticate, customerRoutes);
app.use('/api/dashboard', authenticate, dashboardRoutes);
app.use('/api/reports', authenticate, reportsRoutes);
app.use('/api/settings', authenticate, settingsRoutes);
app.use('/api/reminders', authenticate, reminderRoutes);
app.use('/api/payments', authenticate, paymentRoutes);
app.use('/api/expenses', authenticate, expenseRoutes);
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.post('/api/upload', authenticate, imageUpload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ photoUrl: `/uploads/${req.file.filename}` });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

export default app;
