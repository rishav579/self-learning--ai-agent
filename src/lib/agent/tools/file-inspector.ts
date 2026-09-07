/**
 * Read-only file inspection, restricted to the project's `sandbox/` directory.
 * Safety:
 *   - read-only (no write/create/delete APIs are exposed at all)
 *   - path traversal protection (resolve + prefix check)
 *   - file count / size / depth caps
 * The sandbox is lazily bootstrapped with demo files so a fresh clone works.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const MAX_DEPTH = 4
const MAX_ENTRIES = 200
const MAX_FILE_BYTES = 200_000
const MAX_RETURN_CHARS = 20_000
const IGNORED = new Set(['node_modules', '.git', '__pycache__'])

function sandboxRoot(): string {
  // Works both under `next dev` (cwd = project root) and `bun test` (cwd = project root)
  return path.resolve(process.cwd(), 'sandbox')
}

let bootstrapped = false
async function ensureSandbox(): Promise<string> {
  const root = sandboxRoot()
  if (bootstrapped) return root
  try {
    await fs.mkdir(path.join(root, 'config'), { recursive: true })
    const notes = path.join(root, 'notes.txt')
    try {
      await fs.access(notes)
    } catch {
      await fs.writeFile(
        notes,
        'Deployment environment: staging\nRegion: us-east-1\nOwner: platform-team\nRelease channel: beta\n',
      )
    }
    const settings = path.join(root, 'config', 'settings.yaml')
    try {
      await fs.access(settings)
    } catch {
      await fs.writeFile(
        settings,
        'api:\n  timeout_seconds: 30\n  retries: 3\n  base_url: https://api.internal\n  version: 2\n',
      )
    }
    bootstrapped = true
  } catch (e) {
    throw new Error(`Sandbox bootstrap failed: ${(e as Error).message}`)
  }
  return root
}

function safeResolve(root: string, relPath: string): string {
  const cleaned = (relPath ?? '').trim().replace(/^[/\\]+/, '')
  const resolved = path.resolve(root, cleaned)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('Path escapes sandbox')
  }
  return resolved
}

export async function listSandboxFiles(): Promise<string[]> {
  const root = await ensureSandbox()
  const out: string[] = []
  async function walk(dir: string, depth: number, prefix: string) {
    if (depth > MAX_DEPTH || out.length >= MAX_ENTRIES) return
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (IGNORED.has(e.name)) continue
      if (out.length >= MAX_ENTRIES) return
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      out.push(rel)
      if (e.isDirectory()) await walk(path.join(dir, e.name), depth + 1, rel)
    }
  }
  await walk(root, 0, '')
  return out
}

export async function readSandboxFile(relPath: string): Promise<string> {
  const root = await ensureSandbox()
  const resolved = safeResolve(root, relPath)
  const stat = await fs.stat(resolved)
  if (!stat.isFile()) throw new Error('Not a regular file')
  if (stat.size > MAX_FILE_BYTES) throw new Error(`File too large (${stat.size} bytes > ${MAX_FILE_BYTES})`)
  const content = await fs.readFile(resolved, 'utf8')
  return content.length > MAX_RETURN_CHARS ? content.slice(0, MAX_RETURN_CHARS) + '…[truncated]' : content
}
