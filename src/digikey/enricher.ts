import fs from "fs/promises";
import type { ParsedScanLabel } from "../scan/labelParser.js";

type FetchLike = typeof fetch;

export interface DigiKeyToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // timestamp in ms
  refreshTokenExpiresAt: number; // timestamp in ms
}

interface DigiKeySearchResponse {
  Products?: Array<{
    DigiKeyPartNumber?: string;
    ManufacturerPartNumber?: string;
    ManufacturerProductNumber?: string;
    ManufacturerName?: string;
    Manufacturer?: {
      Name?: string;
    };
    ProductDescription?: string;
    Description?: {
      ProductDescription?: string;
      DetailedDescription?: string;
    };
    Category?: {
      Name?: string;
    };
    Photos?: string[];
    Datasheets?: Array<{
      Url?: string;
      Description?: string;
    }>;
    DatasheetUrl?: string;
    Parameters?: Array<{
      Parameter?: string;
      Value?: string;
      ParameterText?: string;
      ValueText?: string;
    }>;
  }>;
  errors?: Array<{ message?: string }>;
}

export interface DigiKeyEnricherOptions {
  clientId?: string | null;
  clientSecret?: string | null;
  redirectUri?: string;
  tokenCachePath?: string | null;
  fetchImpl?: FetchLike;
}

export interface DigiKeyEnrichment {
  name: string;
  description?: string;
  tags?: string[];
  categoryName?: string;
  notes?: string;
  price?: number;
  currency?: string;
}

export class DigiKeyEnricher {
  private readonly clientId: string | null;
  private readonly clientSecret: string | null;
  private readonly redirectUri: string;
  private readonly tokenCachePath: string | null;
  private readonly fetchImpl: FetchLike;
  private token: DigiKeyToken | null = null;
  private tokenPromise: Promise<DigiKeyToken | null> | null = null;

  constructor(options: DigiKeyEnricherOptions = {}) {
    this.clientId = options.clientId?.trim() || null;
    this.clientSecret = options.clientSecret?.trim() || null;
    this.redirectUri = options.redirectUri || "https://localhost";
    this.tokenCachePath = options.tokenCachePath || null;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  isEnabled(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.isEnabled()) return false;
    const token = await this.getOrLoadToken();
    return Boolean(token && token.refreshToken);
  }

  getAuthUrl(): string {
    if (!this.clientId) return "";
    return `https://api.digikey.com/v1/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(
      this.clientId
    )}&redirect_uri=${encodeURIComponent(this.redirectUri)}`;
  }

