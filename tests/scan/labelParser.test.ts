import { describe, expect, it } from "vitest";
import { parseScanLabel } from "../../src/scan/labelParser.js";

describe("parseScanLabel", () => {
  it("parses a recognizable DigiKey-ish marked payload", () => {
    expect(
      parseScanLabel(
        "Digi-Key 296-1234-1-ND | MPN: TLV70033DDCR | MFG P/N: TLV70033DDCR | Qty: 10 | Lot: A1B2 | Date: 2024-05-12"
      )
    ).toMatchObject({
      vendor: "digikey",
      raw: "Digi-Key 296-1234-1-ND | MPN: TLV70033DDCR | MFG P/N: TLV70033DDCR | Qty: 10 | Lot: A1B2 | Date: 2024-05-12",
      supplierPartNumber: "296-1234-1-ND",
      manufacturerPartNumber: "TLV70033DDCR",
      quantity: 10,
      lotCode: "A1B2",
      dateCode: "2024-05-12",
      warnings: []
    });
    expect(parseScanLabel("Digi-Key 296-1234-1-ND | MPN: TLV70033DDCR | MFG P/N: TLV70033DDCR | Qty: 10 | Lot: A1B2 | Date: 2024-05-12").confidence).toBeGreaterThan(0.7);
  });

  it("parses a DigiKey ANSI MH10 Data Matrix payload", () => {
    expect(
      parseScanLabel(
        "[)>\x1e06\x1dPLTC4125EUFD#TRPBF\x1d1PLTC4125EUFD#TRPBF\x1d30PLTC4125EUFD#TRPBF\x1dK\x1d1K89528309\x1d10K108225976\x1d9D2332\x1d1TAY10429.10\x1d11K1\x1d4LTH\x1dQ5\x1d11ZPICK\x1d12Z14562581\x1d13Z999999\x1d20Z00000000000000000000000000000000000000000000000000000000000000000000000000\x1e\x04"
      )
    ).toMatchObject({
      vendor: "digikey",
      supplierPartNumber: null,
      manufacturerPartNumber: "LTC4125EUFD#TRPBF",
      quantity: 5,
      lotCode: "AY10429.10",
      dateCode: "2332",
      warnings: []
    });
  });

  it("parses a recognizable LCSC-ish marked payload", () => {
    expect(
      parseScanLabel(
        "LCSC C123456 | Part Number: C123456 | MPN: ESP32-WROOM-32E-N4 | QTY 5 | LOT 7J21 | DATE 2401"
      )
    ).toMatchObject({
      vendor: "lcsc",
      raw: "LCSC C123456 | Part Number: C123456 | MPN: ESP32-WROOM-32E-N4 | QTY 5 | LOT 7J21 | DATE 2401",
      supplierPartNumber: "C123456",
      manufacturerPartNumber: "ESP32-WROOM-32E-N4",
      quantity: 5,
      lotCode: "7J21",
      dateCode: "2401",
      warnings: []
    });
    expect(parseScanLabel("LCSC C123456 | Part Number: C123456 | MPN: ESP32-WROOM-32E-N4 | QTY 5 | LOT 7J21 | DATE 2401").confidence).toBeGreaterThan(0.7);
  });

  it("parses an LCSC structured Data Matrix payload", () => {
    expect(
      parseScanLabel(
        "{pbn:PICK2605120009,on:GB2605120143,pc:C844554,pm:CRCW060334K8FKEA,qty:100,mc:R11, R19,cc:1,pdi:213419394,hp:null,wc:ZH}"
      )
    ).toMatchObject({
      vendor: "lcsc",
      supplierPartNumber: "C844554",
      manufacturerPartNumber: "CRCW060334K8FKEA",
      quantity: 100,
      lotCode: "PICK2605120009",
      warnings: []
    });
  });

  it("returns an unknown payload conservatively", () => {
    expect(parseScanLabel("SN: 7F2A9D4C; batch 03; internal routing only")).toMatchObject({
      vendor: "unknown",
      raw: "SN: 7F2A9D4C; batch 03; internal routing only",
      supplierPartNumber: null,
      manufacturerPartNumber: null,
      quantity: null,
      lotCode: null,
      dateCode: null
    });
    expect(parseScanLabel("SN: 7F2A9D4C; batch 03; internal routing only").confidence).toBeLessThan(0.5);
  });

  it("handles empty and malformed payloads without throwing", () => {
    expect(parseScanLabel("")).toMatchObject({
      vendor: "unknown",
      raw: "",
      supplierPartNumber: null,
      manufacturerPartNumber: null,
      quantity: null,
      lotCode: null,
      dateCode: null
    });

    expect(parseScanLabel(" \n \u0000 ;; ? ? ").warnings.length).toBeGreaterThanOrEqual(1);
  });

  it("resolves raw PartsBox ids and QR-like payloads", () => {
    expect(parseScanLabel("a".repeat(26))).toMatchObject({
      resolvedPartId: "a".repeat(26),
      sourceUrl: null
    });

    expect(parseScanLabel("https://partsbox.com/me/parts/" + "b".repeat(26) + "?tab=stock")).toMatchObject({
      resolvedPartId: "b".repeat(26),
      sourceUrl: "https://partsbox.com/me/parts/" + "b".repeat(26) + "?tab=stock"
    });
  });
});
