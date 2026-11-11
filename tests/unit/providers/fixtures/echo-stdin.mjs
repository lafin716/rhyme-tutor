import process from "node:process";
// Test fixture: echoes argv (after the script path) and stdin as one JSON line.
import { readFileSync } from 'node:fs'

const stdin = readFileSync(0, 'utf8')
process.stdout.write(`${JSON.stringify({ argv: process.argv.slice(2), stdin })}\n`)
