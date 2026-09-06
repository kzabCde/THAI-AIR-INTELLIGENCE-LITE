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

  // Repository migration filenames are a checked-in projection of Production
  // history, not a timestamp mirror. Connector-applied migrations can have a
  // Production version that differs from the local reviewed filename, and
  // some connector-created setup migrations intentionally have no replayable
  // repository SQL file. The checksum inventory is therefore authoritative
  // for local files, while repository_migration_aliases maps any local version
  // to the exact remote migration it represents.
  const remoteNameByVersion = new Map(baseline.migrations);
  const aliases = baseline.repository_migration_aliases ?? {};
  const repositoryVersions = Object.keys(baseline.repository_statement_md5).sort();
  assert.ok(
    repositoryVersions.every(
      (version) => version >= baseline.repository_history_start,
    ),
    "repository checksum inventory contains a pre-history migration",
  );

  const expectedRepositoryFiles = repositoryVersions.map((localVersion) => {
    const alias = aliases[localVersion];
    const remoteVersion = alias?.remote_version ?? localVersion;
    const remoteName = remoteNameByVersion.get(remoteVersion);
    assert.ok(
      remoteName,
      `local migration ${localVersion} has no matching Production migration`,
    );
    if (alias?.remote_name) {
      assert.equal(
        alias.remote_name,
        remoteName,
        `migration alias name drifted for ${localVersion}`,
      );
    }
    return `${localVersion}_${remoteName}.sql`;
  });

  const actualRepositoryFiles = fs
    .readdirSync(path.join(root, "supabase/migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  assert.deepEqual(
    actualRepositoryFiles,
    expectedRepositoryFiles,
    "supabase/migrations must exactly match the reviewed repository projection of Production history",
  );

  for (const file of actualRepositoryFiles) {
    const version = file.split("_", 1)[0];
    const expectedMd5 = baseline.repository_statement_md5[version];
    assert.ok(expectedMd5, `missing Production/review checksum for ${file}`);

    const rawSql = fs
      .readFileSync(path.join(root, "supabase/migrations", file), "utf8")
      .replace(/\r\n/g, "\n");
    const sql = Buffer.from(rawSql);
    const hashes = [crypto.createHash("md5").update(sql).digest("hex")];
    if (sql.at(-1) === 10) {
      hashes.push(
        crypto
          .createHash("md5")
          .update(sql.subarray(0, -1))
          .digest("hex"),
      );
    }
    assert.ok(
      hashes.includes(expectedMd5),
      `${file} differs from the reviewed SQL statement checksum`,
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
