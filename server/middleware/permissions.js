const { getDb: getSQLite } = require('../sqlite');
const { COLLECTION_PERMISSION_MAP, isAlwaysAllowedCategory } = require('../permissionCategories');

function hasGrant(userId, category, subcategory) {
  const row = getSQLite()
    .prepare('SELECT 1 FROM admin_permission_grants WHERE user_id = ? AND category = ? AND subcategory = ? LIMIT 1')
    .get(userId, category, subcategory);
  return !!row;
}

// Superadmin always passes. The 'betting' category is always fully granted by
// default (no DB rows needed) — every other category requires an explicit grant.
function canAccess(user, category, subcategory) {
  if (user?.role === 'superadmin') return true;
  if (isAlwaysAllowedCategory(category)) return true;
  return hasGrant(user?.id, category, subcategory);
}

function requirePermission(category, subcategory) {
  return (req, res, next) => {
    if (!canAccess(req.user, category, subcategory)) {
      return res.status(403).json({ error: 'You do not have access to this section' });
    }
    next();
  };
}

// For collections.js's generic /:name routes — the category/subcategory isn't
// known until req.params.name is read, so this looks it up per-request.
function requireCollectionPermission(req, res, next) {
  const mapping = COLLECTION_PERMISSION_MAP[req.params.name];
  if (!mapping) return res.status(403).json({ error: 'Collection not allowed' });
  if (!canAccess(req.user, mapping.category, mapping.subcategory)) {
    return res.status(403).json({ error: 'You do not have access to this section' });
  }
  next();
}

module.exports = { requirePermission, requireCollectionPermission, canAccess };
