// scripts/audit-migrations.js
//
// Phase 74 Plan 01 — Production migration + schema drift detector.
//
// Purpose: Catch the class of drift that caused the 2026-05-08 incident, where a
// 2.5-month-stale migration silently broke event creation in prod. This script
// reports drift; it does not fix anything. (Replay is Plan 74-02's job.)
//
// READ-ONLY: no INSERT/UPDATE/DELETE/ALTER/CREATE statements anywhere.
// No `sequelize.sync()`. The script ONLY reads SequelizeMeta + information_schema
// (via Sequelize's getQueryInterface helpers) and `fs.readdirSync(migrations/)`.
//
// What it reports:
//   1. Header — audit timestamp, DB host (from DATABASE_URL — host only, never
//      the full URL with creds), and total counts.
//   2. Migration buckets:
//        - PENDING IN REPO: in migrations/ but NOT in SequelizeMeta. THIS is the
//          failure class from 2026-05-08. Loud red header.
//        - ORPHAN IN DB: in SequelizeMeta but NOT in migrations/. Implies a
//          migration was applied then deleted from the repo, or the DB is ahead.
//        - MATCHED: count only — full list is omitted to keep the report short.
//   3. Schema sweep:
//        - "Undeclared table" — live table that no model declares.
//          (Catches manual `CREATE TABLE` via psql.)
//        - "Undeclared column on {table}" — live column on a declared table that
//          the model does not declare.
//          (Asymmetric: declared-but-missing columns surface as a pending
//          migration via bucket #2, so we do not double-flag them here.)
//   4. Verdict — "DRIFT DETECTED" (any non-empty bucket OR any schema flag) or
//      "CLEAN" (all buckets empty + no schema flags).
//
// Migration filename filter — CRITICAL, do not "tighten":
//   The repo has BOTH 8-digit prefix migrations (e.g.
//   `20260107-create-user-availability.js`, ~10 files) AND 14-digit prefix
//   migrations (e.g. `20260507000005-restrict-week-uniqueness-to-auto.js`,
//   ~36 files). A `^\d{14}` regex would silently exclude all 10 of the 8-digit
//   ones — defeating the whole purpose of the audit.
//   The regex below (`^\d{8}.*\.js$`) intentionally matches both, because
//   any 14-digit prefix also starts with 8 digits.
//   `migrate-boardgames-to-events.js` is a manual data-migration helper — not a
//   sequelize-cli migration — and is explicitly excluded by name.
//
// Output:
//   - Console: structured summary + one-line verdict.
//   - JSON: /tmp/migration-audit-{YYYY-MM-DD}.json — full per-bucket lists +
//     per-table schema diffs (mirrors scripts/audit-ballot-bypass.js).
//
// Exit code:
//   - 0 on a successful audit run, REGARDLESS of findings (drift is data, not a
//     script error). The calling shell can grep the verdict line.
//   - Non-zero only on script failure (DB unreachable, missing SequelizeMeta
//     table, etc.).
//
// Usage:
//   railway run -- node scripts/audit-migrations.js     # against prod (Plan 74-02)
//   node scripts/audit-migrations.js                    # against whatever DATABASE_URL points at
//   npm run audit:migrations                            # alias for the above

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const db = require('../models');
const { sequelize } = db;

// ---------- Filename filter (see header note) ----------
const KNOWN_NON_MIGRATION_FILES = new Set(['migrate-boardgames-to-events.js']);
const MIGRATION_FILENAME_RE = /^\d{8}.*\.js$/;

// SequelizeMeta is Sequelize-managed; never declared as a model. Treat it as
// declared so the schema sweep does not flag it as undeclared.
const SEQUELIZE_MANAGED_TABLES = new Set(['SequelizeMeta']);

function isoDateStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function safeHostFromDatabaseUrl() {
  const url =
    process.env.POSTGRES_PRIVATE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.PGDATABASE_URL ||
    null;
  if (!url) return '<no DATABASE_URL set — likely localhost via individual DB_* vars>';
  try {
    const u = new URL(url);
    // Host only — never log the user/password/path. T-74-01-02 mitigation.
    return `${u.hostname}${u.port ? ':' + u.port : ''}`;
  } catch {
    return '<unparseable DATABASE_URL>';
  }
}

function readRepoMigrations(migrationsDir) {
  const allFiles = fs.readdirSync(migrationsDir);
  const repoMigrations = allFiles
    .filter((f) => MIGRATION_FILENAME_RE.test(f))
    .filter((f) => !KNOWN_NON_MIGRATION_FILES.has(f))
    .sort();

  const skippedFiles = allFiles.filter(
    (f) => !MIGRATION_FILENAME_RE.test(f) || KNOWN_NON_MIGRATION_FILES.has(f)
  );

  // Sanity check: total .js files - skipped count should equal repoMigrations.length.
  // If not, a future filename convention slipped past the regex.
  const totalJs = allFiles.filter((f) => f.endsWith('.js')).length;
  const sanityWarning =
    repoMigrations.length + skippedFiles.filter((f) => f.endsWith('.js')).length === totalJs
      ? null
      : `WARNING: filename-filter math does not check out — totalJs=${totalJs}, recognized=${repoMigrations.length}, skipped(.js)=${skippedFiles.filter((f) => f.endsWith('.js')).length}. A new filename convention may have slipped past the regex; review scripts/audit-migrations.js.`;

  return { repoMigrations, skippedFiles, sanityWarning };
}

async function readSequelizeMeta() {
  // Direct SQL — no model required (SequelizeMeta is sequelize-cli-managed,
  // not a declared model in models/).
  const rows = await sequelize.query('SELECT name FROM "SequelizeMeta" ORDER BY name', {
    type: sequelize.QueryTypes.SELECT,
  });
  return rows.map((r) => r.name);
}

function diffMigrations(repoMigrations, dbMigrations) {
  const repoSet = new Set(repoMigrations);
  const dbSet = new Set(dbMigrations);
  const pendingInRepo = repoMigrations.filter((m) => !dbSet.has(m));
  const orphanInDb = dbMigrations.filter((m) => !repoSet.has(m));
  const matched = repoMigrations.filter((m) => dbSet.has(m));
  return { pendingInRepo, orphanInDb, matched };
}

function buildDeclaredTablesAndColumns() {
  // Walk every export from models/index.js. Anything with a tableName is a
  // Sequelize model class; collect tableName + the declared column names.
  const declaredTables = new Set();
  const declaredColumnsByTable = new Map(); // tableName -> Set<columnName>

  for (const exported of Object.values(db)) {
    if (!exported || typeof exported !== 'function') continue;
    const tableName = exported.tableName;
    if (!tableName) continue;

    declaredTables.add(tableName);

    const attrs = exported.rawAttributes || {};
    const columns = new Set();
    for (const [attrName, attrDef] of Object.entries(attrs)) {
      // attribute.field falls back to the JS attribute name when no explicit
      // column mapping is set. This is the actual DB column name.
      const colName = (attrDef && attrDef.field) || attrName;
      columns.add(colName);
    }
    declaredColumnsByTable.set(tableName, columns);
  }

  // SequelizeMeta is managed by sequelize-cli — treat it as declared.
  for (const t of SEQUELIZE_MANAGED_TABLES) declaredTables.add(t);

  return { declaredTables, declaredColumnsByTable };
}

async function listLiveTables() {
  const queryInterface = sequelize.getQueryInterface();
  const raw = await queryInterface.showAllTables();
  // Different dialects return either array of strings or array of {tableName, schema}.
  return raw.map((t) => (typeof t === 'string' ? t : t.tableName)).sort();
}

async function describeLiveTable(tableName) {
  const queryInterface = sequelize.getQueryInterface();
  const desc = await queryInterface.describeTable(tableName);
  // describeTable returns { columnName: { type, allowNull, ... }, ... }
  return new Set(Object.keys(desc));
}

async function runSchemaSweep(declaredTables, declaredColumnsByTable, liveTables) {
  const undeclaredTables = [];
  const undeclaredColumnsByTable = {}; // tableName -> [colName, ...]

  for (const tableName of liveTables) {
    if (!declaredTables.has(tableName)) {
      undeclaredTables.push(tableName);
      continue;
    }
    // Declared — diff columns.
    if (SEQUELIZE_MANAGED_TABLES.has(tableName)) continue; // skip SequelizeMeta column-diff; not a model

    const liveColumns = await describeLiveTable(tableName);
    const declaredColumns = declaredColumnsByTable.get(tableName) || new Set();
    const undeclaredColumns = [];
    for (const col of liveColumns) {
      if (!declaredColumns.has(col)) undeclaredColumns.push(col);
    }
    if (undeclaredColumns.length > 0) {
      undeclaredColumnsByTable[tableName] = undeclaredColumns.sort();
    }
  }

  return { undeclaredTables: undeclaredTables.sort(), undeclaredColumnsByTable };
}

function printHeader({ runAt, dbHost, repoCount, dbCount, modelCount, liveTableCount }) {
  console.log('========================================');
  console.log('  Migration + Schema Drift Audit');
  console.log('  Phase 74 Plan 01 (read-only)');
  console.log('========================================');
  console.log(`Run at:          ${runAt}`);
  console.log(`DB host:         ${dbHost}`);
  console.log(`Migrations on disk:   ${repoCount}`);
  console.log(`Rows in SequelizeMeta: ${dbCount}`);
  console.log(`Models loaded:        ${modelCount}`);
  console.log(`Live tables:          ${liveTableCount}`);
  console.log('');
}

