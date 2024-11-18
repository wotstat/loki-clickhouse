import { Hono } from "hono";
import { cors } from 'hono/cors'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

import { connect, clickhouse } from './db.ts'
import { insert } from "./batchInsert.ts";

const app = new Hono();
app.use(cors());


app.post('/loki/api/v1/push',
  zValidator('json', z.object({
    streams: z.array(z.object({
      stream: z.record(z.string()),
      values: z.array(
        z.union([
          z.tuple([
            z.string(),
            z.string(),
            z.record(z.any())
          ]),
          z.tuple([z.string(), z.string()])
        ])
      ),
    })),
  }),
    async (result, c) => {

      if (!result.success) {
        return c.text('Invalid request: \n' + result.error, 400);
      }

      const { streams } = result.data;

      insert('Loki.Logs', ...streams.flatMap(stream =>
        stream.values.map(v => ({
          time: v[0],
          message: v[1],
          metadata: {
            ...stream.stream,
            ...v[2]
          }
        }))))

      return c.text('OK');
    })
);


if (!await connect({ timeout: 10 })) {
  throw new Error('ClickHouse is not available')
}

await clickhouse.exec({ query: `create database if not exists Loki` })
await clickhouse.exec({
  query: `
create table if not exists Loki.Logs (
    time DateTime64(9),
    message String,
    metadata JSON,
    source LowCardinality(String) MATERIALIZED getSubcolumn(metadata, 'source'),
    level LowCardinality(String) MATERIALIZED getSubcolumn(metadata, 'level')
)
engine = MergeTree()
order by time
ttl toDateTime(time) + interval 7 day;`,
  clickhouse_settings: {
    allow_experimental_json_type: 1
  }
})

console.log(`Server is listening on port ${Bun.env.PORT}`);


export default {
  port: Bun.env.PORT,
  fetch: app.fetch,
}
