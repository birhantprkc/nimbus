// Atomic write: temp sibling → fsync → rename, so a crash never truncates the
// user's source file the CLI is editing in place.

import fs from "node:fs";

export function writeFileAtomic(file: string, content: string): void {
  const tmp = `${file}.nimbus-tmp-${process.pid}`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, content, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
    }
    throw err;
  }
}
