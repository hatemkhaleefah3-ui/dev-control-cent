import p1 from "./template-parts/p1";
import p2 from "./template-parts/p2";
import p3 from "./template-parts/p3";
import p4 from "./template-parts/p4";
import p5 from "./template-parts/p5";
import p6 from "./template-parts/p6";
import p7 from "./template-parts/p7";

const AUTH_WORKER_TEMPLATE = p1+p2+p3+p4+p5+p6+p7;
export function authWorker(title: string): string { return AUTH_WORKER_TEMPLATE.replace("__APP_TITLE_JSON__", JSON.stringify(title)); }
export function authPackage(name: string): string { return JSON.stringify({ name, version: "1.0.0", private: true, scripts: { build: "echo ready", dev: "wrangler dev", deploy: "wrangler deploy" }, devDependencies: { wrangler: "^4.118.0" } }, null, 2) + "\n"; }
export function authWrangler(name: string, databaseId: string, databaseName: string, bucketName: string): string { return JSON.stringify({ $schema: "node_modules/wrangler/config-schema.json", name, main: "src/index.js", compatibility_date: "2026-08-04", d1_databases: [{ binding: "DB", database_name: databaseName, database_id: databaseId, migrations_dir: "migrations" }], r2_buckets: [{ binding: "BUCKET", bucket_name: bucketName }], observability: { enabled: true, head_sampling_rate: 1 } }, null, 2) + "\n"; }
