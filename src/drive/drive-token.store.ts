import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Auth } from 'googleapis';

type Credentials = Auth.Credentials;
type TokenMap = Record<string, Credentials>;

/**
 * Persists per-user Google OAuth tokens.
 *
 * Implemented as a simple JSON file store so no database schema change is
 * required. The interface (get/set/remove) is intentionally narrow so it can be
 * swapped for a Prisma-backed store later without touching DriveService.
 */
@Injectable()
export class DriveTokenStore {
  private readonly filePath = join(process.cwd(), '.drive-tokens.json');

  private async readAll(): Promise<TokenMap> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as TokenMap;
    } catch {
      // File missing or unreadable -> treat as empty store.
      return {};
    }
  }

  private async writeAll(map: TokenMap): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(map, null, 2), 'utf-8');
  }

  async get(userId: number): Promise<Credentials | undefined> {
    const all = await this.readAll();
    return all[String(userId)];
  }

  /**
   * Merge new token fields into whatever is already stored. Google only returns
   * a refresh_token on the first consent, so merging preserves it across later
   * access-token refreshes.
   */
  async set(userId: number, tokens: Credentials): Promise<void> {
    const all = await this.readAll();
    const existing = all[String(userId)] || {};
    all[String(userId)] = { ...existing, ...tokens };
    await this.writeAll(all);
  }

  async remove(userId: number): Promise<void> {
    const all = await this.readAll();
    delete all[String(userId)];
    await this.writeAll(all);
  }
}
