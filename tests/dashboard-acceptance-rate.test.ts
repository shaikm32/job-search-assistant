/**
 * Dashboard connection acceptance rate.
 *
 * The rate is accepted outgoing requests divided by all outgoing requests sent
 * (pending + accepted + declined). These tests use the production service and
 * an isolated temporary SQLite database.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, describe, it } from 'node:test'
import type { ConnectionStatus } from '../shared/domain/person.js'

const tempDataDir = mkdtempSync(join(tmpdir(), 'jsa-dashboard-rate-'))
mkdirSync(join(tempDataDir, 'database'), { recursive: true })
process.env.JOB_SEARCH_ASSISTANT_DATA_DIR = tempDataDir

const { closeDatabase, getDatabase, openDatabase } = await import(
  '../server/database/connection.js'
)
const { runMigrations } = await import('../server/database/migrate.js')
const { createPerson } = await import('../server/modules/people/person.service.js')
const { getDashboardSummary } = await import(
  '../server/modules/dashboard/dashboard.service.js'
)

function addPeople(connectionStatus: ConnectionStatus, count: number): void {
  for (let index = 1; index <= count; index += 1) {
    createPerson({
      name: `${connectionStatus} ${index}`,
      connectionStatus,
    })
  }
}

before(() => {
  openDatabase()
  runMigrations(getDatabase())
})

beforeEach(() => {
  getDatabase().prepare('DELETE FROM people').run()
})

after(() => {
  closeDatabase()
})

describe('dashboard connection acceptance rate', () => {
  it('reports 100% when the only sent request was accepted', () => {
    addPeople('Connected', 1)

    const { networking } = getDashboardSummary()

    assert.equal(networking.acceptanceRate, 100)
  })

  it('reports 20% for 100 sent requests with 20 accepted, 30 pending, and 50 declined', () => {
    addPeople('Connected', 20)
    addPeople('Request Sent', 30)
    addPeople('Not Connected', 50)

    const { networking } = getDashboardSummary()

    assert.equal(networking.total, 100)
    assert.equal(networking.requestsSent, 30)
    assert.equal(networking.connected, 20)
    assert.equal(networking.acceptanceRate, 20)
  })

  it('reports 0% when requests were sent but none were accepted', () => {
    addPeople('Request Sent', 10)

    const { networking } = getDashboardSummary()

    assert.equal(networking.acceptanceRate, 0)
  })

  it('reports N/A when no requests have been sent', () => {
    addPeople('Identified', 1)

    const { networking } = getDashboardSummary()

    assert.equal(networking.acceptanceRate, null)
  })

  it('does not count contacts without an outgoing request', () => {
    // The People model has no incoming-request direction. An incoming-only
    // contact is therefore an Identified person, which must stay out of both
    // the numerator and the denominator.
    addPeople('Connected', 1)
    addPeople('Request Sent', 1)
    addPeople('Identified', 3)

    const { networking } = getDashboardSummary()

    assert.equal(networking.total, 5)
    assert.equal(networking.acceptanceRate, 50)
  })
})
