import { test } from "@playwright/test";
import assert from "node:assert/strict";
import { migrationUp } from "./migrations";
test("Goose parser preserves procedural SQL and excludes down migrations", () => {
  const sql = migrationUp('-- +goose Up\n-- +goose StatementBegin\nDO $$ BEGIN PERFORM 1; END $$;\n-- +goose StatementEnd\n-- +goose Down\nDROP TABLE test;');
  assert.match(sql, /DO \$\$ BEGIN PERFORM 1; END \$\$/); assert.ok(!sql.includes("DROP TABLE"));
});
test("Goose parser rejects unsupported directives before executing SQL", () => {
  assert.throws(() => migrationUp("SELECT 1"));
  assert.throws(() => migrationUp("-- +goose NO TRANSACTION\n-- +goose Up\nSELECT 1"));
});
