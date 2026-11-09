import 'dotenv/config'

const config = {
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.VOIDKOI_DATABASE_URL,
  },
}

export default config
