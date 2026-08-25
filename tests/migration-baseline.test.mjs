import assert from "node:assert/strict";
import crypto from "node:crypto";
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

  const expectedRepositoryFiles = baseline.migrations
    .filter(([version]) => version >= baseline.repository_history_start)
    .map(([version, name]) => `${version}_${name}.sql`);
  const actualRepositoryFiles = fs
    .readdirSync(path.join(root, "supabase/migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  assert.deepEqual(
    actualRepositoryFiles,
    expectedRepositoryFiles,
    "supabase/migrations must exactly match the applied production history",
  );

  for (const file of actualRepositoryFiles) {
    const version = file.split("_", 1)[0];
    const expectedMd5 = baseline.repository_statement_md5[version];
    assert.ok(expectedMd5, `missing Production checksum for ${file}`);

    const rawSql = fs.readFileSync(path.join(root, "supabase/migrations", file), "utf8").replace(/\r\n/g, "\n");
    const sql = Buffer.from(rawSql);
    const hashes = [
      crypto.createHash("md5").update(sql).digest("hex"),
    ];
    if (sql.at(-1) === 10) {
      hashes.push(
        crypto.createHash("md5").update(sql.subarray(0, -1)).digest("hex"),
      );
    }
    assert.ok(
      hashes.includes(expectedMd5),
      `${file} differs from the SQL statement recorded by Production`,
    );
  }
});

test("bootstrap and superseded candidates cannot be replayed as migrations", () => {
  for (const directory of ["bootstrap", "archive"]) {
    assert.ok(fs.existsSync(path.join(root, "supabase", directory)));
  }

  const migrationFiles = fs.readdirSync(
    path.join(root, "supabase/migrations"),
  );
  assert.ok(migrationFiles.every((file) => /^\d{14}_.+\.sql$/.test(file)));
});
