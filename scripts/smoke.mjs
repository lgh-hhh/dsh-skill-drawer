/**
 * Offline smoke test — runs without installing anything.
 *
 * Host half:
 *   1. every `ctx.*` service it touches is declared in `inject`
 *   2. it registers exactly one prefix route, under /dsh-skill-drawer/api
 *   3. unknown paths answer 404; /notes answers { ok: true, notes: {} }
 *   4. a missing or throwing webServer never escapes apply()
 *
 * Client half:
 *   5. it loads through __ModuleLoader__ with the right id
 *   6. the factory returns { inject, apply }; every `ctx.*` is declared
 *   7. it registers the trigger slot and the overlay slot
 *   8. slot failures never escape apply()
 *
 * Run with: node scripts/smoke.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const ok = []
const hostUrl = new URL('../index.js', import.meta.url)
const clientUrl = new URL('../client.js', import.meta.url)

/* ------------------------------------------------------------------ host */
const host = await import(hostUrl)

// Cordis throws at property access when a service is not declared in
// `export const inject`. That throw happens inside the N-API loader and can kill the
// whole host process (exit 134), so `try/catch` inside apply() is NOT a safety net.
// Fail the build statically instead: every `ctx.<service>` must be declared.
const CORDIS_BUILTINS = new Set([
  'effect', 'on', 'inject', 'get', 'set', 'logger', 'emit', 'bail', 'waterfall',
  'parallel', 'scope', 'plugin', 'root', 'fiber', 'runtime', 'reflect', 'registry',
  'extend', 'isolate',
])

function servicesUsedIn(source) {
  const used = new Set()
  for (const match of source.matchAll(/\bctx\.([A-Za-z_$][\w$]*)/g)) {
    if (!CORDIS_BUILTINS.has(match[1])) used.add(match[1])
  }
  return used
}

assert.ok(servicesUsedIn('ctx.webServer.register(x)').has('webServer'))
assert.ok(!servicesUsedIn('ctx.effect(fn)').has('effect'))

{
  const source = await readFile(hostUrl, 'utf8')
  const used = servicesUsedIn(source)
  const declared = new Set(host.inject || [])
  for (const service of used) {
    assert.ok(
      declared.has(service),
      `host uses ctx.${service} but does not export it in inject (Cordis throws at startup; try/catch does not help)`,
    )
  }
  ok.push(`host: every ctx.* service is declared in inject (${[...used].join(', ') || 'none'})`)
}

function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value
    },
    end(body) {
      this.body = body
    },
  }
}

function makeCtx() {
  const routes = []
  return {
    routes,
    ctx: {
      webServer: {
        register(route) {
          routes.push(route)
          return () => {}
        },
      },
      effect(setup) {
        return setup()
      },
    },
  }
}

{
  const { ctx, routes } = makeCtx()
  host.apply(ctx)
  assert.equal(routes.length, 1, 'host should register exactly one route')
  assert.equal(routes[0].path, '/dsh-skill-drawer/api')
  assert.equal(routes[0].kind, 'prefix')
  ok.push('host: one prefix route registered (not under /api)')
}

{
  const { ctx, routes } = makeCtx()
  host.apply(ctx)
  const res = fakeRes()
  await routes[0].handler({ method: 'GET', url: '/dsh-skill-drawer/api/nope' }, res)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(res.statusCode, 404)
  ok.push('host: unknown route answers 404')
}

{
  const { ctx, routes } = makeCtx()
  host.apply(ctx)
  const res = fakeRes()
  await routes[0].handler({ method: 'GET', url: '/dsh-skill-drawer/api/notes' }, res)
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(res.statusCode, 200)
  const body = JSON.parse(res.body)
  assert.equal(body.ok, true)
  assert.equal(typeof body.notes, 'object')
  ok.push('host: /notes answers { ok, notes }')
}

{
  // A missing or throwing web server must not throw out of apply().
  const warn = console.warn
  console.warn = () => {}
  try {
    host.apply({ effect: (setup) => setup() })
    host.apply({})
    host.apply(null)
    host.apply(undefined)
    host.apply({
      webServer: {
        register() {
          throw new Error('boom')
        },
      },
      effect: (setup) => setup(),
    })
  } finally {
    console.warn = warn
  }
  ok.push('host: registration failures are contained')
}

/* ---------------------------------------------------------------- client */
let captured = null
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      captured = definition
    },
  },
}

await import(clientUrl)

assert.ok(captured, 'client should call __ModuleLoader__.load')
assert.equal(captured.id, 'dsh-skill-drawer')
ok.push('client: loader handshake id matches package name')

function fakeReact() {
  class Component {
    constructor(props) {
      this.props = props
      this.state = {}
    }
  }
  return {
    createElement: () => null,
    Component,
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
  }
}

const React = fakeReact()
const moduleExports = captured.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected module: ${name}`)
})

assert.ok(moduleExports && typeof moduleExports.apply === 'function')
assert.deepEqual(moduleExports.inject, ['slots', 'remote', 'remote.skills'])
ok.push('client: inject lists slots + remote services')

{
  const source = await readFile(clientUrl, 'utf8')
  const used = servicesUsedIn(source)
  const declared = new Set(moduleExports.inject || [])
  for (const service of used) {
    assert.ok(
      declared.has(service),
      `client uses ctx.${service} but does not list it in inject`,
    )
  }
  ok.push(`client: every ctx.* service is declared in inject (${[...used].join(', ') || 'none'})`)
}

{
  const registrations = []
  moduleExports.apply({
    slots: {
      inject(key, callback) {
        return callback()
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
    remote: { skills: { list: async () => ({ ok: true, value: { skills: [] } }) } },
  })
  assert.equal(registrations.length, 2, 'client should register two slots')
  assert.deepEqual(
    registrations.map((entry) => entry.options.name),
    ['conversation.input.left', 'shell.overlay'],
  )
  assert.ok(registrations.every((entry) => typeof entry.component === 'function'))
  assert.ok(registrations.every((entry) => typeof entry.options.id === 'string' && entry.options.id.length > 0))
  ok.push('client: two slot registrations with components')
}

{
  const warn = console.warn
  console.warn = () => {}
  try {
    moduleExports.apply({})
    moduleExports.apply(null)
    moduleExports.apply({
      slots: {
        inject() {
          throw new Error('boom')
        },
        register() {
          return () => {}
        },
      },
    })
  } finally {
    console.warn = warn
  }
  ok.push('client: slot failures are contained')
}

console.log(`\nsmoke ok (${ok.length} checks)`)
for (const line of ok) console.log(`  ✓ ${line}`)
