import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { OverrideRecord } from "../domain/passive.js";

type OverrideMap = Record<string, OverrideRecord>;

export class OverrideStore {
  constructor(private readonly filePath: string) {}

  async getAll(): Promise<OverrideMap> {
    try {
      const text = await readFile(this.filePath, "utf8");
      return JSON.parse(text) as OverrideMap;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw err;
    }
  }

  async set(partId: string, record: OverrideRecord): Promise<void> {
    const all = await this.getAll();
    all[partId] = record;
    await this.write(all);
  }

  async remove(partId: string): Promise<void> {
    const all = await this.getAll();
    delete all[partId];
    await this.write(all);
  }

  private async write(all: OverrideMap): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(all, null, 2), "utf8");
  }
}
