declare module "bun" {
  interface Env {
    readonly CLICKHOUSE_URL: string;
    readonly CLICKHOUSE_USER: string;
    readonly CLICKHOUSE_PASSWORD: string;
    readonly CLICKHOUSE_DATABASE: string;
  }
}
