import type { ParsedScanLabel } from "../scan/labelParser.js";

type FetchLike = typeof fetch;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface NexarSearchResponse {
  data?: {
    supSearchMpn?: {
      results?: Array<{
        description?: string | null;
        part?: {
          mpn?: string | null;
          name?: string | null;
          shortDescription?: string | null;
          manufacturer?: {
            name?: string | null;
          } | null;
          category?: {
            name?: string | null;
          } | null;
          bestDatasheet?: {
            url?: string | null;
          } | null;
          specs?: Array<{
            attribute?: {
              name?: string | null;
            } | null;
            displayValue?: string | null;
          }> | null;
        } | null;
      }>;
    };
  };
  errors?: Array<{ message?: string }>;
}

export interface NexarEnricherOptions {
  clientId?: string | null;
  clientSecret?: string | null;
  fetchImpl?: FetchLike;
}

export interface NexarEnrichment {
  name: string;
  description?: string;
  tags?: string[];
  categoryName?: string;
  notes?: string;
}

export class NexarEnricher {
  private readonly clientId: string | null;
  private readonly clientSecret: string | null;
  private readonly fetchImpl: FetchLike;
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(options: NexarEnricherOptions = {}) {
    this.clientId = options.clientId?.trim() || null;
    this.clientSecret = options.clientSecret?.trim() || null;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  isEnabled(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  async enrich(input: { raw: string; parsed: ParsedScanLabel }): Promise<NexarEnrichment | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const query = input.parsed.manufacturerPartNumber ?? input.parsed.supplierPartNumber ?? input.raw.trim();
    if (!query) {
      return null;
    }

    try {
      const response = await this.search(query);
      if (response?.errors && response.errors.length > 0) {
        console.error(`[NexarEnricher] GraphQL errors for query "${query}":`, JSON.stringify(response.errors));
      }

      const best = response?.data?.supSearchMpn?.results?.[0];
      const part = best?.part;
      if (!part) {
        return null;
      }

      const name = part.mpn?.trim() || part.name?.trim() || query;
      const tags = ["nexar"];
      const categoryName = part.category?.name?.trim();
      const datasheetUrl = part.bestDatasheet?.url;
      const specsList = part.specs
        ?.map((s) => ({
          name: s.attribute?.name?.trim() || "",
          value: s.displayValue?.trim() || ""
        }))
        .filter((s) => s.name && s.value);

      const notesParts = [
        input.parsed.resolvedPartId ? `PartsBox ID: ${input.parsed.resolvedPartId}` : null,
        part.mpn ? `MPN: ${part.mpn}` : null,
        part.manufacturer?.name ? `Manufacturer: ${part.manufacturer.name}` : null,
        input.parsed.sourceUrl ? `Source URL: ${input.parsed.sourceUrl}` : null,
        datasheetUrl ? `Datasheet: [PDF Link](${datasheetUrl})` : null
      ];

      let notes = notesParts.filter((value): value is string => value != null).join("\n");
      if (specsList && specsList.length > 0) {
        const tableHeader = "\n\n### Technical Specifications\n| Specification | Value |\n| --- | --- |\n";
        const tableRows = specsList.map((s) => `| ${s.name} | ${s.value} |`).join("\n");
        notes += tableHeader + tableRows;
      }

      return {
        name,
        ...(part.shortDescription?.trim() ? { description: part.shortDescription.trim() } : {}),
        tags,
        ...(categoryName ? { categoryName } : {}),
        ...(notes ? { notes } : {})
      };
    } catch (error) {
      console.error(`[NexarEnricher] Failed to enrich "${query}":`, error);
      return null;
    }
  }

  private async search(query: string): Promise<NexarSearchResponse | null> {
    const token = await this.getToken();
    if (!token) {
      return null;
    }

    const response = await this.fetchImpl("https://api.nexar.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: `
          query SearchParts($q: String!) {
            supSearchMpn(q: $q, limit: 1) {
              results {
                description
                part {
                  mpn
                  name
                  shortDescription
                  manufacturer {
                    name
                  }
                  category {
                    name
                  }
                  bestDatasheet {
                    url
                  }
                  specs {
                    attribute {
                      name
                    }
                    displayValue
                  }
                }
              }
            }
          }
        `,
        variables: { q: query }
      })
    });

    if (!response.ok) {
      console.error(`[NexarEnricher] GraphQL request failed with status ${response.status}`);
      return null;
    }

    return (await response.json()) as NexarSearchResponse;
  }

  private async getToken(): Promise<string | null> {
    const now = Date.now();
    if (this.token && now < this.tokenExpiresAt) {
      return this.token;
    }
    if (!this.clientId || !this.clientSecret) {
      return null;
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      scope: "supply.domain"
    });

    const response = await this.fetchImpl("https://identity.nexar.com/connect/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      console.error(`[NexarEnricher] Token request failed with status ${response.status}`);
      return null;
    }

    const json = (await response.json()) as TokenResponse;
    if (!json.access_token) {
      return null;
    }

    const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 24 * 60 * 60;
    this.token = json.access_token;
    this.tokenExpiresAt = now + Math.max(60, expiresIn - 60) * 1000;
    return this.token;
  }
}
