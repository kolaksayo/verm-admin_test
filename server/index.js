require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { connect, connectWrite } = require('./db');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const collectionsRoutes = require('./routes/collections');
const lookupRoutes = require('./routes/lookup');
const adminUsersRoutes = require('./routes/adminUsers');
const fixturesRoutes = require('./routes/fixtures');
const userProfileRoutes = require('./routes/userProfile');
const gameBetsRoutes = require('./routes/gameBets');
const cashflowRoutes = require('./routes/cashflow');
const userDashboardRoutes = require('./routes/userDashboard');
const ngnDepositsRoutes = require('./routes/ngnDeposits');
const ngnWithdrawalsRoutes = require('./routes/ngnWithdrawals');
const dollarNairaRateRoutes = require('./routes/dollarNairaRate');
const telegramSettingsRoutes  = require('./routes/telegramSettings');
const whatsappSettingsRoutes  = require('./routes/whatsappSettings');
const dmSettingsRoutes        = require('./routes/dmSettings');
const campaignRoutes          = require('./routes/campaigns');
const auditRoutes             = require('./routes/audit');
const adminCreditRoutes       = require('./routes/adminCredit');
const navBadgesRoutes = require('./routes/navBadges');
const influencerDashboardRoutes = require('./routes/influencerDashboard');
const influencerPublicRoutes    = require('./routes/influencerPublic');
const requestLogsRoutes         = require('./routes/requestLogs');
const signupBonusRoutes         = require('./routes/signupBonus');

const { startWatcher } = require('./gameBetWatcher');
const { startSnapshotScheduler } = require('./rateSnapshotJob');
const { startSignupBonusWatcher } = require('./signupBonusWatcher');

const app = express();
app.set('trust proxy', 1);

// Rate limiters
const heavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});
// Stricter limiter for auth (protects login + privilege elevation from brute force)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

app.use(compression());
// CORS: lock to an explicit allow-list when CORS_ORIGINS is set (comma-separated);
// otherwise fall back to permissive (preserves existing dev/deploy behavior).
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigins && corsOrigins.length ? corsOrigins : true, credentials: true }));
app.use(express.json());

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/collections', heavyLimiter, collectionsRoutes);
app.use('/api/lookup', lookupRoutes);
app.use('/api/admin-users', heavyLimiter, adminUsersRoutes);
app.use('/api/fixtures', searchLimiter, fixturesRoutes);
app.use('/api/user-profile', userProfileRoutes);
app.use('/api/game-bets', gameBetsRoutes);
app.use('/api/cashflow', cashflowRoutes);
app.use('/api/user-dashboard', userDashboardRoutes);
app.use('/api/ngn-deposits', ngnDepositsRoutes);
app.use('/api/ngn-withdrawals', ngnWithdrawalsRoutes);
app.use('/api/dollar-naira-rate', dollarNairaRateRoutes);
app.use('/api/telegram',         telegramSettingsRoutes);
app.use('/api/whatsapp',         whatsappSettingsRoutes);
app.use('/api/notifications/dm', dmSettingsRoutes);
app.use('/api/campaigns',        campaignRoutes);
app.use('/api/audit',            heavyLimiter, auditRoutes);
app.use('/api/admin-credit',     heavyLimiter, adminCreditRoutes);
app.use('/api/nav-badges', heavyLimiter, navBadgesRoutes);
app.use('/api/influencer-dashboard', influencerDashboardRoutes);
app.use('/api/influencer-public',   searchLimiter, influencerPublicRoutes);
app.use('/api/request-logs',        heavyLimiter,  requestLogsRoutes);
app.use('/api/signup-bonus',        signupBonusRoutes);

const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 3001;

connect()
  .then(async () => {
    await connectWrite();
    app.listen(PORT, () => {
      console.log(`Verm Admin running on port ${PORT}`);
    });
    startWatcher();
    startSnapshotScheduler();
    startSignupBonusWatcher();
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });
