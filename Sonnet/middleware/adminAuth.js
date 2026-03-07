// middleware/adminAuth.js
// Role-based admin authorization middleware
const { UserGroup } = require('../models');
const { Op } = require('sequelize');

/**
 * Require the authenticated user to be an owner or admin of at least one active group.
 * Must be placed AFTER verifyAuth0Token in the middleware chain (needs req.user.user_id).
 */
const requireGroupAdmin = async (req, res, next) => {
  try {
    const userId = req.user && req.user.user_id;

    if (!userId) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const membership = await UserGroup.findOne({
      where: {
        user_id: userId,
        role: { [Op.in]: ['owner', 'admin'] },
        status: 'active'
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (err) {
    console.error('Admin auth middleware error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { requireGroupAdmin };
