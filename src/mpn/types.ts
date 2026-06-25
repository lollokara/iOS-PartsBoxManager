import type { PassiveType } from "../domain/passive.js";

export interface DecodedMpn {
  type?: PassiveType;
  valueNorm?: number;
  tolerance?: string;
  voltage?: string;
  package?: string;
}

export interface MpnDecoder {
  name: string;
  decode(mpn: string): DecodedMpn | null;
}
