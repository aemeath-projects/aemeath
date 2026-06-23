import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'

config()

export default defineConfig({
  schema: './schema.prisma',
  migrations: {
    path: './migrations',
  },
  datasource: {
    url: process.env.IRIS_DATABASE_URL ?? '',
  },
})
