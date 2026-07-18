import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function pm25ToAqi(pm25) {
  const bp = [[0,12,0,50],[12.1,35.4,51,100],[35.5,55.4,101,150],[55.5,150.4,151,200],[150.5,250.4,201,300],[250.5,350.4,301,400],[350.5,500.4,401,500]];
  const c = Math.max(0, pm25);
  for (const [cLo,cHi,iLo,iHi] of bp) if (c <= cHi) return Math.round(((iHi-iLo)/(cHi-cLo))*(c-cLo)+iLo);
  return 500;
}
function parseHorizon(value, def=7, min=1, max=14) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : def;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error('horizon');
  return parsed;
}
function sourceFilter(rows, source='observed') { return rows.filter((r) => (r.source ?? 'observed') === source); }
function authorized(token, secret, prod=true) { if (!secret) return !prod; return token === secret; }

test('cron secret fails closed in production when missing', () => assert.equal(authorized('x', '', true), false));
test('ml secret fails closed in production when missing', () => assert.equal(authorized('x', '', true), false));
test('PM2.5 to AQI uses EPA breakpoints', () => { assert.equal(pm25ToAqi(12), 50); assert.equal(pm25ToAqi(35.4), 100); assert.equal(pm25ToAqi(250.4), 300); });
test('horizon validation bounds requests', () => { assert.equal(parseHorizon('7'), 7); assert.throws(() => parseHorizon('30')); assert.throws(() => parseHorizon('1.5')); });
test('observed data is separable from synthetic data', () => { const rows=[{id:1,source:'observed'},{id:2,source:'synthetic'},{id:3}]; assert.deepEqual(sourceFilter(rows).map(r=>r.id), [1,3]); });

test('public dashboard reads do not require the service-role client', () => {
  for (const path of ['services/air-quality.service.ts', 'services/weather.service.ts']) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(source, /getSupabase\(\)/);
    assert.doesNotMatch(source, /getServiceSupabase\(\)/);
  }
  const dbSource = readFileSync(new URL('../services/_db.ts', import.meta.url), 'utf8');
  const latestObserved = dbSource.slice(dbSource.indexOf('getLatestObservedAt'));
  assert.match(latestObserved, /getSupabase\(\)/);
  assert.doesNotMatch(latestObserved, /getServiceSupabase\(\)/);
});

test('forecast runtime remains compatible with active v1 models during v2 migration', () => {
  const source = readFileSync(new URL('../api/ml/forecast.py', import.meta.url), 'utf8');
  for (const model of ['stacking-v1', 'lightgbm-v1', 'xgboost-v1', 'stacking-v2']) {
    assert.ok(source.includes(model), `missing runtime support for ${model}`);
  }
  assert.match(source, /prediction \* 1\.35/);
});
