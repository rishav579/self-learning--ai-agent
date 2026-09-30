/**
 * bun test preload — must run before ANY module that touches the database.
 * Points Prisma at an isolated test database.
 * Schema is created by: bun run db:push:test  (see package.json)
 */
import path from 'node:path'

const testDbPath = path.resolve(process.cwd(), 'db/test.db')
process.env.DATABASE_URL = process.env.DATABASE_URL || `file:${testDbPath}`
