/**
 * Host half of the skill drawer.
 *
 * It serves exactly one thing: the local Chinese notes file
 *
 *     ~/.dsh/skill-drawer/notes-zh.json   ({ "skill-name": "一句中文" })
 *
 * The repository ships no translations; the page asks for them at runtime and falls
 * back to the skill's own description when the file is absent.
 *
 * Rules kept from the crash post-mortem (see AGENTS.md):
 * - every `ctx.*` service is declared in `inject`;
 * - registration failures are caught and logged, never rethrown into the Loader;
 * - the route lives under `/dsh-skill-drawer/api`, NOT `/api` (the shipped connection
 *   layer owns `/api` and would answer first).
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const inject = ['webServer']

const ROUTE_PREFIX = '/dsh-skill-drawer/api'
const MAX_FILE_BYTES = 256 * 1024
const MAX_NOTE_CHARS = 240

function notesFile() {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  return path.join(home, '.dsh', 'skill-drawer', 'notes-zh.json')
}

function sendJson(res, status, body) {
  try {
    if (typeof res.statusCode === 'number') res.statusCode = status
    if (typeof res.setHeader === 'function') {
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
    }
    res.end(JSON.stringify(body))
  } catch {
    /* a dead socket is not our problem */
  }
}

/** Read the local notes file. Any failure (missing, unreadable, malformed) answers {}. */
async function readNotes() {
  try {
    const text = await readFile(notesFile(), 'utf8')
    if (text.length > MAX_FILE_BYTES) return {}
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const notes = {}
    for (const [name, note] of Object.entries(parsed)) {
      if (typeof name !== 'string' || name === '') continue
      if (typeof note !== 'string' || note === '') continue
      notes[name] = note.slice(0, MAX_NOTE_CHARS)
    }
    return notes
  } catch {
    return {}
  }
}

async function handle(req, res) {
  try {
    const url = new URL((req && req.url) || '/', 'http://127.0.0.1')
    if (req && req.method === 'GET' && url.pathname === `${ROUTE_PREFIX}/notes`) {
      sendJson(res, 200, { ok: true, notes: await readNotes() })
      return
    }
    sendJson(res, 404, { ok: false, error: 'not-found' })
  } catch (error) {
    sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
  }
}

export function apply(ctx) {
  try {
    if (!ctx || !ctx.webServer || typeof ctx.webServer.register !== 'function') {
      console.warn('[dsh-skill-drawer] webServer unavailable; local notes disabled')
      return
    }
    ctx.effect(() => {
      let dispose = null
      try {
        dispose = ctx.webServer.register({
          kind: 'prefix',
          path: ROUTE_PREFIX,
          handler: (req, res) => {
            handle(req, res)
          },
        })
      } catch (error) {
        console.warn('[dsh-skill-drawer] notes route skipped:', error)
      }
      return () => {
        try {
          if (dispose) dispose()
        } catch {
          /* ignore disposal failures */
        }
      }
    })
  } catch (error) {
    console.warn('[dsh-skill-drawer] host apply failed; local notes disabled:', error)
  }
}
