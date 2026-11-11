import process from "node:process";
import { setInterval } from "node:timers";
// Test fixture: spawns a grandchild that sleeps, writes both pids to argv[2] as JSON, then sleeps.
// Used to verify the runner kills the whole process tree on timeout/abort.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const pidFile = process.argv[2]
if (!pidFile) {
  process.stderr.write('missing pid file argument\n')
  process.exit(2)
}

const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
writeFileSync(pidFile, JSON.stringify({ self: process.pid, child: child.pid }))
setInterval(() => {}, 1000)
