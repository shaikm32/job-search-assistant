import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DATA_DIR_ENV_VAR = 'JOB_SEARCH_ASSISTANT_DATA_DIR'
const APP_FOLDER_NAME = 'Job Search Assistant'
const APP_FOLDER_NAME_LINUX = 'job-search-assistant'

export interface AppPaths {
  appDataDir: string
  databaseDir: string
  databaseFile: string
  documentsDir: string
}

export function resolveAppDataDir(): string {
  const override = process.env[DATA_DIR_ENV_VAR]?.trim()
  if (override) {
    return override
  }

  if (process.platform === 'win32') {
    const roaming = process.env.APPDATA?.trim()
    if (roaming) {
      return join(roaming, APP_FOLDER_NAME)
    }
    return join(homedir(), 'AppData', 'Roaming', APP_FOLDER_NAME)
  }

  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', APP_FOLDER_NAME)
  }

  const xdgDataHome = process.env.XDG_DATA_HOME?.trim()
  if (xdgDataHome) {
    return join(xdgDataHome, APP_FOLDER_NAME_LINUX)
  }
  return join(homedir(), '.local', 'share', APP_FOLDER_NAME_LINUX)
}

export function resolveAppPaths(): AppPaths {
  const appDataDir = resolveAppDataDir()
  const databaseDir = join(appDataDir, 'database')
  return {
    appDataDir,
    databaseDir,
    databaseFile: join(databaseDir, 'job-search-assistant.db'),
    documentsDir: join(appDataDir, 'documents', 'applications'),
  }
}

export function ensureAppDirectories(paths: AppPaths = resolveAppPaths()): AppPaths {
  mkdirSync(paths.databaseDir, { recursive: true })
  mkdirSync(paths.documentsDir, { recursive: true })
  return paths
}
