const test = require('node:test');
const assert = require('node:assert');
const L = require('../apps-script/Logic.gs');

function batch() {
  const t = L.defaultBatchTables_('Batch 4', '2026-10-01');
  t.Students = [
    { id: 'S001', name: 'Abdul Latif', nickname: 'Abdul', active: 'true' },
    { id: 'S002', name: 'Alfiyan Ardiansyah', nickname: 'Alfiyan', active: 'true', 'target:android': '50' },
    { id: 'S003', name: 'Old Student', active: 'false' }
  ];
  return t;
}

test('.gs files load as plain JS', () => {
  assert.ok(L.computeDashboard_);
});

test('milestone interpolation', () => {
  const ms = [{ day: 5, units: 13 }, { day: 10, units: 25 }];
  assert.strictEqual(L.interpolateMilestone_(ms, 0), 0);
  assert.strictEqual(L.interpolateMilestone_(ms, 5), 13);
  assert.strictEqual(L.interpolateMilestone_(ms, 10), 25);
  assert.ok(Math.abs(L.interpolateMilestone_(ms, 7) - 17.8) < 1e-9);
  assert.strictEqual(L.interpolateMilestone_(ms, 50), 25);
  assert.strictEqual(L.interpolateMilestone_([], 3), null);
});

test('dashboard totals, targets, status and series', () => {
  const t = batch();
  const reports = [
    { id: 'a', date: '2026-10-01', student: 'S001', category: 'android', units: '10' },
    { id: 'b', date: '2026-10-03', student: 'S001', category: 'iphone', units: '5' },
    { id: 'c', date: '2026-10-02', student: 'Alfiyan Ardiansyah', category: 'Laptop', units: '2' }, // by name / label
    { id: 'd', date: '2026-10-02', student: 'S003', category: 'android', units: '4' }, // inactive but has data
    { id: 'e', date: '2026-10-02', student: 'nobody', category: 'android', units: '9' }
  ];
  const d = L.computeDashboard_({
    settings: L.settingsToObject_(t.Settings), categories: t.Categories, students: t.Students,
    milestones: t.Milestones, reports, today: '2026-10-05'
  });
  assert.strictEqual(d.day, 5);
  assert.strictEqual(d.expectedToday, 13);
  assert.strictEqual(d.unmatchedReports, 1);
  assert.strictEqual(d.students.length, 3);
  const abdul = d.students.find(s => s.id === 'S001');
  assert.strictEqual(abdul.totalDone, 15);
  assert.strictEqual(abdul.totalTarget, 100);
  assert.strictEqual(abdul.pct, 15);
  assert.strictEqual(abdul.ach.android, 16.7);
  assert.strictEqual(abdul.status, 'on-track');
  assert.deepStrictEqual(abdul.cumulative.slice(0, 4), [10, 10, 15, 15]);
  const alf = d.students.find(s => s.id === 'S002');
  assert.strictEqual(alf.target.android, 50);
  assert.strictEqual(alf.totalTarget, 90);
  assert.strictEqual(alf.status, 'behind');
  assert.strictEqual(d.totals.totalDone, 21);
  assert.strictEqual(d.plan[4], 13);
  assert.strictEqual(d.seriesLen, 40);
});

test('inactive student with no reports is hidden', () => {
  const t = batch();
  const d = L.computeDashboard_({ settings: L.settingsToObject_(t.Settings), categories: t.Categories, students: t.Students,
    milestones: t.Milestones, reports: [], today: '2026-09-01' });
  assert.deepStrictEqual(d.students.map(s => s.id), ['S001', 'S002']);
  assert.strictEqual(d.day, 0);
});

test('report validation', () => {
  const t = batch();
  let r = L.validateReport_(t.FormFields, {}, t.Students, t.Categories);
  assert.strictEqual(r.errors.length, 3);
  r = L.validateReport_(t.FormFields, {
    date: '2026-10-02', student: 'S001', category: 'android', work_type: ['Ganti LCD', 'hack'],
    photo_before: { name: 'x.jpg', data: 'AAAA' }
  }, t.Students, t.Categories);
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.values.units, undefined);
  assert.strictEqual(r.values.work_type, 'Ganti LCD');
  assert.strictEqual(r.studentName, 'Abdul Latif');
  assert.deepStrictEqual(r.files, ['photo_before']);
  r = L.validateReport_(t.FormFields, { date: 'x', student: 'S003', category: 'tv' }, t.Students, t.Categories);
  assert.strictEqual(r.errors.length, 3);
});

