import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { renderLabelPng, renderLabelSvg } from "../../src/render/labelRenderer.js";

describe("renderLabelPng", () => {
  it("renders a 30 x 15 mm 300 DPI PNG", async () => {
    const png = await renderLabelPng({
      partId: "e789qkmhpejtb9p49630xawxhd",
      pn: "LTM8055MPY#PBF",
      description: "36VIN, 8.5AMP BUCK-BOOST uMODULE Regulator, Current-mode, PBGA121",
      sourceUrl: "https://partsbox.com/lorenzok/parts/e789qkmhpejtb9p49630xawxhd"
    });

    const metadata = await sharp(png).metadata();

    expect(metadata.width).toBe(354);
    expect(metadata.height).toBe(177);
    expect(metadata.format).toBe("png");
  });

  it("renders a 40 x 15 mm 300 DPI PNG when requested", async () => {
    const png = await renderLabelPng(
      {
        partId: "e789qkmhpejtb9p49630xawxhd",
        pn: "LTM8055MPY#PBF",
        description: "36VIN, 8.5AMP BUCK-BOOST uMODULE Regulator, Current-mode, PBGA121",
        sourceUrl: "https://partsbox.com/lorenzok/parts/e789qkmhpejtb9p49630xawxhd"
      },
      { paperSize: "40x15" }
    );

    const metadata = await sharp(png).metadata();

    expect(metadata.width).toBe(472);
    expect(metadata.height).toBe(177);
  });

  it("renders a 50 x 30 mm 300 DPI PNG when requested", async () => {
    const png = await renderLabelPng(
      {
        partId: "e789qkmhpejtb9p49630xawxhd",
        pn: "ASE2-60.000MHZ-E-T",
        description: "ASE2 Series 60 MHz 3.2 x 2.5 mm 2.5 V ±100 ppm SMT Crystal Clock Oscillator",
        sourceUrl: "https://partsbox.com/lorenzok/parts/e789qkmhpejtb9p49630xawxhd"
      },
      { paperSize: "50x30" }
    );

    const metadata = await sharp(png).metadata();

    expect(metadata.width).toBe(591);
    expect(metadata.height).toBe(354);
  });

  it("keeps output non-empty for long text", async () => {
    const png = await renderLabelPng({
      partId: "e789qkmhpejtb9p49630xawxhd",
      pn: "VERY-LONG-MANUFACTURER-PART-NUMBER-123456789",
      description: "This is a long description that must wrap and shrink inside the fixed label bounds without overflowing.",
      sourceUrl: "https://partsbox.com/lorenzok/parts/e789qkmhpejtb9p49630xawxhd"
    });

    expect(png.byteLength).toBeGreaterThan(1000);
  });

  it("wraps the description and keeps text between 10px and 13px", () => {
    const svg = renderLabelSvg({
      partId: "e789qkmhpejtb9p49630xawxhd",
      pn: "LTM8055MPY#PBF",
      description: "36VIN, 8.5AMP BUCK-BOOST uMODULE Regulator",
      sourceUrl: "https://partsbox.com/lorenzok/parts/e789qkmhpejtb9p49630xawxhd"
    });

    const descFontSize = extractFontSize(svg, "desc");

    expect(descFontSize).toBeGreaterThanOrEqual(10);
    expect(descFontSize).toBeLessThanOrEqual(13);
    expect(svg).toContain("font-weight: 700");
    expect(svg).toContain("font-weight: 400");
    expect(svg).toContain("PartsBoxLabel");
    expect(svg).toContain("dominant-baseline=\"text-before-edge\"");
  });

  it("includes both the PN and description text in the label SVG", () => {
    const svg = renderLabelSvg({
      partId: "e789qkmhpejtb9p49630xawxhd",
      pn: "LTM8055MPY#PBF",
      description: "36VIN, 8.5AMP BUCK-BOOST uMODULE Regulator",
      sourceUrl: "https://partsbox.com/lorenzok/parts/e789qkmhpejtb9p49630xawxhd"
    });

    expect(svg).toContain("LTM8055MPY#PBF");
    expect(svg).toContain("36VIN, 8.5AMP");
    expect(svg).toContain("BUCK-BOOST");
    expect(svg).toContain("uMODULE");
    expect(svg).toContain("Regulator");
  });

  it("autoscales long label text to stay inside the text area", () => {
    const svg = renderLabelSvg({
      partId: "e789qkmhpejtb9p49630xawxhd",
      pn: "VERY-LONG-MANUFACTURER-PART-NUMBER-123456789",
      description:
        "This is a very long component description that should shrink and wrap to fit the fixed thirty by fifteen millimeter label without colliding with the Data Matrix.",
      sourceUrl: "https://partsbox.com/lorenzok/parts/e789qkmhpejtb9p49630xawxhd"
    });

    const descFontSize = extractFontSize(svg, "desc");
    const yPositions = [...svg.matchAll(/ y="(\d+)"/g)].map((match) => Number(match[1]));

    expect(descFontSize).toBeGreaterThanOrEqual(10);
    expect(descFontSize).toBeLessThanOrEqual(13);
    expect(Math.max(...yPositions)).toBeLessThanOrEqual(160);
    expect((svg.match(/<tspan/g) ?? []).length).toBeGreaterThan(1);
  });

  it("centers the Data Matrix with 1 mm margins", async () => {
    const png = await renderLabelPng({
      partId: "e789qkmhpejtb9p49630xawxhd",
      pn: "LTM8055MPY#PBF",
      description: "36VIN, 8.5AMP BUCK-BOOST uMODULE Regulator",
      sourceUrl: "https://partsbox.com/lorenzok/parts/e789qkmhpejtb9p49630xawxhd"
    });

    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const leftRegionWidth = 146;
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < leftRegionWidth; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        const isDark = data[offset] < 128 && data[offset + 1] < 128 && data[offset + 2] < 128;
        if (isDark) {
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }

    const codeCenter = (top + bottom) / 2;
    const labelCenter = (info.height - 1) / 2;
    expect(Math.abs(codeCenter - labelCenter)).toBeLessThanOrEqual(2);
  });
});

function extractFontSize(svg: string, className: "pn" | "desc"): number {
  const match = svg.match(new RegExp(`class="${className}"[^>]*font-size="(\\d+)"`));
  expect(match, `Missing font size for ${className} block`).not.toBeNull();
  return Number(match?.[1]);
}
