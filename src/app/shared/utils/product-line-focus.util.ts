import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

const FOCUS_RETRY_DELAY_MS = 50;
const FOCUS_MAX_ATTEMPTS = 6;

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
