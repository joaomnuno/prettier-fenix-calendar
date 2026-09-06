import { constants } from "node:fs";
import { open, writeFile } from "node:fs/promises";

await writeFile(
  process.argv[2],
  `${JSON.stringify({
    lockfile_sha256: process.argv[3],
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
  }, null, 2)}\n`,
);
// The measured plugin wrapper supplies an existing private file for this attempt.
// Cache telemetry must not change the install result or create arbitrary files.
const reportPath = process.env.SITES_INSTALL_REPORT_PATH;
if (reportPath) {
  let report;
  try {
    report = await open(reportPath, constants.O_WRONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    if ((await report.stat()).isFile()) {
      await report.truncate(0);
      await report.writeFile(`${JSON.stringify({ version: 1, cache_seed: process.argv[4] })}\n`);
    }
  } catch {
    // Leave the decision unavailable rather than inventing seed use or failing setup.
  } finally {
    await report?.close().catch(() => {});
  }
}
