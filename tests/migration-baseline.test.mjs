import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const baseline = JSON.parse(
  fs.readFileSync(
    path.join(root, "supabase/production-migration-baseline.json"),
    "utf8",
  ),
);

test("production migration inventory is ordered and reconciled", () => {
  assert.equal(baseline.migrations.length, baseline.remote_migration_count);
  const versions = baseline.migrations.map(([version]) => version);
  assert.deepEqual(versions, [...versions].sort());
  assert.equal(new Set(versions).size, versions.length);
  assert.deepEqual(
    baseline.migrations.at(-1),
    [baseline.remote_head.version, baseline.remote_head.name],
  );

  const nextVersion = baseline.next_repository_migration.split("_", 1)[0];
  assert.ok(nextVersion > baseline.remote_head.version);
  assert.ok(
    fs.existsSync(
      path.join(root, "supabase/migrations", baseline.next_repository_migration),
    ),
  );
});
