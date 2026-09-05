import { DatabaseSync } from 'node:sqlite'
import { resolveAppPaths, type AppPaths } from '../config/paths.js'

let database: DatabaseSync | null = null
let shutdownHandlersRegistered = false

export function openDatabase(paths: AppPaths = resolveAppPaths()): DatabaseSync {
  if (database) {
    return database
  }

  const opened = new DatabaseSync(paths.databaseFile)
  opened.exec('PRAGMA journal_mode = WAL')
  opened.exec('PRAGMA foreign_keys = ON')
  opened.exec('PRAGMA busy_timeout = 5000')
  database = opened
  return opened
}

export function getDatabase(): DatabaseSync {
  if (!database) {
    throw new Error('Database has not been opened. Call openDatabase() during startup first.')
  }
  return database
}

export function closeDatabase(): void {
  if (!database) {
    return
  }
  const opened = database
  database = null
  opened.close()
}

export function registerShutdownHandlers(): void {
  if (shutdownHandlersRegistered) {
    return
  }
  shutdownHandlersRegistered = true

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      try {
        closeDatabase()
      } catch (error) {
        console.error(`Failed to close the database on ${signal}:`, error)
      } finally {
        process.exit(0)
      }
    })
  }
}
