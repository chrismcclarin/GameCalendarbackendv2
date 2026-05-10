# Legacy scripts

One-off scripts preserved for historical reference. Not part of any active code path.

## migrate-boardgames-to-events.js

One-time data migration from the old `BoardGame` model to the current `Game` + `Event` schema. Originally lived in `migrations/` but was relocated 2026-05-09 (Phase 74-02) because:

- It is **not** a sequelize-cli migration (no `module.exports = { up, down }` shape).
- sequelize-cli loads every `.js` file in `migrations/` and crashed with `Could not find migration method: up` when it encountered this file during the Phase 74-03 pre-deploy guardrail rollout.
- It is no longer referenced by any production code path.

If you ever need to run it again, do so directly: `node scripts/legacy/migrate-boardgames-to-events.js`. It will not be picked up by `npm run migrate:apply`.
