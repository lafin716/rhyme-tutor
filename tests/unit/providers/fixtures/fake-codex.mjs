import process from "node:process";
import { setInterval } from "node:timers";
// Test fixture: stands in for the `codex` CLI. Behavior is chosen by argv (subcommands) and by
// `FAKE:<mode>` markers in the stdin payload. `--fake-*` args are test-only switches and are stripped.
// Never touches real credentials.
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--fake-'))

if (args.includes('--version')) {
  process.stdout.write('codex-cli 0.164.0\n')
  process.exit(0)
}

if (args[0] === 'login' && args[1] === 'status') {
  const loggedIn = !process.argv.includes('--fake-logged-out')
  process.stdout.write(loggedIn ? 'Logged in using ChatGPT\n' : 'Not logged in\n')
  process.exit(loggedIn ? 0 : 1)
}

const stdin = readFileSync(0, 'utf8')
const emit = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`)

emit({ type: 'thread.started', thread_id: 'fake-thread' })
emit({ type: 'turn.started' })

if (stdin.includes('FAKE:echo')) {
  // Reports what the child received: argv, cwd, and env variable NAMES only (never values).
  const report = { argv: args, cwd: process.cwd(), envKeys: Object.keys(process.env).sort() }
  emit({ type: 'item.completed', item: { id: 'm1', type: 'agent_message', text: JSON.stringify(report) } })
  emit({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } })
  process.exit(0)
}
if (stdin.includes('FAKE:fail')) {
  emit({ type: 'turn.failed', error: { message: 'model exploded' } })
  process.exit(0)
}
if (stdin.includes('FAKE:limit')) {
  emit({ type: 'turn.failed', error: { message: 'You have hit the usage limit' } })
  process.exit(0)
}
if (stdin.includes('FAKE:hang')) {
  setInterval(() => {}, 1000)
} else {
  // Non-fatal top-level error and a non-agent item must both be ignored.
  emit({ type: 'error', message: 'config warning: ignored' })
  emit({ type: 'item.completed', item: { id: 'r0', type: 'reasoning', text: '...' } })
  emit({ type: 'item.completed', item: { id: 'm1', type: 'agent_message', text: '코덱스 테스트 응답입니다.' } })
  emit({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } })
  process.exit(0)
}
