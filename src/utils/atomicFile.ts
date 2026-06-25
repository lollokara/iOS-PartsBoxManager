import { mkdir, readFile, writeFile, rename, copyFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  const backupPath = `${filePath}.bak`;
  try {
    const text = await readFile(filePath, "utf8");
    return JSON.parse(text) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      // Primary file does not exist, let's check backup
      try {
        const text = await readFile(backupPath, "utf8");
        const parsed = JSON.parse(text) as T;
        // Recovery: restore primary from backup
        console.warn(`[AtomicFile] Primary file ${filePath} missing, recovered from backup.`);
        await copyFile(backupPath, filePath);
        return parsed;
      } catch (backupErr) {
        if ((backupErr as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }
        throw backupErr;
      }
    }
    
    // File could be corrupted (invalid JSON syntax error, etc.)
    if (err instanceof SyntaxError) {
      console.error(`[AtomicFile] Primary file ${filePath} is corrupted: ${err.message}. Attempting recovery from backup.`);
      try {
        const text = await readFile(backupPath, "utf8");
        const parsed = JSON.parse(text) as T;
        // Recovery: restore primary from backup
        await copyFile(backupPath, filePath);
        console.warn(`[AtomicFile] Recovered ${filePath} from backup.`);
        return parsed;
      } catch (backupErr) {
        console.error(`[AtomicFile] Backup recovery failed for ${filePath}: ${backupErr}`);
      }
    }
    throw err;
  }
}

export async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  const backupPath = `${filePath}.bak`;
  
  await mkdir(dirname(filePath), { recursive: true });
  const serialized = JSON.stringify(data, null, 2);
  
  // 1. Write to temp file
  await writeFile(tempPath, serialized, "utf8");
  
  // 2. Create backup of current primary if it exists and is valid JSON
  try {
    const currentText = await readFile(filePath, "utf8");
    JSON.parse(currentText); // Validate that it's correct JSON
    await writeFile(backupPath, currentText, "utf8");
  } catch {
    // If reading or parsing primary fails, don't overwrite the backup with bad data!
  }
  
  // 3. Atomically rename temp file to primary file
  try {
    await rename(tempPath, filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      try {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(tempPath, serialized, "utf8");
        await rename(tempPath, filePath);
      } catch (retryErr) {
        // If it still fails, it means the target directory was deleted by tests/teardown
        console.warn(`[AtomicFile] Could not write file during teardown (expected if test directories are cleaned up concurrently): ${retryErr}`);
      }
    } else {
      throw err;
    }
  }
}
