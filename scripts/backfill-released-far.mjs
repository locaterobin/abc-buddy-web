import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const conn = await mysql.createConnection(dbUrl);

// Today's date range in IST (UTC+5:30)
const now = new Date();
const todayIST = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
todayIST.setUTCHours(0, 0, 0, 0); // midnight IST today in UTC terms
const todayISTEnd = new Date(todayIST.getTime() + 24 * 60 * 60 * 1000);

// Convert back to UTC for DB query
const startUTC = new Date(todayIST.getTime() - 5.5 * 60 * 60 * 1000);
const endUTC = new Date(todayISTEnd.getTime() - 5.5 * 60 * 60 * 1000);

console.log(`Backfilling releasedFar for records released between ${startUTC.toISOString()} and ${endUTC.toISOString()} (today IST)`);

// First, check what threshold is set (default 200m if not set)
const [thresholdRows] = await conn.execute(
  `SELECT releaseFarThreshold FROM team_settings WHERE releaseFarThreshold IS NOT NULL LIMIT 1`
);
const threshold = thresholdRows.length > 0 ? (thresholdRows[0].releaseFarThreshold ?? 200) : 200;
console.log(`Using threshold: ${threshold}m`);

// Preview what will be updated
const [preview] = await conn.execute(
  `SELECT dogId, releaseDistanceMetres, 
   CASE WHEN releaseDistanceMetres IS NOT NULL AND releaseDistanceMetres > ? THEN 1 ELSE 0 END as will_be_far
   FROM dog_records 
   WHERE releasedAt IS NOT NULL 
   AND releasedAt >= ? AND releasedAt < ?
   AND releasedFar IS NULL`,
  [threshold, startUTC, endUTC]
);

console.log(`\nRecords to update: ${preview.length}`);
preview.forEach(r => {
  console.log(`  ${r.dogId}: ${r.releaseDistanceMetres}m → releasedFar=${r.will_be_far ? 'YES' : 'no'}`);
});

if (preview.length === 0) {
  console.log('Nothing to update.');
  await conn.end();
  process.exit(0);
}

// Run the update
const [result] = await conn.execute(
  `UPDATE dog_records 
   SET releasedFar = CASE WHEN releaseDistanceMetres IS NOT NULL AND releaseDistanceMetres > ? THEN 1 ELSE 0 END
   WHERE releasedAt IS NOT NULL 
   AND releasedAt >= ? AND releasedAt < ?
   AND releasedFar IS NULL`,
  [threshold, startUTC, endUTC]
);

console.log(`\nUpdated ${result.affectedRows} records.`);
await conn.end();
