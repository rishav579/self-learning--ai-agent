import { describe, expect, test } from 'bun:test'
import { listSandboxFiles, readSandboxFile } from '@/lib/agent/tools/file-inspector'

describe('file_inspector sandbox', () => {
  test('bootstraps demo files and lists them', async () => {
    const files = await listSandboxFiles()
    expect(files).toContain('notes.txt')
    expect(files).toContain('config/settings.yaml')
  })

  test('reads a file by relative path', async () => {
    const content = await readSandboxFile('notes.txt')
    expect(content).toContain('staging')
    expect(content).toContain('us-east-1')
  })

  test('reads nested config', async () => {
    const content = await readSandboxFile('config/settings.yaml')
    expect(content).toContain('timeout_seconds: 30')
  })

  test('BLOCKS path traversal', async () => {
    await expect(readSandboxFile('../prisma/schema.prisma')).rejects.toThrow()
    await expect(readSandboxFile('../../etc/passwd')).rejects.toThrow()
    await expect(readSandboxFile('../../../etc/passwd')).rejects.toThrow()
  })

  test('BLOCKS absolute path escape', async () => {
    await expect(readSandboxFile('/etc/passwd')).rejects.toThrow()
    await expect(readSandboxFile('/etc/shadow')).rejects.toThrow()
  })

  test('missing file is a clean error', async () => {
    await expect(readSandboxFile('does-not-exist.txt')).rejects.toThrow()
  })
})
