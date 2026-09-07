import { describe, expect, test } from 'bun:test'
import { isPrivateIp } from '@/lib/agent/tools/http-get'
import * as httpGetModule from '@/lib/agent/tools/http-get'

describe('http_get SSRF guards', () => {
  test('isPrivateIp detects private IPv4 ranges', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true)
    expect(isPrivateIp('127.0.0.1')).toBe(true)
    expect(isPrivateIp('169.254.1.1')).toBe(true)
    expect(isPrivateIp('172.16.0.1')).toBe(true)
    expect(isPrivateIp('172.31.255.255')).toBe(true)
    expect(isPrivateIp('192.168.1.1')).toBe(true)
    expect(isPrivateIp('100.64.0.1')).toBe(true)
    expect(isPrivateIp('0.0.0.0')).toBe(true)
  })

  test('isPrivateIp allows public IPv4', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false)
    expect(isPrivateIp('1.1.1.1')).toBe(false)
    expect(isPrivateIp('172.32.0.1')).toBe(false)
  })

  test('isPrivateIp handles IPv6 locals', () => {
    expect(isPrivateIp('::1')).toBe(true)
    expect(isPrivateIp('fe80::1')).toBe(true)
    expect(isPrivateIp('fd00::1')).toBe(true)
    expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true)
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false)
  })

  test('rejects bad protocols and credentials without network calls', async () => {
    const r1 = await httpGetModule.httpGet('ftp://example.com/file')
    expect(r1.success).toBe(false)
    expect(r1.error).toContain('Only http/https')

    const r2 = await httpGetModule.httpGet('http://user:pass@example.com/')
    expect(r2.success).toBe(false)
    expect(r2.error).toContain('credentials')

    const r3 = await httpGetModule.httpGet('not a url')
    expect(r3.success).toBe(false)
  })

  test('blocks localhost and private literal IPs', async () => {
    const r1 = await httpGetModule.httpGet('http://localhost:3000/')
    expect(r1.success).toBe(false)
    expect(r1.error).toContain('not allowed')

    const r2 = await httpGetModule.httpGet('http://127.0.0.1:3000/')
    expect(r2.success).toBe(false)

    const r3 = await httpGetModule.httpGet('http://192.168.1.1/')
    expect(r3.success).toBe(false)
  })
})
