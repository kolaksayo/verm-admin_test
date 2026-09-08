const express = require('express');
const { getLogDb } = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

// GET /api/request-logs/providers — distinct apiProviderName values
router.get('/providers', auth, requirePermission('system', 'request_logs'), async (req, res) => {
  try {
    const providers = await getLogDb()
      .collection('requestresponses')
      .distinct('apiProviderName');
    res.json(providers.filter(Boolean).sort());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/request-logs?page=&limit=&search=&provider=&status=&dateFrom=&dateTo=
router.get('/', auth, requirePermission('system', 'request_logs'), async (req, res) => {
  try {
    const db = getLogDb();
    const page     = Math.max(1, parseInt(req.query.page)  || 1);
    const limit    = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const search   = (req.query.search   || '').trim();
    const provider = (req.query.provider || '').trim();
    const status   = (req.query.status   || '').trim(); // 'success' | 'error' | ''
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom + 'T00:00:00.000Z') : null;
    const dateTo   = req.query.dateTo   ? new Date(req.query.dateTo   + 'T23:59:59.999Z') : null;

    const match = {};

    if (dateFrom || dateTo) {
      match.timestamp = {};
      if (dateFrom) match.timestamp.$gte = dateFrom;
      if (dateTo)   match.timestamp.$lte = dateTo;
    }
    if (provider) match.apiProviderName = provider;
    if (status === 'success') match.status = { $gte: 200, $lt: 300 };
    if (status === 'error')   match.status = { $gte: 400 };
    if (search) match.url = { $regex: search, $options: 'i' };

    const [total, docs] = await Promise.all([
      db.collection('requestresponses').countDocuments(match),
      db.collection('requestresponses')
        .find(match, { projection: { headers: 0, __v: 0 } })
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
    ]);

    res.json({ total, page, limit, docs });
  } catch (err) {
    console.error('GET /request-logs error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
