/** Normalizes product code for comparison: trim whitespace and lowercase. */
export function normalizeProductCode(code: string | null | undefined): string {
  if (code == null) {
    return '';
  }
  return String(code).trim().toLowerCase();
}

/** Reads productCode from a product object (supports snake_case fallback). */
export function getProductCodeFromProduct(product: any, field = 'productCode'): string {
  if (!product) {
    return '';
  }
  const raw =
    typeof product[field] === 'string'
      ? product[field]
      : typeof product.product_code === 'string'
        ? product.product_code
        : '';
  return raw.trim();
}

/** Builds O(1) lookup map: normalized product code → product. First occurrence wins on duplicates. */
export function buildProductCodeMap(products: any[], field = 'productCode'): Map<string, any> {
  const map = new Map<string, any>();
  if (!products?.length) {
    return map;
  }
  for (const product of products) {
    const code = normalizeProductCode(getProductCodeFromProduct(product, field));
    if (code && !map.has(code)) {
      map.set(code, product);
    }
  }
  return map;
}

/** Exact product code match (trim + case-insensitive). */
export function findProductByProductCode(
  code: string,
  products: any[],
  codeMap?: Map<string, any> | null,
  field = 'productCode'
): any | null {
  const normalized = normalizeProductCode(code);
  if (!normalized) {
    return null;
  }
  if (codeMap?.size) {
    return codeMap.get(normalized) ?? null;
  }
  for (const product of products) {
    if (normalizeProductCode(getProductCodeFromProduct(product, field)) === normalized) {
      return product;
    }
  }
  return null;
}

export interface BarcodeTargetRowContext {
  rowCount: number;
  /** Index of the product field that currently has focus, or null. */
  activeProductRowIndex: number | null;
  /** Returns true when the row at index has a productId selected. */
  rowHasProduct: (index: number) => boolean;
}

export interface BarcodeTargetRowResult {
  rowIndex: number;
  shouldCreateRow: boolean;
}

/** Returns the highest index of a row that has a product selected, or -1 if none. */
export function findLastFilledProductRowIndex(ctx: BarcodeTargetRowContext): number {
  let lastFilled = -1;
  for (let i = 0; i < ctx.rowCount; i++) {
    if (ctx.rowHasProduct(i)) {
      lastFilled = i;
    }
  }
  return lastFilled;
}

/**
 * Resolves which line-item row should receive a scanned product code.
 * - Product field focused → always replace on that row
 * - Outside product, no products yet → row 0 (fresh bill)
 * - Outside product, any row has product → always create new row
 */
export function resolveBarcodeTargetRow(ctx: BarcodeTargetRowContext): BarcodeTargetRowResult {
  if (
    ctx.activeProductRowIndex !== null &&
    ctx.activeProductRowIndex >= 0 &&
    ctx.activeProductRowIndex < ctx.rowCount
  ) {
    return { rowIndex: ctx.activeProductRowIndex, shouldCreateRow: false };
  }

  const lastFilledIndex = findLastFilledProductRowIndex(ctx);

  if (lastFilledIndex === -1) {
    return { rowIndex: 0, shouldCreateRow: false };
  }

  return { rowIndex: ctx.rowCount, shouldCreateRow: true };
}

/** True when the product field had a selection before scan focus (edit/replace mode). */
export function isProductFieldEditScan(preScanProductId: unknown): boolean {
  return preScanProductId !== null && preScanProductId !== undefined && preScanProductId !== '';
}

/**
 * Returns the last row index whose productId matches, or -1 if none.
 * Walks from bottom to top so the most recently added duplicate wins.
 */
export function findLastRowIndexWithProductId(
  rowCount: number,
  getProductIdAt: (index: number) => unknown,
  productId: unknown,
  excludeIndex?: number
): number {
  if (productId === null || productId === undefined || productId === '') {
    return -1;
  }
  for (let i = rowCount - 1; i >= 0; i--) {
    if (excludeIndex !== undefined && i === excludeIndex) {
      continue;
    }
    const rowProductId = getProductIdAt(i);
    if (rowProductId !== null && rowProductId !== undefined && rowProductId !== '' && rowProductId == productId) {
      return i;
    }
  }
  return -1;
}

/** Max elapsed time (ms) from first to last keystroke to treat input as a barcode scan. */
export const BARCODE_INPUT_MAX_DURATION_MS = 150;

/** Min characters required before treating rapid Enter input as a barcode attempt. */
export const BARCODE_INPUT_MIN_LENGTH = 1;

/** Returns the printable character from a keydown event, including numpad decimal as ".". */
export function getBarcodeKeyChar(event: KeyboardEvent): string | null {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  if (event.key.length === 1) {
    return event.key;
  }
  if (event.key === 'Decimal' || event.code === 'NumpadDecimal') {
    return '.';
  }
  return null;
}

/**
 * Strips placeholder / label text accidentally concatenated with a scanned product code.
 * e.g. "1438.1.011Select Product" → "1438.1.011"
 */
