import { PDFDocument } from "pdf-lib";

/** Page count of a PDF buffer. Throws on invalid/corrupt input. */
export async function getPageCount(pdf: Buffer): Promise<number> {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
  return doc.getPageCount();
}

/**
 * Extract page `pageNo` (1-based) as a standalone single-page PDF. The page
 * keeps its embedded resources (images, fonts), so scanned pages survive —
 * the bytes go to the vision API as a document attachment.
 */
export async function extractPagePdf(
  pdf: Buffer,
  pageNo: number,
): Promise<Buffer> {
  const src = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const [page] = await out.copyPages(src, [pageNo - 1]);
  out.addPage(page!);
  return Buffer.from(await out.save());
}
