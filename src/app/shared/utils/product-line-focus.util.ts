import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

const FOCUS_RETRY_DELAY_MS = 50;
const FOCUS_MAX_ATTEMPTS = 16;
const OPEN_RETRY_DELAY_MS = 50;
const OPEN_MAX_ATTEMPTS = 25;
const FOCUS_SETTLE_DELAY_MS = 300;

export interface ProductSelectFocusHost {
  hostElement: HTMLElement;
  focusAndOpen(): boolean;
}

export interface VirtualRowProductSelectFocusOptions {
  viewport: CdkVirtualScrollViewport;
  rowIndex: number;
  itemCount: number;
  detectChanges: () => void;
  getSelectHosts: () => ProductSelectFocusHost[];
  hostSelector?: string;
  onComplete?: () => void;
}

export interface AddRowProductSelectFocusFlow {
  viewport: CdkVirtualScrollViewport | null | undefined;
  itemCountBeforeAdd: number;
  skipFocus?: boolean;
  detectChanges: () => void;
  getSelectHosts: () => ProductSelectFocusHost[];
  hostSelector?: string;
  pushRow: () => number;
  onAfterScroll?: () => void;
  onComplete?: () => void;
}

/**
 * Scrolls the virtual viewport to the bottom of the current list (last item fully visible).
 */
export function scrollVirtualViewportToEnd(
  viewport: CdkVirtualScrollViewport,
  itemCount: number
): void {
  if (itemCount <= 0) {
    return;
  }
  viewport.checkViewportSize();
  viewport.scrollToIndex(itemCount - 1, 'auto');
  const el = viewport.elementRef.nativeElement;
  const maxScroll = el.scrollHeight - el.clientHeight;
  el.scrollTop = Math.max(0, maxScroll);
}

/**
 * Scrolls to the end of the list, waits for the viewport to settle, then runs `then`.
 */
export function scrollVirtualViewportToEndThen(
  viewport: CdkVirtualScrollViewport,
  itemCount: number,
  then: () => void
): void {
  scrollVirtualViewportToEnd(viewport, itemCount);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setTimeout(then, 120);
    });
  });
}

/**
 * Opens the product searchable-select in a virtual-scroll row by row index.
 */
export function openProductSelectAtRowIndex(
  rowIndex: number,
  containerEl: HTMLElement,
  getSelectHosts: () => ProductSelectFocusHost[],
  detectChanges: () => void,
  hostSelector = 'app-searchable-select'
): boolean {
  detectChanges();
  const row = containerEl.querySelector(`[data-product-row-index="${rowIndex}"]`);
  if (!row) {
    return false;
  }
  const hostEl = row.querySelector(hostSelector) as HTMLElement | null;
  if (!hostEl) {
    return false;
  }
  const hosts = getSelectHosts();
  const match =
    hosts.find((s) => s.hostElement === hostEl) ??
    hosts.find((s) => row.contains(s.hostElement));
  return match?.focusAndOpen() ?? false;
}

function openProductSelectWithRetry(
  containerEl: HTMLElement,
  options: VirtualRowProductSelectFocusOptions,
  attempt: number
): void {
  if (attempt > OPEN_MAX_ATTEMPTS) {
    options.onComplete?.();
    return;
  }

  options.detectChanges();
  options.viewport.checkViewportSize();

  const range = options.viewport.getRenderedRange();
  const inRange = options.rowIndex >= range.start && options.rowIndex < range.end;
  if (!inRange) {
    scrollVirtualViewportToEnd(options.viewport, options.itemCount);
  }

  if (openProductSelectAtRowIndex(
    options.rowIndex,
    containerEl,
    options.getSelectHosts,
    options.detectChanges,
    options.hostSelector
  )) {
    options.onComplete?.();
    return;
  }

  setTimeout(() => openProductSelectWithRetry(containerEl, options, attempt + 1), OPEN_RETRY_DELAY_MS);
}

/**
 * Scrolls to the new last row and opens its product dropdown (after row is already added).
 */
