import { customType } from 'drizzle-orm/pg-core'

// postgres-js returns Buffers for bytea; pglite returns plain Uint8Arrays
export const bytea = customType<{ data: Buffer; driverData: Uint8Array }>({
  dataType() {
    return 'bytea'
  },
  fromDriver(value) {
    return Buffer.from(value)
  },
})

export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext'
  },
})
