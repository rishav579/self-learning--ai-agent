/**
 * bun test preload — must run before ANY module that touches the database.
 * Points Prisma at an isolated test database.
 * Schema is created by: bun run db:push:test  (see package.json)
 */
process.env.DATABASE_URL = 'file:/home/z/my-project/db/test.db'