export function scheduleVirtualRowProductSelectFocus(
  containerEl: HTMLElement,
  options: VirtualRowProductSelectFocusOptions
): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      options.detectChanges();
      options.viewport.checkViewportSize();
      scrollVirtualViewportToEnd(options.viewport, options.itemCount);
      setTimeout(() => openProductSelectWithRetry(containerEl, options, 0), FOCUS_SETTLE_DELAY_MS);
    });
  });
}

/**
 * Full Add Product flow: pre-scroll to bottom (if rows exist), push row, scroll, open dropdown.
 */
export function runAddRowWithProductSelectFocus(flow: AddRowProductSelectFocusFlow): void {
  const completeAdd = () => {
    const rowIndex = flow.pushRow();
    flow.onAfterScroll?.();

    if (flow.skipFocus || !flow.viewport) {
      flow.onComplete?.();
      return;
    }

    scheduleVirtualRowProductSelectFocus(flow.viewport.elementRef.nativeElement, {
      viewport: flow.viewport,
      rowIndex,
      itemCount: rowIndex + 1,
      detectChanges: flow.detectChanges,
      getSelectHosts: flow.getSelectHosts,
      hostSelector: flow.hostSelector,
      onComplete: flow.onComplete
    });
  };

  if (!flow.skipFocus && flow.viewport && flow.itemCountBeforeAdd > 0) {
    scrollVirtualViewportToEndThen(flow.viewport, flow.itemCountBeforeAdd, completeAdd);
    return;
  }

  completeAdd();
}

/**
 * Scrolls virtual list to row and focuses the quantity input for fast entry after barcode scan.
 */
export function focusQuantityInput(
  rowIndex: number,
  containerEl: HTMLElement | null | undefined,
  viewport?: CdkVirtualScrollViewport | null
): void {
  if (rowIndex < 0) {
    return;
  }

  if (viewport) {
    viewport.scrollToIndex(rowIndex, 'auto');
  }

  attemptFocusQuantity(rowIndex, containerEl, 0);
}

function attemptFocusQuantity(
  rowIndex: number,
  containerEl: HTMLElement | null | undefined,
  attempt: number
): void {
  if (!containerEl || attempt > FOCUS_MAX_ATTEMPTS) {
    return;
  }

  const row = containerEl.querySelector(`[data-product-row-index="${rowIndex}"]`);
  const qtyInput = row?.querySelector('[data-quantity-input]') as HTMLInputElement | null;

  if (qtyInput) {
    qtyInput.focus();
    try {
      qtyInput.select();
    } catch {
      // select() may fail on some mobile browsers for number inputs
    }
    return;
  }

  setTimeout(() => attemptFocusQuantity(rowIndex, containerEl, attempt + 1), FOCUS_RETRY_DELAY_MS);
}

/**
 * Scrolls to row and opens the product name searchable-select (add-product flow).
 * `openSelect` should focus/open the select when the row is rendered; return true on success.
 */
export function focusProductNameSelect(
  rowIndex: number,
  containerEl: HTMLElement | null | undefined,
  viewport: CdkVirtualScrollViewport | null | undefined,
  openSelect: (rowIndex: number) => boolean
): void {
  if (rowIndex < 0) {
    return;
  }

  if (viewport) {
    scrollVirtualViewportToEnd(viewport, rowIndex + 1);
  }

  attemptFocusProductName(rowIndex, containerEl, viewport, openSelect, 0);
}

function attemptFocusProductName(
  rowIndex: number,
  containerEl: HTMLElement | null | undefined,
  viewport: CdkVirtualScrollViewport | null | undefined,
  openSelect: (rowIndex: number) => boolean,
  attempt: number
): void {
  if (attempt > FOCUS_MAX_ATTEMPTS) {
    return;
  }

  if (openSelect(rowIndex)) {
    return;
  }

  if (viewport && attempt % 4 === 0) {
    scrollVirtualViewportToEnd(viewport, rowIndex + 1);
  }

  setTimeout(
    () => attemptFocusProductName(rowIndex, containerEl, viewport, openSelect, attempt + 1),
    FOCUS_RETRY_DELAY_MS
  );
}
