import type { OverrideRecord } from "../domain/passive.js";
import { readJsonFile, writeJsonFile } from "../utils/atomicFile.js";

type OverrideMap = Record<string, OverrideRecord>;

export class OverrideStore {
  constructor(private readonly filePath: string) {}

  async getAll(): Promise<OverrideMap> {
    const loaded = await readJsonFile<OverrideMap>(this.filePath);
    return loaded ?? {};
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
    await writeJsonFile(this.filePath, all);
  }
}
