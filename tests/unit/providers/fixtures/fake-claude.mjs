import process from "node:process";
import { setInterval } from "node:timers";
// Test fixture: stands in for the `claude` CLI. Behavior is chosen by argv (subcommands) and by
// `FAKE:<mode>` markers in the stdin prompt. `--fake-*` args are test-only switches and are stripped.
// Never touches real credentials.
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--fake-'))

if (args.includes('--version')) {
  process.stdout.write('2.1.322 (Claude Code)\n')
  process.exit(0)
}

if (args[0] === 'auth' && args[1] === 'status') {
  const loggedIn = !process.argv.includes('--fake-logged-out')
  process.stdout.write(`${JSON.stringify({ loggedIn, authMethod: 'fake' })}\n`)
  process.exit(loggedIn ? 0 : 1)
}

const prompt = readFileSync(0, 'utf8')
const emit = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`)

if (prompt.includes('FAKE:echo')) {
  // Reports what the child received: argv, cwd, and env variable NAMES only (never values).
  const report = { argv: args, cwd: process.cwd(), envKeys: Object.keys(process.env).sort() }
  emit({ type: 'system', subtype: 'init' })
  emit({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(report) })
  process.exit(0)
}
if (prompt.includes('FAKE:fail')) {
  process.stderr.write('internal boom\n')
  process.exit(3)
}
if (prompt.includes('FAKE:auth')) {
  process.stderr.write('Not logged in. Please run /login\n')
  process.exit(1)
}
if (prompt.includes('FAKE:hang')) {
  // Never finishes; the adapter must time out or abort it.
  setInterval(() => {}, 1000)
} else if (prompt.includes('FAKE:error_result')) {
  emit({ type: 'system', subtype: 'init' })
  emit({ type: 'result', subtype: 'error', is_error: true, result: 'Usage limit reached for this plan' })
  process.exit(0)
} else {
  const text = prompt.includes('FAKE:json') ? '{"ok":true}' : '안녕하세요 테스트 응답입니다.'
  emit({ type: 'system', subtype: 'init' })
  for (const piece of [text.slice(0, 5), text.slice(5)]) {
    emit({
      type: 'stream_event',
      event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: piece } }
    })
  }
  emit({ type: 'stream_event', event: { type: 'message_stop' } })
  emit({ type: 'result', subtype: 'success', is_error: false, result: text })
  process.exit(0)
}
