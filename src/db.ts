import { createClient } from '@clickhouse/client'

export const clickhouse = createClient({
  url: Bun.env.CLICKHOUSE_URL,
  username: Bun.env.CLICKHOUSE_USER,
  password: Bun.env.CLICKHOUSE_PASSWORD,
  request_timeout: 60000,
})

console.log(`Connecting to ClickHouse at ${Bun.env.CLICKHOUSE_URL}...`);

export async function connect(options: { timeout?: number }) {
  const timeout = options.timeout ?? 0;
  const delay = 0.5;

  for (let i = 0; i <= timeout; i += delay) {
    try {
      const ping = await clickhouse.query({ query: `select 1;` })
      if (ping && ping.query_id) {
        console.log('ClickHouse connected');
        return true
      }
    } catch (e: any) {
      if (i == 0) console.log(`ClickHouse is not available: ${e?.message}, retrying...`);
    }
    await new Promise(r => setTimeout(r, delay * 1000))
  }
  return false;
}
