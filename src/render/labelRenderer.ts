import { readFileSync } from "node:fs";
import { join } from "node:path";
import bwipjs from "bwip-js";
import sharp from "sharp";
import type { LabelRecord } from "../domain/labelRecord.js";
import {
  DEFAULT_LABEL_PAPER_SIZE,
  resolvePaperProfile,
  type LabelPaperSize,
  type PaperProfile
} from "./paperProfiles.js";

const DESC_CHAR_WIDTH_FACTOR = 0.68;
const FONT_FAMILY = "PartsBoxLabel";
const FONT_DIR = join(process.cwd(), "src", "render", "fonts");
const REGULAR_FONT = readFileSync(join(FONT_DIR, "Verdana.ttf")).toString("base64");
const BOLD_FONT = readFileSync(join(FONT_DIR, "Verdana-Bold.ttf")).toString("base64");

export async function renderLabelPng(
  record: LabelRecord,
  options: { paperSize?: LabelPaperSize } = {}
): Promise<Buffer> {
  const profile = resolvePaperProfile(options.paperSize ?? DEFAULT_LABEL_PAPER_SIZE);
  const layout = createTextLayout(record, profile);
  const code = await bwipjs.toBuffer({
    bcid: "datamatrix",
    text: record.partId,
    scale: 4,
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0,
    backgroundcolor: "FFFFFF"
  });

  const codePng = await sharp(code)
    .resize(profile.codeSizePx, profile.codeSizePx, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();

  const pnPng = await renderTextLineImage({
    text: layout.pnText,
    fontDesc: `Verdana Bold ${layout.pnFontSize}`,
    fontfile: join(FONT_DIR, "Verdana-Bold.ttf"),
    width: profile.textWidth,
    height: profile.pnBoxHeight
  });
  const descriptionPng = await renderDescriptionImage(layout, profile);

  return sharp({
    create: {
      width: profile.widthPx,
      height: profile.heightPx,
      channels: 4,
      background: "#ffffff"
    }
  })
    .composite([
      { input: codePng, left: profile.marginPx, top: profile.marginPx },
      { input: descriptionPng, left: profile.textX, top: profile.descBoxTop },
      { input: pnPng, left: profile.textX, top: profile.pnBoxTop }
    ])
    .png()
    .toBuffer();
}

export function renderLabelSvg(
  record: LabelRecord,
  options: { paperSize?: LabelPaperSize } = {}
): string {
  const profile = resolvePaperProfile(options.paperSize ?? DEFAULT_LABEL_PAPER_SIZE);
  const layout = createTextLayout(record, profile);
  return renderLabelSvgFromLayout(layout);
}

function renderLabelSvgFromLayout(layout: TextLayout): string {
  const { profile } = layout;
  const styles = `
    <style>
      @font-face {
        font-family: '${FONT_FAMILY}';
        src: url('data:font/ttf;base64,${REGULAR_FONT}') format('truetype');
        font-weight: 400;
        font-style: normal;
      }
      @font-face {
        font-family: '${FONT_FAMILY}';
        src: url('data:font/ttf;base64,${BOLD_FONT}') format('truetype');
        font-weight: 700;
        font-style: normal;
      }
      .pn {
        font-family: '${FONT_FAMILY}';
        font-weight: 700;
        fill: #000;
      }
      .desc {
        font-family: '${FONT_FAMILY}';
        font-weight: 400;
        fill: #000;
      }
    </style>`;

  const pnClip = `<clipPath id="pn-box"><rect x="${profile.textX}" y="${profile.pnBoxTop}" width="${profile.textWidth}" height="${profile.pnBoxHeight}" /></clipPath>`;
  const descClip = `<clipPath id="desc-box"><rect x="${profile.textX}" y="${profile.descBoxTop}" width="${profile.textWidth}" height="${profile.descBoxHeight}" /></clipPath>`;

  const pnTextEl = renderTextBlock({
    className: "pn",
    clipId: "pn-box",
    x: profile.textX,
    y: profile.pnBoxTop + 1,
    fontSize: layout.pnFontSize,
    lineHeight: layout.pnLineHeight,
    lines: [layout.pnText]
  });

  const descTextEl = renderTextBlock({
    className: "desc",
    clipId: "desc-box",
    x: profile.textX,
    y: profile.descBoxTop + 1,
    fontSize: layout.descFontSize,
    lineHeight: layout.descLineHeight,
    lines: layout.descriptionLines
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${profile.widthPx}" height="${profile.heightPx}" viewBox="0 0 ${profile.widthPx} ${profile.heightPx}"><defs>${styles}${pnClip}${descClip}</defs>${pnTextEl}${descTextEl}</svg>`;
}

interface TextLayout {
  profile: PaperProfile;
  pnText: string;
  descriptionLines: string[];
  pnFontSize: number;
  pnLineHeight: number;
  descFontSize: number;
  descLineHeight: number;
}

function createTextLayout(record: LabelRecord, profile: PaperProfile): TextLayout {
  const pn = record.pn.trim();
  const description = record.description.trim();

  let pnFontSize = profile.pnMaxFontSize;
  for (; pnFontSize >= profile.pnMinFontSize; pnFontSize -= 1) {
    if (pn.length <= maxCharsForWidth(profile.textWidth, pnFontSize, 0.61)) {
      break;
    }
  }
  if (pnFontSize < profile.pnMinFontSize) {
    pnFontSize = profile.pnMinFontSize;
  }

  const pnLineHeight = Math.max(pnFontSize + 3, 11);
  const pnMaxChars = maxCharsForWidth(profile.textWidth, pnFontSize, 0.61);
  const pnText = pn.length <= pnMaxChars ? pn : ellipsize(pn, pnMaxChars);

  for (let descFontSize = profile.descMaxFontSize; descFontSize >= profile.descMinFontSize; descFontSize -= 1) {
    const descLineHeight = Math.max(descFontSize + 2, 12);
    const maxLines = Math.max(1, Math.floor(profile.descBoxHeight / descLineHeight));
    const wrapped = wrapText(description, maxCharsForWidth(profile.textWidth, descFontSize, DESC_CHAR_WIDTH_FACTOR), maxLines);

    if (!wrapped.truncated || descFontSize === profile.descMinFontSize) {
      return {
        profile,
        pnText,
        descriptionLines: wrapped.lines,
        pnFontSize,
        pnLineHeight,
        descFontSize,
        descLineHeight
      };
    }
  }

  const descFontSize = profile.descMinFontSize;
  const descLineHeight = Math.max(descFontSize + 2, 12);
  const maxLines = Math.max(1, Math.floor(profile.descBoxHeight / descLineHeight));
  const wrapped = wrapText(description, maxCharsForWidth(profile.textWidth, descFontSize, DESC_CHAR_WIDTH_FACTOR), maxLines);

  return {
    profile,
    pnText,
    descriptionLines: wrapped.lines,
    pnFontSize,
    pnLineHeight,
    descFontSize,
    descLineHeight
  };
}

function renderTextBlock(options: {
  className: "pn" | "desc";
  clipId: string;
  x: number;
  y: number;
  fontSize: number;
  lineHeight: number;
  lines: string[];
}): string {
  const lineElements = options.lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : options.lineHeight;
      return `<tspan x="${options.x}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  return `<g clip-path="url(#${options.clipId})"><text class="${options.className}" x="${options.x}" y="${options.y}" font-size="${options.fontSize}" dominant-baseline="text-before-edge">${lineElements}</text></g>`;
}

async function renderDescriptionImage(layout: TextLayout, profile: PaperProfile): Promise<Buffer> {
  const canvas = sharp({
    create: {
      width: profile.textWidth,
      height: profile.descBoxHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  });

  const composites = await Promise.all(
    layout.descriptionLines.map(async (line, index) => {
      const linePng = await renderTextLineImage({
        text: line,
        fontDesc: `Verdana ${layout.descFontSize}`,
        fontfile: join(FONT_DIR, "Verdana.ttf"),
        width: profile.textWidth,
        height: layout.descLineHeight
      });
      return {
        input: linePng,
        left: 0,
        top: index * layout.descLineHeight
      };
    })
  );

  return canvas.composite(composites).png().toBuffer();
}

async function renderTextLineImage(options: {
  text: string;
  fontDesc: string;
  fontfile: string;
  width: number;
  height: number;
  align?: "left" | "center" | "right";
}): Promise<Buffer> {
  const markup = `<span foreground="#000000" font_desc="${escapeXml(options.fontDesc)}">${escapeXml(options.text)}</span>`;

  return sharp({
    text: {
      text: markup,
      fontfile: options.fontfile,
      width: options.width,
      height: options.height,
      align: options.align ?? "left",
      rgba: true,
      wrap: "none"
    }
  })
    .png()
    .toBuffer();
}

function maxCharsForWidth(width: number, fontSize: number, widthFactor: number): number {
  return Math.max(8, Math.floor(width / (fontSize * widthFactor)));
}

function wrapText(text: string, maxChars: number, maxLines: number): { lines: string[]; truncated: boolean } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return { lines: [""], truncated: false };
  }

  const lines: string[] = [];
  let current = "";
  let truncated = false;

  for (const word of words) {
    const segments = splitLongWord(word, maxChars);

    for (const segment of segments) {
      const candidate = current ? `${current} ${segment}` : segment;
      if (candidate.length <= maxChars) {
        current = candidate;
        continue;
      }

      if (current) {
        lines.push(current);
      }

      current = segment;

      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
    }

    if (truncated) {
      break;
    }
  }

  if (!truncated && current) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
    truncated = true;
  }

  if (lines.length > 0 && (truncated || words.join(" ").length > lines.join(" ").length)) {
    lines[lines.length - 1] = ellipsize(lines[lines.length - 1], maxChars);
  }

  return { lines, truncated };
}

function splitLongWord(word: string, maxChars: number): string[] {
  if (word.length <= maxChars) {
    return [word];
  }

  const segments: string[] = [];
  let remaining = word;

  while (remaining.length > maxChars) {
    segments.push(remaining.slice(0, maxChars));
    remaining = remaining.slice(maxChars);
  }

  if (remaining) {
    segments.push(remaining);
  }

  return segments;
}

function ellipsize(text: string, maxChars: number): string {
  if (maxChars <= 3) {
    return "...".slice(0, maxChars);
  }

  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars - 3)}...`;
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function renderStorageLabelPng(
  storageId: string,
  name: string,
  options: { paperSize?: LabelPaperSize } = {}
): Promise<Buffer> {
  const profile = resolvePaperProfile(options.paperSize ?? DEFAULT_LABEL_PAPER_SIZE);
  const layout = createStorageTextLayout(name, profile);

  const code = await bwipjs.toBuffer({
    bcid: "qrcode",
    text: storageId,
    scale: 4,
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0,
    backgroundcolor: "FFFFFF"
  });

  const codePng = await sharp(code)
    .resize(profile.codeSizePx, profile.codeSizePx, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();

  const maxBoxHeight = profile.heightPx - profile.marginPx * 2;
  const textCanvas = sharp({
    create: {
      width: profile.textWidth,
      height: maxBoxHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  });

  const totalHeight = layout.lines.length * layout.lineHeight;
  const startTop = Math.max(0, Math.floor((maxBoxHeight - totalHeight) / 2));

  const composites = await Promise.all(
    layout.lines.map(async (line, index) => {
      const linePng = await renderTextLineImage({
        text: line,
        fontDesc: `Verdana Bold ${layout.fontSize}`,
        fontfile: join(FONT_DIR, "Verdana-Bold.ttf"),
        width: profile.textWidth,
        height: layout.lineHeight,
        align: "center"
      });
      return {
        input: linePng,
        left: 0,
        top: startTop + index * layout.lineHeight
      };
    })
  );

  const textPng = await textCanvas.composite(composites).png().toBuffer();

  return sharp({
    create: {
      width: profile.widthPx,
      height: profile.heightPx,
      channels: 4,
      background: "#ffffff"
    }
  })
    .composite([
      { input: codePng, left: profile.marginPx, top: profile.marginPx },
      { input: textPng, left: profile.textX, top: profile.marginPx }
    ])
    .png()
    .toBuffer();
}

function createStorageTextLayout(
  name: string,
  profile: PaperProfile
): { lines: string[]; fontSize: number; lineHeight: number } {
  const text = name.trim();
  const maxBoxHeight = profile.heightPx - profile.marginPx * 2;

  // Storage location labels only have one text field (no PN/description split),
  // so we can allow a much larger max font size to fill the available space.
  const maxFontSize = Math.min(80, Math.round(maxBoxHeight * 0.85));
  const minFontSize = profile.pnMinFontSize;

  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 1) {
    const lineHeight = Math.max(fontSize + 3, 11);
    const maxLines = Math.max(1, Math.floor(maxBoxHeight / lineHeight));
    const wrapped = wrapText(text, maxCharsForWidth(profile.textWidth, fontSize, 0.61), maxLines);

    if (!wrapped.truncated || fontSize === minFontSize) {
      return {
        lines: wrapped.lines,
        fontSize,
        lineHeight
      };
    }
  }

  const fontSize = minFontSize;
  const lineHeight = Math.max(fontSize + 3, 11);
  const maxLines = Math.max(1, Math.floor(maxBoxHeight / lineHeight));
  const wrapped = wrapText(text, maxCharsForWidth(profile.textWidth, fontSize, 0.61), maxLines);
  return {
    lines: wrapped.lines,
    fontSize,
    lineHeight
  };
}