export function normalizeScannedProductCodeText(raw: string, placeholders: string[] = []): string {
  let text = raw.trim();
  if (!text) {
    return '';
  }

  for (const placeholder of placeholders) {
    const ph = placeholder?.trim();
    if (!ph) {
      continue;
    }
    const lowerText = text.toLowerCase();
    const lowerPh = ph.toLowerCase();
    if (lowerText.endsWith(lowerPh)) {
      text = text.slice(0, text.length - ph.length).trim();
    }
    if (lowerText.includes(lowerPh)) {
      text = text.replace(new RegExp(escapeRegExp(ph), 'gi'), '').trim();
    }
  }

  return text;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Product codes use multiple segments (e.g. 1438.1.503). Distinguishes scans from qty/rate typing. */
export function looksLikeScannedProductCode(buffer: string): boolean {
  const trimmed = buffer.trim();
  if (!trimmed) {
    return false;
  }
  return (trimmed.match(/\./g) || []).length >= 2;
}

const LINE_FIELD_BARCODE_SAFE_CHARS = /^[A-Za-z0-9.\-_]+$/;
const LINE_FIELD_BARCODE_MIN_ALPHANUMERIC_LENGTH = 4;

/** True for qty, rate, and discount inputs where pure-digit typing must not trigger barcode capture. */
export function isNumericLineField(controlName: string): boolean {
  return (
    controlName === 'quantity' ||
    controlName === 'unitPrice' ||
    controlName === 'discountPercentage' ||
    controlName === 'discountAmount'
  );
}

/** Alphanumeric product codes (e.g. LS-3000R): at least one letter, min length, safe charset. */
function looksLikeAlphanumericProductCode(buffer: string): boolean {
  const trimmed = buffer.trim();
  return (
    trimmed.length >= LINE_FIELD_BARCODE_MIN_ALPHANUMERIC_LENGTH &&
    /[A-Za-z]/.test(trimmed) &&
    LINE_FIELD_BARCODE_SAFE_CHARS.test(trimmed)
  );
}

/**
 * Returns true when a line-field buffer looks like a scanned product code.
 * Supports dotted codes (1001.02.3), alphanumeric codes (LS-3000R), and remarks digit/dot sequences.
 */
export function looksLikeLineFieldBarcodeBuffer(buffer: string, controlName: string): boolean {
  const trimmed = buffer.trim();
  if (!trimmed) {
    return false;
  }

  if (looksLikeScannedProductCode(trimmed)) {
    return true;
  }

  if (looksLikeAlphanumericProductCode(trimmed)) {
    return true;
  }

  if (controlName === 'remarks' && trimmed.length >= 2 && /^[\d.]+$/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Whether to activate buffered barcode capture during keydown on a line field.
 * Starts blocking input before the full code is typed so chars do not leak into the column.
 */
export function shouldActivateLineFieldBarcodeCapture(buffer: string, controlName: string): boolean {
  if (looksLikeLineFieldBarcodeBuffer(buffer, controlName)) {
    return true;
  }

  const trimmed = buffer.trim();
  if (!trimmed || trimmed.length < 2) {
    return false;
  }

  if (isNumericLineField(controlName) && /[A-Za-z]/.test(trimmed) && LINE_FIELD_BARCODE_SAFE_CHARS.test(trimmed)) {
    return true;
  }

  if (
    (controlName === 'batchNumber' || controlName === 'remarks' || controlName === 'discountType') &&
    LINE_FIELD_BARCODE_SAFE_CHARS.test(trimmed)
  ) {
    return true;
  }

  return false;
}

/**
 * Detects rapid keyboard input typical of barcode scanners (fast chars ending in Enter).
 * keyTimes: timestamps (Date.now()) for each character key; Enter is excluded.
 */
export function isLikelyBarcodeInput(keyTimes: number[], text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < BARCODE_INPUT_MIN_LENGTH) {
    return false;
  }
  if (keyTimes.length < 1) {
    return false;
  }
  const first = keyTimes[0];
  const last = keyTimes[keyTimes.length - 1];
  const duration = last - first;
  // Single char scan or full string typed within threshold
  if (keyTimes.length === 1) {
    return true;
  }
  return duration <= BARCODE_INPUT_MAX_DURATION_MS;
}

/** Returns true when the element is inside a product-row searchable-select with barcode scan enabled. */
export function isInsideProductBarcodeSelect(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  const host = (element as HTMLElement).closest?.('app-searchable-select[data-product-barcode-scan="true"]');
  return !!host;
}

/** True when focus is on a product table line input (qty, batch, rate, remarks, discount). */
export function isInsideProductLineItemField(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  const el = element as HTMLElement;
  if (!el.closest?.('[data-product-row-index]')) {
    return false;
  }
  const lineInput = el.closest?.(
    'input[data-quantity-input], input[data-product-line-input], input[data-product-line-barcode]'
  ) ?? (
    el.matches?.('input[data-quantity-input], input[data-product-line-input], input[data-product-line-barcode]')
      ? el
      : null
  );
  return !!lineInput;
}

/** Returns true when focus is in an editable field that should not receive global barcode capture. */
export function shouldIgnoreGlobalBarcodeCapture(activeElement: Element | null): boolean {
  if (!activeElement) {
    return false;
  }
  const el = activeElement as HTMLElement;

  if (isInsideProductBarcodeSelect(el)) {
    return true;
  }

  // Allow capture for product line inputs (qty, batch, sale rate, etc.)
  if (isInsideProductLineItemField(el)) {
    return false;
  }

  const tag = el.tagName?.toLowerCase();
  if (tag === 'textarea') {
    return true;
  }
  if (tag === 'input') {
    const type = (el as HTMLInputElement).type?.toLowerCase() ?? 'text';
    if (type !== 'hidden') {
      return true;
    }
  }
  if (el.isContentEditable || el.closest?.('[contenteditable="true"]')) {
    return !isInsideProductBarcodeSelect(el);
  }
  if (el.closest?.('app-searchable-select')) {
    return true;
  }
  return false;
}