function printMigrationBuckets({ pendingInRepo, orphanInDb, matched, skippedFiles, sanityWarning }) {
  console.log('--- Migration buckets ---');
  if (pendingInRepo.length > 0) {
    console.log('');
    console.log('!!! PENDING IN REPO (migration file present, NOT applied to DB) !!!');
    for (const m of pendingInRepo) console.log(`  - ${m}`);
  } else {
    console.log('PENDING IN REPO: (none)');
  }

  console.log('');
  if (orphanInDb.length > 0) {
    console.log('!!! ORPHAN IN DB (in SequelizeMeta but NOT in migrations/) !!!');
    for (const m of orphanInDb) console.log(`  - ${m}`);
  } else {
    console.log('ORPHAN IN DB: (none)');
  }

  console.log('');
  console.log(`MATCHED: ${matched.length} migrations present in both disk and DB`);
  console.log(`Skipped files (not migrations): ${skippedFiles.length}`);
  if (skippedFiles.length > 0) {
    for (const f of skippedFiles) console.log(`  - ${f} (excluded by filter)`);
  }
  if (sanityWarning) {
    console.log('');
    console.log(sanityWarning);
  }
  console.log('');
}

function printSchemaSweep({ undeclaredTables, undeclaredColumnsByTable }) {
  console.log('--- Schema sweep ---');
  if (undeclaredTables.length === 0 && Object.keys(undeclaredColumnsByTable).length === 0) {
    console.log('Schema is in sync with declared models. (no findings)');
    console.log('');
    return;
  }
  if (undeclaredTables.length > 0) {
    console.log('Undeclared tables (live in DB, no model declares them):');
    for (const t of undeclaredTables) console.log(`  - ${t}`);
  }
  for (const [tableName, cols] of Object.entries(undeclaredColumnsByTable)) {
    console.log(`Undeclared columns on ${tableName}:`);
    for (const c of cols) console.log(`  - ${c}`);
  }
  console.log('');
}

function printVerdict(verdict) {
  console.log('========================================');
  console.log(`  Verdict: ${verdict}`);
  console.log('========================================');
}

async function main() {
  const runAt = new Date().toISOString();
  const dbHost = safeHostFromDatabaseUrl();

  // Touch the DB up-front so a connection failure is reported clearly.
  await sequelize.authenticate();

  // 1. Read the two migration sides.
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const { repoMigrations, skippedFiles, sanityWarning } = readRepoMigrations(migrationsDir);
  const dbMigrations = await readSequelizeMeta();

  const { pendingInRepo, orphanInDb, matched } = diffMigrations(repoMigrations, dbMigrations);

  // 2. Schema sweep.
  const { declaredTables, declaredColumnsByTable } = buildDeclaredTablesAndColumns();
  const liveTables = await listLiveTables();
  const { undeclaredTables, undeclaredColumnsByTable } = await runSchemaSweep(
    declaredTables,
    declaredColumnsByTable,
    liveTables
  );

  // Count model classes (anything we put in declaredTables minus the
  // sequelize-managed sentinels — gives an honest "models loaded" number).
  const modelCount = Array.from(declaredTables).filter(
    (t) => !SEQUELIZE_MANAGED_TABLES.has(t)
  ).length;

  // 3. Console report.
  printHeader({
    runAt,
    dbHost,
    repoCount: repoMigrations.length,
    dbCount: dbMigrations.length,
    modelCount,
    liveTableCount: liveTables.length,
  });
  printMigrationBuckets({ pendingInRepo, orphanInDb, matched, skippedFiles, sanityWarning });
  printSchemaSweep({ undeclaredTables, undeclaredColumnsByTable });

  const drift =
    pendingInRepo.length > 0 ||
    orphanInDb.length > 0 ||
    undeclaredTables.length > 0 ||
    Object.keys(undeclaredColumnsByTable).length > 0;
  const verdict = drift ? 'DRIFT DETECTED' : 'CLEAN';
  printVerdict(verdict);

  // 4. JSON detail file.
  const report = {
    audit_run_at: runAt,
    db_host: dbHost,
    counts: {
      repo_migrations: repoMigrations.length,
      db_migrations: dbMigrations.length,
      models_loaded: modelCount,
      live_tables: liveTables.length,
      pending_in_repo: pendingInRepo.length,
      orphan_in_db: orphanInDb.length,
      matched: matched.length,
      undeclared_tables: undeclaredTables.length,
      tables_with_undeclared_columns: Object.keys(undeclaredColumnsByTable).length,
    },
    migration_buckets: {
      pending_in_repo: pendingInRepo,
      orphan_in_db: orphanInDb,
      matched, // include the full list in the JSON (omitted from console for brevity)
    },
    skipped_files: skippedFiles,
    schema_sweep: {
      undeclared_tables: undeclaredTables,
      undeclared_columns_by_table: undeclaredColumnsByTable,
    },
    verdict,
    sanity_warning: sanityWarning,
  };

  const outPath = path.join('/tmp', `migration-audit-${isoDateStr()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Detail written to: ${outPath}`);

  await sequelize.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('[audit-migrations] FATAL:', err && err.message ? err.message : err);
  if (err && err.stack) console.error(err.stack);
  try {
    await sequelize.close();
  } catch (_) {
    // ignore close errors during failure path
  }
  process.exit(1);
});