test('form field sanitizing keeps system fields', () => {
  const out = L.sanitizeTable_('FormFields', [
    { label: 'Merk HP', type: 'text' }, { label: 'Merk HP', type: 'bogus' }, { key: 'units', label: 'Unit', type: 'text', required: false }
  ], {});
  const keys = out.rows.map(r => r.key);
  assert.deepStrictEqual(keys.slice(0, 3), ['merk_hp', 'merk_hp_2', 'units']);
  assert.strictEqual(out.rows[1].type, 'text');
  const units = out.rows.find(r => r.key === 'units');
  assert.strictEqual(units.type, 'text'); // no longer a core field
  const off = L.sanitizeTable_('FormFields', [{ key: 'date', label: 'Tgl', active: false }, { key: 'category', label: 'C', active: false }], {});
  assert.strictEqual(off.rows.find(r => r.key === 'date').active, false);
  assert.strictEqual(off.rows.find(r => r.key === 'category').active, true);
  assert.strictEqual(off.rows.find(r => r.key === 'student').required, true);
  for (const k of Object.keys(L.SYSTEM_FIELDS)) assert.ok(keys.includes(k), k);
});

test('student sanitizing assigns ids and target columns', () => {
  const cats = L.defaultBatchTables_('x', '2026-01-01').Categories;
  const out = L.sanitizeTable_('Students', [{ id: 'S002', name: 'A' }, { name: 'B', 'target:laptop': '10' }, { name: '' }], { categories: cats });
  assert.deepStrictEqual(out.rows.map(r => r.id), ['S002', 'S003']);
  assert.ok(out.headers.includes('target:android'));
  assert.strictEqual(out.rows[1]['target:laptop'], 10);
  assert.strictEqual(out.rows[0]['target:laptop'], '');
});

test('categories must not be empty', () => {
  assert.throws(() => L.sanitizeTable_('Categories', [], {}));
});

test('each report without a units value counts as one unit', () => {
  const t = batch();
  const d = L.computeDashboard_({ settings: L.settingsToObject_(t.Settings), categories: t.Categories, students: t.Students,
    milestones: t.Milestones, today: '2026-10-05', reports: [
      { id: 'a', date: '2026-10-01', student: 'S001', category: 'android' },
      { id: 'b', date: '2026-10-02', student: 'S001', category: 'android', units: '' },
      { id: 'c', date: '2026-10-02', student: 'S001', category: 'laptop', units: '3' }] });
  const abdul = d.students.find(s => s.id === 'S001');
  assert.strictEqual(abdul.done.android, 2);
  assert.strictEqual(abdul.done.laptop, 3);
});

test('v1 forms migrate: units and single photo removed, three photo uploads added', () => {
  const v1 = [
    { key: 'date', label: 'Tanggal', type: 'date' }, { key: 'units', label: 'Jumlah Unit Selesai', type: 'number' },
    { key: 'notes', label: 'Catatan', type: 'textarea' }, { key: 'photo', label: 'Foto Bukti', type: 'file' }];
  const out = L.migrateFormFields_(v1, 1);
  assert.deepStrictEqual(out.map(f => f.key), ['date', 'notes', 'photo_before', 'photo_after', 'photo_supervisor']);
  assert.deepStrictEqual(out.slice(2).map(f => f.label), ['Sebelum bongkar', 'Setelah bongkar', 'Foto bersama pengawas']);
  assert.ok(out.slice(2).every(f => f.type === 'file' && f.section === 'Foto Bukti'));
  assert.strictEqual(L.migrateFormFields_(out, 2).length, out.length);
  const fresh = L.defaultBatchTables_('B', '2026-01-01');
  assert.ok(!fresh.FormFields.some(f => f.key === 'units' || f.key === 'photo'));
  assert.strictEqual(L.settingsToObject_(fresh.Settings).schemaVersion, String(L.SCHEMA_VERSION));
});

test('each santri carries their own reports, newest first, with extra answers', () => {
  const t = batch();
  const fields = [
    { key: 'date', type: 'date', active: 'true' }, { key: 'student', type: 'student', active: 'true' },
    { key: 'device_model', label: 'Model', type: 'text', active: 'true' },
    { key: 'notes', label: 'Catatan', type: 'textarea', active: 'false' },
    { key: 'photo_before', label: 'Foto', type: 'file', active: 'true' }
  ];
  const reports = [
    { id: 'a', date: '2026-10-01', student: 'S001', category: 'android', device_model: 'Redmi 9', notes: 'x', photo_before: 'http://f' },
    { id: 'b', date: '2026-10-03', student: 'S001', category: 'iphone', device_model: '' },
    { id: 'c', date: '2026-10-02', student: 'S002', category: 'android' }
  ];
  const d = L.computeDashboard_({ settings: L.settingsToObject_(t.Settings), categories: t.Categories, students: t.Students,
    milestones: t.Milestones, fields, reports, today: '2026-10-05' });
  const abdul = d.students.find(s => s.id === 'S001');
  assert.deepStrictEqual(abdul.reports.map(r => r.date), ['2026-10-03', '2026-10-01']);
  assert.deepStrictEqual(abdul.reports[1].details, [{ label: 'Model', value: 'Redmi 9' }]);
  assert.deepStrictEqual(abdul.reports[0].details, []);
  assert.strictEqual(d.students.find(s => s.id === 'S002').reports.length, 1);
});
