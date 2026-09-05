import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DatabaseSync } from 'node:sqlite'

const MIGRATION_FILE_PATTERN = /^(\d{3})_([a-z0-9_]+)\.sql$/

interface Migration {
  version: string
  name: string
  filePath: string
  sql: string
}

interface SchemaMigrationRow {
  version: string
}

export function resolveMigrationsDir(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(moduleDir, 'migrations'),
    resolve(moduleDir, '..', '..', 'server', 'database', 'migrations'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  throw new Error(
    'Migrations directory not found. Looked in: ' + candidates.join(', '),
  )
}

export function discoverMigrations(migrationsDir: string = resolveMigrationsDir()): Migration[] {
  const entries = readdirSync(migrationsDir, { withFileTypes: true })
  const migrations: Migration[] = []
  const seenVersions = new Set<string>()

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }
    const match = MIGRATION_FILE_PATTERN.exec(entry.name)
    if (!match) {
      continue
    }
    const version = match[1] ?? ''
    const name = match[2] ?? ''
    if (seenVersions.has(version)) {
      throw new Error(
        `Duplicate migration version "${version}" in ${migrationsDir}. Migration versions must be unique.`,
      )
    }
    seenVersions.add(version)
    const filePath = join(migrationsDir, entry.name)
    migrations.push({
      version,
      name,
      filePath,
      sql: readFileSync(filePath, 'utf8'),
    })
  }

  migrations.sort((a, b) =>
    a.version === b.version ? a.name.localeCompare(b.name) : a.version.localeCompare(b.version),
  )
  return migrations
}

function readAppliedVersions(db: DatabaseSync): Set<string> {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (' +
      'version TEXT PRIMARY KEY, ' +
      "applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))" +
      ')',
  )
  const rows = db.prepare('SELECT version FROM schema_migrations').all() as unknown as SchemaMigrationRow[]
  return new Set(rows.map((row) => row.version))
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function runMigrations(db: DatabaseSync, migrationsDir?: string): string[] {
  const applied = readAppliedVersions(db)
  const pending = discoverMigrations(migrationsDir).filter(
    (migration) => !applied.has(migration.version),
  )
  const newlyApplied: string[] = []

  for (const migration of pending) {
    try {
      db.exec('BEGIN')
      if (migration.sql.trim().length > 0) {
        db.exec(migration.sql)
      }
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version)
      db.exec('COMMIT')
    } catch (error) {
      if (db.isTransaction) {
        db.exec('ROLLBACK')
      }
      throw new Error(
        `Migration ${migration.version}_${migration.name} failed: ${describeError(error)} ` +
          'The database was left at its prior version. Fix the migration or restore a backup before restarting.',
      )
    }
    newlyApplied.push(migration.version)
    console.info(`Applied migration ${migration.version}_${migration.name}`)
  }

  return newlyApplied
}
