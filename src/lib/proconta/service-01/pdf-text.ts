import type { TextItem } from "pdfjs-dist/types/src/display/api";

/** Palabra con su posición en la página (coordenadas PDF: y crece hacia arriba). */
export interface PdfWord {
  text: string;
  x: number;
  x1: number;
  y: number;
}

interface Run {
  x: number;
  w: number;
  s: string;
}

async function loadPdfjs() {
  const isNode = typeof process !== "undefined" && Boolean(process.versions?.node);
  if (isNode) {
    // Node y pruebas: build legacy sin worker.
    return import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

function isTextItem(item: unknown): item is TextItem {
  return typeof item === "object" && item !== null && "str" in item && "transform" in item;
}

/**
 * Extrae las palabras de cada página con su posición. pdf.js entrega corridas de texto
 * (a veces una palabra partida en varias, a veces varias palabras juntas); aquí se pegan
 * las corridas contiguas y se separan por espacios repartiendo el ancho por carácter.
 */
export async function extractPdfWords(data: Uint8Array): Promise<PdfWord[][]> {
  const pdfjs = await loadPdfjs();
  const document = await pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
  const pages: PdfWord[][] = [];
  try {
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const items = content.items
        .filter(isTextItem)
        .filter((item) => item.str.trim() !== "")
        .map((item) => ({
          x: item.transform[4] as number,
          y: item.transform[5] as number,
          w: item.width,
          s: item.str,
        }))
        .sort((a, b) => b.y - a.y || a.x - b.x);
      const lines: { y: number; items: typeof items }[] = [];
      for (const item of items) {
        const line = lines.find((entry) => Math.abs(entry.y - item.y) <= 1.5);
        if (line) line.items.push(item);
        else lines.push({ y: item.y, items: [item] });
      }
      const words: PdfWord[] = [];
      for (const line of lines) {
        line.items.sort((a, b) => a.x - b.x);
        const runs: Run[] = [];
        for (const item of line.items) {
          const last = runs.at(-1);
          const glued =
            last &&
            item.x - (last.x + last.w) < 1 &&
            !last.s.endsWith(" ") &&
            !item.s.startsWith(" ");
          if (glued && last) {
            last.s += item.s;
            last.w = item.x + item.w - last.x;
          } else {
            runs.push({ x: item.x, w: item.w, s: item.s });
          }
        }
        for (const run of runs) {
          const perChar = run.s.length ? run.w / run.s.length : 0;
          for (const match of run.s.matchAll(/\S+/g)) {
            const start = match.index ?? 0;
            words.push({
              text: match[0],
              x: run.x + perChar * start,
              x1: run.x + perChar * (start + match[0].length),
              y: line.y,
            });
          }
        }
      }
      pages.push(words);
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }
  return pages;
}
