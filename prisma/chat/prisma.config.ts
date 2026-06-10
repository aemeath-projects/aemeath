import { defineConfig } from 'prisma/config'
import { config } from 'dotenv'

config()

export default defineConfig({
  schema: './schema.prisma',
  migrations: {
    path: './migrations',
  },
  datasource: {
    url: process.env['CHAT_DATABASE_URL'] ?? '',
  },
})
