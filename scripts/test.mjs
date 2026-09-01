// Runs the test suite on the same runtime the app ships with, so `node:sqlite`
// and the Node version match production exactly. Cross-platform, no cross-env.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const electron = require('electron')
// `bin` is not in the package `exports` map, so resolve it from package.json.
const pkgDir = path.dirname(require.resolve('vitest/package.json'))
const vitest = path.join(pkgDir, require('vitest/package.json').bin.vitest)

spawn(electron, [vitest, ...(process.argv.slice(2).length ? process.argv.slice(2) : ['run'])], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
}).on('exit', (code) => process.exit(code ?? 1))
