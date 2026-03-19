// services/authorizationService.js
// Centralized permission helpers for group-based authorization.
// All route files import from here instead of defining their own helpers.

const { UserGroup } = require('../models');

/**
 * Get a user's role in a group.
 * Uses the "direct" pattern: queries UserGroup directly with the Auth0 user_id string.
 * No User table lookup is needed because UserGroup.user_id IS the Auth0 string.
 *
 * @param {string} auth0UserId - Auth0 user ID string (e.g. "google-oauth2|123")
 * @param {string} groupId - Group UUID
 * @returns {Promise<string|null>} Role string ('owner', 'admin', 'member') or null
 */
const getUserRoleInGroup = async (auth0UserId, groupId) => {
  const userGroup = await UserGroup.findOne({
    where: {
      user_id: auth0UserId,
      group_id: groupId,
      status: 'active',
    },
  });
  return userGroup ? userGroup.role : null;
};

/**
 * Check if user is owner or admin of a group.
 * @param {string} auth0UserId - Auth0 user ID string
 * @param {string} groupId - Group UUID
 * @returns {Promise<boolean>}
 */
const isOwnerOrAdmin = async (auth0UserId, groupId) => {
  const role = await getUserRoleInGroup(auth0UserId, groupId);
  return role === 'owner' || role === 'admin';
};

/**
 * Check if user is an active member of a group (any role).
 * Unifies the former verifyUserInGroup, isGroupMember, and isActiveMember helpers.
 * @param {string} auth0UserId - Auth0 user ID string
 * @param {string} groupId - Group UUID
 * @returns {Promise<boolean>}
 */
const isActiveMember = async (auth0UserId, groupId) => {
  const role = await getUserRoleInGroup(auth0UserId, groupId);
  return role !== null;
};

/**
 * Check if user is the owner of a group.
 * @param {string} auth0UserId - Auth0 user ID string
 * @param {string} groupId - Group UUID
 * @returns {Promise<boolean>}
 */
const isOwner = async (auth0UserId, groupId) => {
  const role = await getUserRoleInGroup(auth0UserId, groupId);
  return role === 'owner';
};

module.exports = {
  getUserRoleInGroup,
  isOwnerOrAdmin,
  isActiveMember,
  isOwner,
};
