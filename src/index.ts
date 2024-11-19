import { Hono } from "hono";
import { cors } from 'hono/cors'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

import { connect, clickhouse } from './db.ts'
import { insert } from "./batchInsert.ts";

import { loki } from './generated/loki.ts'
import { uncompress } from 'snappyjs'

const app = new Hono();
app.use(cors());

const targetTable = `${Bun.env.CLICKHOUSE_DATABASE ?? 'Logs'}.Loki`;

app.post('/loki/api/v1/push',
  async (c, next) => {
    const contentType = c.req.header('content-type');
    if (contentType === 'application/json') return await next();
    if (contentType !== 'application/x-protobuf') return c.text('Invalid content-type', 400);

    try {
      const buffer = new Uint8Array(await c.req.arrayBuffer());
      const uncompressed = uncompress(buffer);
      const message = loki.PushRequest.deserialize(uncompressed);

      insert(targetTable, ...message.streams.flatMap(stream => {
        const labels = Object.fromEntries([...stream.labels.matchAll(/(\w+)=["']?([^,"'}]+)["']?/g)].map(m => [m[1], m[2]]));

        return stream.entries.map(entry => ({
          time: `${entry.timestamp.seconds}${entry.timestamp.nanos.toString().padStart(9, '0')}`,
          message: entry.line,
          metadata: {
            ...labels,
            ...Object.fromEntries(entry.structuredMetadata.map(m => [m.name, m.value]))
          }
        }))
      }));

    } catch (error) {
      console.error(error);
      return c.text('Invalid request: \n' + error, 400);
    }

    return c.text('OK');
  },
  zValidator('json',
    z.object({
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

      insert(targetTable, ...streams.flatMap(stream =>
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

await clickhouse.exec({ query: `create database if not exists ${Bun.env.CLICKHOUSE_DATABASE ?? 'Logs'}` })
await clickhouse.exec({
  query: `
create table if not exists ${targetTable} (
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