  async exchangeCode(code: string): Promise<DigiKeyToken | null> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("DigiKey credentials not configured");
    }

    let cleanCode = code.trim();
    if (cleanCode.includes("code=")) {
      try {
        const urlStr = cleanCode.startsWith("http") ? cleanCode : `https://localhost/${cleanCode.startsWith("?") ? "" : "?"}${cleanCode}`;
        const url = new URL(urlStr);
        const parsedCode = url.searchParams.get("code");
        if (parsedCode) {
          cleanCode = parsedCode;
        }
      } catch (e) {
        // Fallback
      }
      if (cleanCode.includes("code=")) {
        const match = cleanCode.match(/[?&]code=([^&]+)/);
        if (match) {
          cleanCode = match[1];
        }
      }
    }

    const body = new URLSearchParams({
      code: cleanCode,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: "authorization_code"
    });

    const response = await this.fetchImpl("https://api.digikey.com/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`[DigiKeyEnricher] Code exchange failed: status=${response.status} body=${errorText}`);
      throw new Error(`DigiKey OAuth code exchange failed with status ${response.status}`);
    }

    const json = await response.json() as any;
    const token = this.parseTokenResponse(json);
    await this.saveToken(token);
    return token;
  }

  private parseTokenResponse(json: any): DigiKeyToken {
    const now = Date.now();
    const expiresIn = Number.parseInt(json.expires_in, 10) || 30 * 60;
    const refreshExpiresIn = Number.parseInt(json.refresh_token_expires_in, 10) || 90 * 24 * 60 * 60;

    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: now + expiresIn * 1000,
      refreshTokenExpiresAt: now + refreshExpiresIn * 1000
    };
  }

  private async saveToken(token: DigiKeyToken): Promise<void> {
    this.token = token;
    if (this.tokenCachePath) {
      try {
        await fs.writeFile(this.tokenCachePath, JSON.stringify(token, null, 2), "utf8");
      } catch (err) {
        console.error(`[DigiKeyEnricher] Failed to write token file:`, err);
      }
    }
  }

  private async getOrLoadToken(): Promise<DigiKeyToken | null> {
    if (this.token) {
      return this.token;
    }
    const cachePath = this.tokenCachePath;
    if (!cachePath) {
      return null;
    }
    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    this.tokenPromise = (async () => {
      try {
        const data = await fs.readFile(cachePath, "utf8");
        const parsed = JSON.parse(data) as DigiKeyToken;
        this.token = parsed;
        return parsed;
      } catch (err: any) {
        if (err.code !== "ENOENT") {
          console.error(`[DigiKeyEnricher] Failed to read token file:`, err);
        }
        return null;
      } finally {
        this.tokenPromise = null;
      }
    })();

    return this.tokenPromise;
  }

  async getAccessToken(): Promise<string | null> {
    const token = await this.getOrLoadToken();
    if (!token) {
      return null;
    }

    const now = Date.now();
    // Refresh if access token expired or will expire in 2 minutes
    if (now >= token.expiresAt - 120 * 1000) {
      return this.refreshAccessToken(token.refreshToken);
    }

    return token.accessToken;
  }

  private async refreshAccessToken(refreshToken: string): Promise<string | null> {
    if (!this.clientId || !this.clientSecret) {
      return null;
    }

    console.log("[DigiKeyEnricher] Refreshing access token...");
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    });

    const response = await this.fetchImpl("https://api.digikey.com/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`[DigiKeyEnricher] Token refresh failed: status=${response.status} body=${errorText}`);
      return null;
    }

    const json = await response.json() as any;
    const token = this.parseTokenResponse(json);
    await this.saveToken(token);
    return token.accessToken;
  }

  async enrich(input: { raw: string; parsed: ParsedScanLabel }): Promise<DigiKeyEnrichment | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const token = await this.getAccessToken();
    if (!token) {
      console.warn("[DigiKeyEnricher] Cannot enrich, client is not authenticated with DigiKey");
      return null;
    }

    const query = input.parsed.manufacturerPartNumber ?? input.parsed.supplierPartNumber ?? input.raw.trim();
    if (!query) {
      return null;
    }

    try {
      const response = await this.search(query, token);
      const best = response?.Products?.[0];
      if (!best) {
        return null;
      }

      const mfrPartNumber = best.ManufacturerProductNumber?.trim() || best.ManufacturerPartNumber?.trim();
      const name = mfrPartNumber || best.DigiKeyPartNumber?.trim() || query;
      const tags = ["digikey"];
      const categoryName = best.Category?.Name?.trim();
      const mfrName = best.Manufacturer?.Name?.trim() || best.ManufacturerName?.trim();
      const datasheetUrl = best.DatasheetUrl?.trim() || best.Datasheets?.[0]?.Url?.trim();
      const specsList = best.Parameters
        ?.map((p) => ({
          name: (p.ParameterText || p.Parameter || "").trim(),
          value: (p.ValueText || p.Value || "").trim()
        }))
        .filter((p) => p.name && p.value);

      const notesParts = [
        input.parsed.resolvedPartId ? `PartsBox ID: ${input.parsed.resolvedPartId}` : null,
        mfrPartNumber ? `MPN: ${mfrPartNumber}` : null,
        mfrName ? `Manufacturer: ${mfrName}` : null,
        input.parsed.sourceUrl ? `Source URL: ${input.parsed.sourceUrl}` : null,
        datasheetUrl ? `Datasheet: [PDF Link](${datasheetUrl})` : null
      ];

      let notes = notesParts.filter((value): value is string => value != null).join("\n");
      if (specsList && specsList.length > 0) {
        const tableHeader = "\n\n### Technical Specifications\n| Specification | Value |\n| --- | --- |\n";
        const tableRows = specsList.map((s) => `| ${s.name} | ${s.value} |`).join("\n");
        notes += tableHeader + tableRows;
      }

      const descriptionText = best.Description?.ProductDescription?.trim() || 
                             best.Description?.DetailedDescription?.trim() || 
                             best.ProductDescription?.trim();

      let price: number | undefined;
      let currency: string | undefined = "USD";

      if (typeof (best as any).UnitPrice === "number") {
        price = (best as any).UnitPrice;
      } else if (typeof (best as any).UnitPrice === "string") {
        const parsedPrice = parseFloat((best as any).UnitPrice);
        if (!isNaN(parsedPrice)) {
          price = parsedPrice;
        }
      }

      if (price === undefined && Array.isArray((best as any).ProductVariations)) {
        for (const variation of (best as any).ProductVariations) {
          if (Array.isArray(variation.StandardPricing)) {
            const firstPricing = variation.StandardPricing.find((p: any) => p.BreakQuantity === 1) || variation.StandardPricing[0];
            if (firstPricing && typeof firstPricing.UnitPrice === "number") {
              price = firstPricing.UnitPrice;
              break;
            }
          }
        }
      }

      if (price === undefined && Array.isArray((best as any).StandardPricing)) {
        const firstPricing = (best as any).StandardPricing.find((p: any) => p.BreakQuantity === 1) || (best as any).StandardPricing[0];
        if (firstPricing && typeof firstPricing.UnitPrice === "number") {
          price = firstPricing.UnitPrice;
        }
      }

      return {
        name,
        ...(descriptionText ? { description: descriptionText } : {}),
        tags,
        ...(categoryName ? { categoryName } : {}),
        ...(notes ? { notes } : {}),
        ...(price !== undefined ? { price, currency } : {})
      };
    } catch (error) {
      console.error(`[DigiKeyEnricher] Failed to enrich "${query}":`, error);
      return null;
    }
  }

  private async search(query: string, token: string): Promise<DigiKeySearchResponse | null> {
    if (!this.clientId) return null;

    const response = await this.fetchImpl("https://api.digikey.com/products/v4/search/keyword", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-DIGIKEY-Client-Id": this.clientId,
        "X-DIGIKEY-Locale-Site": "US",
        "X-DIGIKEY-Locale-Currency": "USD",
        "X-DIGIKEY-Locale-Language": "en",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        Keywords: query,
        RecordCount: 1
      })
    });

    if (!response.ok) {
      console.error(`[DigiKeyEnricher] KeywordSearch request failed with status ${response.status}`);
      return null;
    }

    return (await response.json()) as DigiKeySearchResponse;
  }
}
