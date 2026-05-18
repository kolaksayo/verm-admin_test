require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { connect } = require('./db');

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
const telegramSettingsRoutes = require('./routes/telegramSettings');
const navBadgesRoutes = require('./routes/navBadges');

const { startWatcher } = require('./gameBetWatcher');
const { startSnapshotScheduler } = require('./rateSnapshotJob');

const app = express();

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

app.use(compression());
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/collections', heavyLimiter, collectionsRoutes);
app.use('/api/lookup', lookupRoutes);
app.use('/api/admin-users', adminUsersRoutes);
app.use('/api/fixtures', searchLimiter, fixturesRoutes);
app.use('/api/user-profile', userProfileRoutes);
app.use('/api/game-bets', gameBetsRoutes);
app.use('/api/cashflow', cashflowRoutes);
app.use('/api/user-dashboard', userDashboardRoutes);
app.use('/api/ngn-deposits', ngnDepositsRoutes);
app.use('/api/ngn-withdrawals', ngnWithdrawalsRoutes);
app.use('/api/dollar-naira-rate', dollarNairaRateRoutes);
app.use('/api/telegram', telegramSettingsRoutes);
app.use('/api/nav-badges', heavyLimiter, navBadgesRoutes);

const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 3001;

connect()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Verm Admin running on port ${PORT}`);
    });
    startWatcher();
    startSnapshotScheduler();
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });
