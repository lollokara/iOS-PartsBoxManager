export const PAPER_SIZES = ["30x15", "40x15", "50x30", "30x20"] as const;

export type LabelPaperSize = (typeof PAPER_SIZES)[number];

export const DEFAULT_LABEL_PAPER_SIZE: LabelPaperSize = "30x15";

const DPI = 300;
const MM_PER_INCH = 25.4;

export interface PaperProfile {
  size: LabelPaperSize;
  widthPx: number;
  heightPx: number;
  marginPx: number;
  codeSizePx: number;
  textGapPx: number;
  textX: number;
  textWidth: number;
  pnBoxTop: number;
  pnBoxHeight: number;
  descBoxTop: number;
  descBoxHeight: number;
  pnMaxFontSize: number;
  pnMinFontSize: number;
  descMaxFontSize: number;
  descMinFontSize: number;
}

const PAPER_MM: Record<LabelPaperSize, { widthMm: number; heightMm: number; pnMaxFontSize: number; pnMinFontSize: number; descMaxFontSize: number; descMinFontSize: number }> = {
  "30x15": { widthMm: 30, heightMm: 15, pnMaxFontSize: 19, pnMinFontSize: 8, descMaxFontSize: 13, descMinFontSize: 10 },
  "40x15": { widthMm: 40, heightMm: 15, pnMaxFontSize: 22, pnMinFontSize: 8, descMaxFontSize: 13, descMinFontSize: 10 },
  "50x30": { widthMm: 50, heightMm: 30, pnMaxFontSize: 28, pnMinFontSize: 10, descMaxFontSize: 18, descMinFontSize: 10 },
  "30x20": { widthMm: 30, heightMm: 20, pnMaxFontSize: 24, pnMinFontSize: 9, descMaxFontSize: 15, descMinFontSize: 10 }
};

export function parseLabelPaperSize(value: string | undefined | null): LabelPaperSize | null {
  if (!value) {
    return null;
  }
  return PAPER_SIZES.includes(value as LabelPaperSize) ? (value as LabelPaperSize) : null;
}

export function resolvePaperProfile(size: LabelPaperSize = DEFAULT_LABEL_PAPER_SIZE): PaperProfile {
  const paper = PAPER_MM[size];
  const widthPx = mmToPx(paper.widthMm);
  const heightPx = mmToPx(paper.heightMm);
  const marginPx = mmToPx(1);
  const textGapPx = mmToPx(1);
  const codeSizePx = heightPx - marginPx * 2;
  const textX = marginPx + codeSizePx + textGapPx;
  const textWidth = widthPx - textX - marginPx;
  const pnBoxTop = marginPx;
  const pnBoxHeight = Math.max(mmToPx(5), Math.round(heightPx * 0.18));
  const descGapPx = Math.max(4, Math.round(marginPx / 2));
  const descBoxTop = pnBoxTop + pnBoxHeight + descGapPx;
  const descBoxHeight = heightPx - descBoxTop - marginPx;

  return {
    size,
    widthPx,
    heightPx,
    marginPx,
    codeSizePx,
    textGapPx,
    textX,
    textWidth,
    pnBoxTop,
    pnBoxHeight,
    descBoxTop,
    descBoxHeight,
    pnMaxFontSize: paper.pnMaxFontSize,
    pnMinFontSize: paper.pnMinFontSize,
    descMaxFontSize: paper.descMaxFontSize,
    descMinFontSize: paper.descMinFontSize
  };
}

function mmToPx(mm: number): number {
  return Math.round((mm * DPI) / MM_PER_INCH);
}
