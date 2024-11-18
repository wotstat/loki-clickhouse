import { clickhouse } from './db'
import type { ClickHouseSettings } from '@clickhouse/client'

const asyncInsertSettings = {
  async_insert: 1,
  wait_for_async_insert: 0,
  async_insert_busy_timeout_ms: 1000,
} satisfies ClickHouseSettings

const insertCache: { [key: string]: any } = {}

async function insertTask() {
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 300))
    const keys = Object.keys(insertCache)
    if (keys.length === 0) continue

    for (const key of keys) {
      const data = insertCache[key]
      delete insertCache[key]

      try {
        await clickhouse.insert({
          table: key,
          values: data,
          format: 'JSONEachRow',
          clickhouse_settings: asyncInsertSettings
        })
      } catch (e) {
        console.error(e)
        console.error(`insert into ${key}`, data);
      }
    }
  }
}

insertTask()

export function insert<T>(tableName: string, ...data: T[]) {
  if (!insertCache[tableName]) insertCache[tableName] = []
  insertCache[tableName].push(...data)
}
