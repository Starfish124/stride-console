import test from 'node:test';
import assert from 'node:assert/strict';
import { nextSevenDays } from '../lib/week-peek.ts';
test('week overview rolls across the year without losing or duplicating days', () => {
  const days = nextSevenDays('2026-12-29');
  assert.deepEqual(days.map(d => d.iso), ['2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03','2027-01-04']);
  assert.equal(days[3].number, 1);
  assert.equal(days[3].day, 'Fri');
});
test('week overview includes leap day and preserves dates across DST', () => {
  assert.equal(nextSevenDays('2028-02-27')[2].iso, '2028-02-29');
  assert.equal(nextSevenDays('2026-03-27')[6].iso, '2026-04-02');
});
