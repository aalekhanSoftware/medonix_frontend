import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, ViewChildren, QueryList, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, ValidatorFn, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil, Subscription, debounceTime, distinctUntilChanged, finalize } from 'rxjs';
import { formatDate } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

import { ProductService } from '../../../services/product.service';
import { SaleService } from '../../../services/sale.service';
import { CustomerService } from '../../../services/customer.service';
import { PriceService } from '../../../services/price.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SaleProductSelectComponent } from '../shared/sale-product-select/sale-product-select.component';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { ProductBatchStockService } from '../../../services/product-batch-stock.service';
import { transformProductsWithDisplayName } from '../../../shared/utils/product-display.util';
import {
  buildProductCodeMap,
  findLastRowIndexWithProductId,
  findProductByProductCode,
  getBarcodeKeyChar,
  isLikelyBarcodeInput,
  isInsideProductLineItemField,
  isProductFieldEditScan,
  looksLikeLineFieldBarcodeBuffer,
  normalizeScannedProductCodeText,
  resolveBarcodeTargetRow,
  shouldActivateLineFieldBarcodeCapture,
  shouldIgnoreGlobalBarcodeCapture,
  BARCODE_INPUT_MAX_DURATION_MS
} from '../../../shared/utils/product-barcode-scan.util';
import { focusProductNameSelect, focusQuantityInput, openProductSelectAtRowIndex, runAddRowWithProductSelectFocus } from '../../../shared/utils/product-line-focus.util';

interface ProductForm {
  id?: number | null;
  productId: string;
  quantity: number;
  batchNumber: string;
  unitPrice: number;
  price: number;
  discountType: 'percentage' | 'amount';
  discountPercentage: number;
  discountAmount: number;
  discountPrice: number;
  taxPercentage: number;
  taxAmount: number;
  remarks: string
}
@Component({
  selector: 'app-add-sale',
  standalone: false,
  templateUrl: './add-sale.component.html',
  styleUrl: './add-sale.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddSaleComponent implements OnInit, OnDestroy {
  saleForm!: FormGroup;
  products: any[] = [];
  customers: any[] = [];
  loading = false;
  isLoadingProducts = false;
  isLoadingCustomers = false;
  /** True while loading sale details for edit (customer, items, totals not yet set) */
  isLoadingSaleDetails = false;
  isEdit = false;
  private destroy$ = new Subject<void>();
  private productSubscriptions: Subscription[] = [];

  /** Cache for customer-product price to avoid duplicate API calls (customerId-productId -> price) */
  private productPriceCache: Map<string, number> = new Map();
  isLoadingPrices: { [key: number]: boolean } = {};
  
  // Memory optimization: Map for O(1) product lookups instead of O(n) find()
  private productMap: Map<any, any> = new Map();
  private productCodeMap: Map<string, any> = new Map();
  /** True when productMap is fully built (sync or chunked build finished). */
  private productMapReady = false;
  /** Build map synchronously when products <= this; otherwise build in chunks to avoid UI hang. */
  private readonly PRODUCT_MAP_SYNC_THRESHOLD = 1000;

  // Memory optimization: cached totals to avoid recalculating in template
  totalAmount: number = 0;
  totalDiscountAmount: number = 0;
  totalTaxAmount: number = 0;
  grandTotal: number = 0;
  /** Fresh object reference on each recalc so OnPush detects summary updates (add/remove/edit). */
  saleSummary: {
    totalProducts: number;
    totalAmount: number;
    totalDiscountAmount: number;
    totalTaxAmount: number;
    totalFinalPrice: number;
    grandTotal: number;
  } = {
    totalProducts: 0,
    totalAmount: 0,
    totalDiscountAmount: 0,
    totalTaxAmount: 0,
    totalFinalPrice: 0,
    grandTotal: 0
  };

  // Batch numbers fetched per-product from API
  apiBatchNumbersMap: Map<number, string[]> = new Map();
  
  // Active dropdown state
  activeBatchDropdownIndex: number | null = null;
  filteredBatchNumbers: string[] = [];
  batchDropdownCloseTimeout: any;

  /** Index of product row whose product select currently has focus. */
  activeProductRowIndex: number | null = null;
  private pendingProductsList: any[] | null = null;
  private preScanProductIdByRow = new Map<number, any>();
  /** Saved value of the line field focused before a barcode scan. */
  private preScanLineFieldSnapshot = new Map<number, { controlName: string; value: any }>();
  private globalBarcodeBuffer = '';
  private globalBarcodeKeyTimes: number[] = [];
  /** Accurate scan text from key events — number inputs corrupt dots in `.value`. */
  private lineFieldBarcodeBuffer = '';
  /** When scan applies product on the same row as the focused line field, restore that field. */
  private barcodeScanLineFieldPreserve: { rowIndex: number; controlName: string; value: any } | null = null;
  /** Authoritative value captured on first barcode key — before input/form mutation. */
  private lineFieldScanRestore: { rowIndex: number; controlName: string; value: any } | null = null;
  /** True once rapid multi-key input confirms a barcode scan (not manual typing). */
  private lineFieldScanActive = false;
  /** Min buffered length before line-field Enter triggers product lookup. */
  private readonly LINE_FIELD_BARCODE_MIN_LENGTH = 4;

  @ViewChild(CdkVirtualScrollViewport) viewport!: CdkVirtualScrollViewport;
  @ViewChild('productsSection') productsSectionRef!: ElementRef<HTMLElement>;
  @ViewChildren(SaleProductSelectComponent) searchableSelects!: QueryList<SaleProductSelectComponent>;

  get productsFormArray() {
    return this.saleForm.get('products') as FormArray;
  }

  /** New array reference on each add/remove so cdkVirtualFor detects changes (it ignores mutable push). */
  productControlsForView: AbstractControl[] = [];
  private pendingAddProductFocus = false;

  trackByProductControl(index: number, control: AbstractControl): AbstractControl {
    return control;
  }

  /** Row height in px; must match template itemSize. */
  private readonly VIRTUAL_SCROLL_ITEM_SIZE_PX = 52;

  /** Viewport height: grows with items up to a cap so virtual scroll only renders a small window (avoids UI hang). */
  getViewportHeight(): number {
    const rowHeight = this.VIRTUAL_SCROLL_ITEM_SIZE_PX;
    const maxHeight = 750;
    const count = this.productControlsForView.length;
    if (count === 0) return rowHeight;
    return Math.min(count * rowHeight, maxHeight);
  }

  // Add keyboard shortcut listener for Alt+P and Alt+Q
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Check if Alt+P is pressed
    if (event.altKey && event.key.toLowerCase() === 'p') {
      event.preventDefault(); // Prevent default browser behavior
      this.addProduct(); // Add new item when Alt+P is pressed
    }
    // Check if Alt+Q is pressed
    // if (event.altKey && event.key.toLowerCase() === 'q') {
    //   event.preventDefault(); // Prevent default browser behavior
    //   // Only submit if form is valid and not loading
    //   if (this.saleForm.valid && !this.loading) {
    //     this.onSubmit(); // Submit the sale form when Alt+Q is pressed
    //   }
    // }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentBarcodeKeydown(event: KeyboardEvent): void {
    const activeElement = document.activeElement;
    const inLineField = isInsideProductLineItemField(activeElement);

    if (shouldIgnoreGlobalBarcodeCapture(activeElement)) {
      if (event.key !== 'Enter') {
        this.resetGlobalBarcodeCapture();
      }
      return;
    }

    if (inLineField) {
      if (event.key === 'Enter' && activeElement instanceof HTMLInputElement) {
        this.handleLineFieldEnter(activeElement, event);
        return;
      }
      return;
    }

    if (event.key === 'Enter') {
      const code = normalizeScannedProductCodeText(this.globalBarcodeBuffer.trim(), []);
      if (code && isLikelyBarcodeInput(this.globalBarcodeKeyTimes, code)) {
        event.preventDefault();
        event.stopPropagation();
        this.processGlobalBarcodeScan(code);
      }
      this.resetGlobalBarcodeCapture();
      return;
    }

    const char = getBarcodeKeyChar(event);
    if (char) {
      const now = Date.now();
      this.globalBarcodeBuffer += char;
      this.globalBarcodeKeyTimes.push(now);
      if (this.globalBarcodeKeyTimes.length > 50) {
        this.globalBarcodeKeyTimes.shift();
      }
      event.preventDefault();
      event.stopPropagation();
    }
  }

  onProductSearchFocus(rowIndex: number): void {
    this.activeProductRowIndex = rowIndex;
    const currentId = this.productsFormArray.at(rowIndex)?.get('productId')?.value ?? '';
    this.preScanProductIdByRow.set(rowIndex, currentId);
  }

  onLineFieldFocus(rowIndex: number, controlName: string): void {
    const control = this.productsFormArray.at(rowIndex)?.get(controlName);
    if (control) {
      this.preScanLineFieldSnapshot.set(rowIndex, {
        controlName,
        value: control.value
      });
    }
    this.resetLineFieldScanState();
    this.resetGlobalBarcodeCapture();
  }

  onLineFieldInput(rowIndex: number, controlName: string): void {
    if (this.lineFieldScanActive || this.lineFieldBarcodeBuffer !== '') {
      return;
    }
    const control = this.productsFormArray.at(rowIndex)?.get(controlName);
    if (control) {
      this.preScanLineFieldSnapshot.set(rowIndex, {
        controlName,
        value: control.value
      });
    }
  }

  onLineFieldBlur(rowIndex: number, controlName: string): void {
    if (!this.lineFieldScanActive) {
      this.resetLineFieldScanState();
    }
  }

  /**
   * Handles printable keys on line-item inputs. Barcode capture runs here (not document-level)
   * so manual edits to qty, rate, batch, etc. are never blocked.
   */
  onLineFieldKeydown(event: KeyboardEvent, rowIndex: number, controlName: string): void {
    if (event.key === 'Enter') {
      return;
    }

    const char = getBarcodeKeyChar(event);
    if (!char) {
      return;
    }

    const now = Date.now();
    const lastKeyTime = this.globalBarcodeKeyTimes.length > 0
      ? this.globalBarcodeKeyTimes[this.globalBarcodeKeyTimes.length - 1]
      : 0;
    const gap = this.globalBarcodeKeyTimes.length === 0 ? Infinity : now - lastKeyTime;

    if (gap > BARCODE_INPUT_MAX_DURATION_MS) {
      this.resetLineFieldPendingState();
      this.lineFieldBarcodeBuffer = '';
      this.captureLineFieldScanRestoreAt(rowIndex, controlName);
    }

    if (this.lineFieldScanActive) {
      event.preventDefault();
      event.stopPropagation();
      this.lineFieldBarcodeBuffer += char;
      this.globalBarcodeKeyTimes.push(now);
      this.patchLineFieldControlValue(rowIndex, controlName);
      return;
    }

    if (this.globalBarcodeKeyTimes.length === 0) {
      this.captureLineFieldScanRestoreAt(rowIndex, controlName);
      this.lineFieldBarcodeBuffer = char;
      this.globalBarcodeKeyTimes.push(now);
      return;
    }

    if (gap <= BARCODE_INPUT_MAX_DURATION_MS) {
      this.lineFieldBarcodeBuffer += char;
      this.globalBarcodeKeyTimes.push(now);

      if (shouldActivateLineFieldBarcodeCapture(this.lineFieldBarcodeBuffer, controlName)) {
        this.lineFieldScanActive = true;
        event.preventDefault();
        event.stopPropagation();
        this.patchLineFieldControlValue(rowIndex, controlName);
        this.cdr.markForCheck();
      }
      return;
    }

    this.resetLineFieldPendingState();
    this.lineFieldBarcodeBuffer = char;
    this.captureLineFieldScanRestoreAt(rowIndex, controlName);
    this.globalBarcodeKeyTimes.push(now);
  }

  private handleLineFieldEnter(input: HTMLInputElement, event: KeyboardEvent): void {
    const controlName = input.getAttribute('formcontrolname') || '';
    const code = normalizeScannedProductCodeText(this.lineFieldBarcodeBuffer.trim(), []);
    const isLineFieldBarcodeAttempt =
      code.length >= this.LINE_FIELD_BARCODE_MIN_LENGTH &&
      isLikelyBarcodeInput(this.globalBarcodeKeyTimes, code) &&
      looksLikeLineFieldBarcodeBuffer(code, controlName);

    if (isLineFieldBarcodeAttempt) {
      event.preventDefault();
      event.stopPropagation();
      const rowEl = input.closest('[data-product-row-index]');
      const sourceRowIndex = rowEl
        ? parseInt(rowEl.getAttribute('data-product-row-index') || '-1', 10)
        : -1;
      const restoreData = sourceRowIndex >= 0
        ? this.getLineFieldRestoreData(sourceRowIndex, controlName)
        : null;
      if (restoreData) {
        this.barcodeScanLineFieldPreserve = { ...restoreData };
      }
      if (sourceRowIndex >= 0 && controlName) {
        this.patchLineFieldControlValue(sourceRowIndex, controlName);
        this.cdr.markForCheck();
      }
      input.blur();
      this.processGlobalBarcodeScan(code);
    }
    this.resetLineFieldScanState();
  }

  onProductSearchBlur(rowIndex: number): void {
    setTimeout(() => {
      if (this.activeProductRowIndex !== rowIndex) {
        return;
      }
      const active = document.activeElement;
      const stillInProductSelect = active?.closest?.('app-sale-product-select');
      if (!stillInProductSelect) {
        this.activeProductRowIndex = null;
        this.flushPendingProductsList();
      }
    }, 150);
  }

  onProductCodeMatched(sourceRowIndex: number, event: { code: string; value: any }): void {
    this.applyBarcodeScanResult(event.value, {
      sourceRowIndex,
      isProductFieldEdit: isProductFieldEditScan(this.preScanProductIdByRow.get(sourceRowIndex))
    });
  }

  onProductCodeNotFound(code: string): void {
    this.snackbar.error(`Product code <${code}> not found`);
  }

  private processGlobalBarcodeScan(code: string): void {
    const product = findProductByProductCode(code, this.products, this.productCodeMap);
    if (!product) {
      this.barcodeScanLineFieldPreserve = null;
      this.finalizeSourceLineFieldRestore();
      this.snackbar.error(`Product code <${code}> not found`);
      return;
    }
    this.applyBarcodeScanResult(product.id, {
      sourceRowIndex: null,
      isProductFieldEdit: false
    });
  }

  private applyBarcodeScanResult(
    productId: any,
    options: { sourceRowIndex: number | null; isProductFieldEdit: boolean }
  ): void {
    const sourceRestore = this.lineFieldScanRestore ? { ...this.lineFieldScanRestore } : null;

    const existingIndex = findLastRowIndexWithProductId(
      this.productsFormArray.length,
      (index) => this.productsFormArray.at(index)?.get('productId')?.value,
      productId
    );

    if (existingIndex >= 0) {
      this.incrementProductQuantityAtRow(existingIndex);
      if (sourceRestore && sourceRestore.rowIndex !== existingIndex) {
        this.scheduleSourceLineFieldRestoreAfterScan(sourceRestore);
      } else {
        this.barcodeScanLineFieldPreserve = null;
        this.clearLineFieldScanRestore();
      }
      return;
    }

    if (options.sourceRowIndex !== null && options.sourceRowIndex >= 0) {
      this.applyScannedProductToRow(options.sourceRowIndex, productId, { setDefaultQuantity: true });
      if (sourceRestore && sourceRestore.rowIndex !== options.sourceRowIndex) {
        this.scheduleSourceLineFieldRestoreAfterScan(sourceRestore);
      } else {
        this.clearLineFieldScanRestore();
      }
      return;
    }

    const target = this.resolveBarcodeTargetOutsideProduct();

    if (target.shouldCreateRow) {
      this.addProduct({ skipProductFocus: true });
    }

    const rowIndex = target.shouldCreateRow
      ? this.productsFormArray.length - 1
      : target.rowIndex;

    this.applyScannedProductToRow(rowIndex, productId, { setDefaultQuantity: true });

    if (sourceRestore && sourceRestore.rowIndex !== rowIndex) {
      this.scheduleSourceLineFieldRestoreAfterScan(sourceRestore);
    } else {
      this.clearLineFieldScanRestore();
    }
  }

  private incrementProductQuantityAtRow(rowIndex: number): void {
    const group = this.productsFormArray.at(rowIndex) as FormGroup;
    const qtyControl = group.get('quantity');
    const currentQty = Number(qtyControl?.value || 0);
    qtyControl?.setValue(Math.max(1, currentQty + 1), { emitEvent: true });
    this.calculateProductPrice(group);
    this.calculateTotalAmount();
    this.focusQuantityForRow(rowIndex);
    this.cdr.markForCheck();
  }

  /** Clears line-item fields then applies scanned product so price/batch APIs re-run. */
  private applyScannedProductToRow(
    rowIndex: number,
    productId: any,
    options?: { setDefaultQuantity?: boolean }
  ): void {
    const group = this.productsFormArray.at(rowIndex) as FormGroup;
    this.resetProductRowForBarcodeScan(group);
    group.patchValue({ productId }, { emitEvent: true });

    const preserve = this.barcodeScanLineFieldPreserve;
    if (preserve && preserve.rowIndex === rowIndex) {
      group.patchValue({ [preserve.controlName]: preserve.value }, { emitEvent: false });
    }
    this.barcodeScanLineFieldPreserve = null;

    if (options?.setDefaultQuantity) {
      group.get('quantity')?.setValue(1, { emitEvent: true });
      this.calculateProductPrice(group);
    }

    this.focusQuantityForRow(rowIndex);
    this.cdr.markForCheck();
  }

  private resetProductRowForBarcodeScan(group: FormGroup): void {
    group.patchValue({
      productId: '',
      quantity: 0,
      batchNumber: '',
      unitPrice: '',
      discountType: 'percentage',
      discountPercentage: 0,
      discountAmount: 0,
      remarks: null
    }, { emitEvent: false });
  }

  private resolveBarcodeTarget() {
    return resolveBarcodeTargetRow({
      rowCount: this.productsFormArray.length,
      activeProductRowIndex: this.activeProductRowIndex,
      rowHasProduct: (index) => this.rowHasProductAt(index)
    });
  }

  /** Outside-product scans ignore stale product-field focus (e.g. after tabbing to qty). */
  private resolveBarcodeTargetOutsideProduct() {
    return resolveBarcodeTargetRow({
      rowCount: this.productsFormArray.length,
      activeProductRowIndex: null,
      rowHasProduct: (index) => this.rowHasProductAt(index)
    });
  }

  private rowHasProductAt(index: number): boolean {
    const id = this.productsFormArray.at(index)?.get('productId')?.value;
    return id !== null && id !== undefined && id !== '';
  }

  private focusQuantityForRow(rowIndex: number): void {
    this.cdr.detectChanges();
    setTimeout(() => {
      focusQuantityInput(
        rowIndex,
        this.productsSectionRef?.nativeElement ?? null,
        this.viewport
      );
    }, 120);
  }

  private resetGlobalBarcodeCapture(): void {
    this.globalBarcodeBuffer = '';
    this.globalBarcodeKeyTimes = [];
  }

  /** Clears pending/confirmed line-field barcode state without touching global capture. */
  private resetLineFieldPendingState(): void {
    this.lineFieldScanRestore = null;
    this.globalBarcodeKeyTimes = [];
  }

  private resetLineFieldScanState(): void {
    this.lineFieldScanActive = false;
    this.lineFieldBarcodeBuffer = '';
    this.lineFieldScanRestore = null;
    this.globalBarcodeKeyTimes = [];
  }

  private clearLineFieldScanRestore(): void {
    this.lineFieldScanRestore = null;
  }

  private captureLineFieldScanRestore(input: HTMLInputElement, rowIndex: number): void {
    const controlName = input.getAttribute('formcontrolname');
    if (controlName) {
      this.captureLineFieldScanRestoreAt(rowIndex, controlName);
    }
  }

  private captureLineFieldScanRestoreAt(rowIndex: number, controlName: string): void {
    if (rowIndex < 0 || !controlName) {
      return;
    }
    const control = this.productsFormArray.at(rowIndex)?.get(controlName);
    if (control) {
      this.lineFieldScanRestore = {
        rowIndex,
        controlName,
        value: control.value
      };
    }
  }

  private patchLineFieldControlValue(rowIndex: number, controlName: string): void {
    const restore = this.lineFieldScanRestore;
    if (
      !restore ||
      restore.rowIndex !== rowIndex ||
      restore.controlName !== controlName
    ) {
      return;
    }
    const group = this.productsFormArray.at(rowIndex) as FormGroup;
    group?.get(controlName)?.setValue(restore.value, { emitEvent: false });
  }

  private getLineFieldRestoreData(
    rowIndex: number,
    controlName: string
  ): { rowIndex: number; controlName: string; value: any } | null {
    if (
      this.lineFieldScanRestore &&
      this.lineFieldScanRestore.rowIndex === rowIndex &&
      this.lineFieldScanRestore.controlName === controlName
    ) {
      return { ...this.lineFieldScanRestore };
    }
    const snapshot = this.preScanLineFieldSnapshot.get(rowIndex);
    if (snapshot?.controlName === controlName) {
      return { rowIndex, controlName: snapshot.controlName, value: snapshot.value };
    }
    return null;
  }

  /** Restores the scanned-from line field using the value captured at scan start. */
  private applySourceLineFieldRestore(input?: HTMLInputElement | null): void {
    const restore = this.lineFieldScanRestore;
    if (!restore) {
      return;
    }
    this.patchLineFieldControlValue(restore.rowIndex, restore.controlName);
  }

  /** Re-applies source row field after addProduct / virtual scroll re-render. */
  private scheduleSourceLineFieldRestoreAfterScan(
    restore: { rowIndex: number; controlName: string; value: any }
  ): void {
    this.cdr.detectChanges();
    setTimeout(() => {
      this.applySourceLineFieldRestoreByIndex(restore.rowIndex, restore.controlName, restore.value);
      this.clearLineFieldScanRestore();
      this.cdr.markForCheck();
    }, 0);
  }

  private applySourceLineFieldRestoreByIndex(rowIndex: number, controlName: string, value: any): void {
    const group = this.productsFormArray.at(rowIndex) as FormGroup;
    if (!group?.get(controlName)) {
      return;
    }
    group.get(controlName)?.setValue(value, { emitEvent: false });
  }

  private finalizeSourceLineFieldRestore(): void {
    const restore = this.lineFieldScanRestore;
    if (!restore) {
      return;
    }
    this.applySourceLineFieldRestoreByIndex(restore.rowIndex, restore.controlName, restore.value);
    this.clearLineFieldScanRestore();
  }

  /** Restores a line-item field to its pre-scan value after barcode capture from that cell. */
  private revertLineFieldInput(rowIndex: number, input: HTMLInputElement): void {
    const controlName = input.getAttribute('formcontrolname') || '';
    const restoreData = this.getLineFieldRestoreData(rowIndex, controlName);
    if (!restoreData) {
      return;
    }
    this.applySourceLineFieldRestoreByIndex(restoreData.rowIndex, restoreData.controlName, restoreData.value);
  }

  constructor(
    private fb: FormBuilder,
    private productService: ProductService,
    private customerService: CustomerService,
    private saleService: SaleService,
    private priceService: PriceService,
    private snackbar: SnackbarService,
    private http: HttpClient,
    private router: Router,
    private encryptionService: EncryptionService,
    private productBatchStockService: ProductBatchStockService,
    private cdr: ChangeDetectorRef
  ) {
    this.initForm();
  }

  ngOnInit() {
    this.loadProducts();
    this.loadCustomers();
    this.setupCustomerChangeListener();

    // Listen to packaging charges changes to update display
    this.saleForm.get('packagingAndForwadingCharges')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(150)
      )
      .subscribe(() => {
        this.calculateTotalAmount();
        this.cdr.markForCheck();
      });

    // Debounced total recalculation for large forms (2000+ items) to avoid UI hang
    this.productsFormArray.valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(200))
      .subscribe(() => {
        this.calculateTotalAmount();
        this.cdr.markForCheck();
      });
    
    const encryptedId = localStorage.getItem('saleId');
    if (encryptedId) {
      const saleId = this.encryptionService.decrypt(encryptedId);
      if (saleId) {
        this.isLoadingSaleDetails = true;
        this.cdr.markForCheck();
        this.fetchSaleDetails(Number(saleId));
      }
    }
  }

  ngOnDestroy() {
    // Unsubscribe from all product subscriptions
    this.productSubscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    this.productSubscriptions = [];

    // Complete destroy subject to clean up all takeUntil subscriptions
    this.destroy$.next();
    this.destroy$.complete();

    // Clear cache and maps to release memory
    this.productPriceCache.clear();
    this.products = [];
    this.customers = [];
    this.productMap.clear();
    this.productCodeMap.clear();
    this.productMapReady = false;
    this.preScanProductIdByRow.clear();
    this.preScanLineFieldSnapshot.clear();
    this.resetLineFieldScanState();
    this.resetGlobalBarcodeCapture();

    // Reset form to release form subscriptions
    if (this.saleForm) {
      this.saleForm.reset();
    }
  }

  private initForm() {
    this.saleForm = this.fb.group({
      id: [null],
      customerId: ['', Validators.required],
      saleDate: [formatDate(new Date(), 'yyyy-MM-dd', 'en'), Validators.required],
      invoiceNumber: [''],
      products: this.fb.array([]),
      isBlack: [false, Validators.required],
      packagingAndForwadingCharges: [0, [Validators.required, Validators.min(0)]]
    });

    // Add initial product form group
    this.addProduct();
  }

  private createProductFormGroup(): FormGroup {
    return this.fb.group({
      id: [null], // Item ID for updates
      productId: ['', Validators.required],
      quantity: [0, [Validators.required, Validators.min(1)]],
      batchNumber: ['', [this.noDoubleQuotesValidator()]],
      unitPrice: ['', [Validators.required, Validators.min(0.01)]],
      price: [{ value: 0, disabled: true }],
      discountType: ['percentage'],
      discountPercentage: [0, [Validators.min(0), Validators.max(100)]],
      discountAmount: [0, [Validators.min(0)]],
      discountPrice: [{ value: 0, disabled: true }],
      taxPercentage: [{ value: 0, disabled: true }],
      taxAmount: [{ value: 0, disabled: true }],
      remarks:[null, []]
    });
  }

  addProduct(options?: { skipProductFocus?: boolean }): void {
    const skipFocus = options?.skipProductFocus ?? false;
    if (!skipFocus) {
      this.pendingAddProductFocus = true;
    }
    runAddRowWithProductSelectFocus({
      viewport: this.viewport,
      itemCountBeforeAdd: this.productsFormArray.length,
      skipFocus,
      detectChanges: () => this.cdr.detectChanges(),
      getSelectHosts: () => this.searchableSelects?.toArray() ?? [],
      hostSelector: 'app-sale-product-select',
      pushRow: () => this.pushProductRow(options),
      onAfterScroll: () => {
        this.calculateTotalAmount();
        this.cdr.markForCheck();
      },
      onComplete: () => {
        this.pendingAddProductFocus = false;
      }
    });
  }

  private pushProductRow(options?: { skipProductFocus?: boolean }): number {
    const productGroup = this.createProductFormGroup();
    const prevProductId = options?.skipProductFocus
      ? ''
      : (this.productsFormArray.length > 0
        ? this.productsFormArray.at(this.productsFormArray.length - 1).get('productId')?.value
        : '');
    productGroup.reset({
      id: null,
      productId: prevProductId ?? '',
      quantity: 0,
      batchNumber: '',
      unitPrice: '',
      price: 0,
      discountType: 'percentage',
      discountPercentage: 0,
      discountAmount: 0,
      discountPrice: 0,
      taxPercentage: 0,
      taxAmount: 0,
      remarks: null
    }, { emitEvent: false });
    const subscription = this.setupProductCalculations(productGroup);
    this.productSubscriptions.push(subscription);
    this.productsFormArray.push(productGroup);
    this.productControlsForView = Array.from(this.productsFormArray.controls);
    if (prevProductId) {
      productGroup.get('productId')?.setValue(prevProductId, { emitEvent: true });
    }
    this.calculateTotalAmount();
    this.cdr.markForCheck();
    return this.productsFormArray.length - 1;
  }

  /** Focus the product name (first column) of the last row and open the dropdown. */
  private focusLastProductName(): void {
    const rowIndex = this.productsFormArray.length - 1;
    if (rowIndex < 0 || !this.viewport) {
      return;
    }

    const container = this.viewport.elementRef.nativeElement;
    focusProductNameSelect(
      rowIndex,
      container,
      this.viewport,
      (idx) => openProductSelectAtRowIndex(
        idx,
        container,
        () => this.searchableSelects?.toArray() ?? [],
        () => this.cdr.detectChanges(),
        'app-sale-product-select'
      )
    );
  }

  /** When Tab is pressed on the Remove button of the last row, add a new product instead of leaving the table. */
  onRemarksKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Tab' && index === this.productControlsForView.length - 1) {
      event.preventDefault();
      this.addProduct();
    }
  }

  removeProduct(index: number): void {
    if (this.productsFormArray.length <= 1) return;
    if (index < 0 || index >= this.productsFormArray.length) return;

    // Rekey loading state so indices match remaining rows
    const newLoadingPrices: { [key: number]: boolean } = {};
    Object.keys(this.isLoadingPrices).forEach(key => {
      const oldIndex = Number(key);
      if (!Number.isInteger(oldIndex)) return;
      if (oldIndex > index) {
        newLoadingPrices[oldIndex - 1] = this.isLoadingPrices[oldIndex];
      } else if (oldIndex < index) {
        newLoadingPrices[oldIndex] = this.isLoadingPrices[oldIndex];
      }
    });
    this.isLoadingPrices = newLoadingPrices;

    const sub = this.productSubscriptions[index];
    if (sub && !sub.closed) {
      sub.unsubscribe();
    }
    this.productSubscriptions.splice(index, 1);

    this.productsFormArray.removeAt(index);
    this.productControlsForView = Array.from(this.productsFormArray.controls);
    this.calculateTotalAmount();
    this.cdr.markForCheck();
    this.cdr.detectChanges();

    setTimeout(() => {
      this.viewport?.checkViewportSize();
      this.calculateTotalAmount();
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    }, 0);
  }

  private setupProductCalculations(group: FormGroup): Subscription {
    const subscription = new Subscription();

    // Listen to product selection: set tax, then fetch customer price or use product saleAmount
    const productIdSubscription = group.get('productId')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged()
      )
      .subscribe((productId) => {
        if (productId) {
          const selectedProduct = this.getProductByValue(productId);
          if (selectedProduct) {
            const taxPercentage = selectedProduct.taxPercentage ?? 0;
            group.patchValue({ taxPercentage }, { emitEvent: false });
            this.fetchProductPrice(group, selectedProduct);

            if (!this.apiBatchNumbersMap.has(productId)) {
              this.productBatchStockService.getAvailableBatchNames(productId)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                  next: (response) => {
                    const batchArray = Array.isArray(response) ? response : (response && response.success && Array.isArray(response.data) ? response.data : null);
                    if (batchArray) {
                      this.apiBatchNumbersMap.set(productId, batchArray);
                      this.cdr.markForCheck();
                    }
                  },
                  error: () => { }
                });
            }
          }
        }
      });
    
    if (productIdSubscription) {
      subscription.add(productIdSubscription);
    }

    // Listen to quantity and unitPrice changes
    const valueSubscription = group.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(150)
      )
      .subscribe(() => {
        this.calculateProductPrice(group);
      });
    
    subscription.add(valueSubscription);

    return subscription;
  }

  private fetchProductPrice(group: FormGroup, selectedProduct: any): void {
    const index = this.productsFormArray.controls.indexOf(group);
    const customerId = this.saleForm.get('customerId')?.value;

    if (customerId) {
      this.fetchCustomerPrice(group, selectedProduct.id, customerId, index);
    } else {
      const unitPrice = selectedProduct.saleAmount ?? selectedProduct.sale_amount ?? 0;
      group.patchValue({ unitPrice }, { emitEvent: true });
      this.calculateProductPrice(group);
    }
  }

  private fetchCustomerPrice(group: FormGroup, productId: number, customerId: number, index: number): void {
    if (index >= 0) {
      this.isLoadingPrices[index] = true;
    }

    const cacheKey = `${customerId}-${productId}`;
    if (this.productPriceCache.has(cacheKey)) {
      const cachedPrice = this.productPriceCache.get(cacheKey)!;
      group.patchValue({ unitPrice: cachedPrice }, { emitEvent: true });
      if (index >= 0) {
        this.isLoadingPrices[index] = false;
      }
      this.calculateProductPrice(group);
      this.cdr.markForCheck();
      return;
    }

    const requestData = { customerId, productId };
    this.priceService.getCustomerPrice(requestData)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          if (index >= 0) {
            this.isLoadingPrices[index] = false;
          }
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response) => {
          if (response?.success && response?.data) {
            const price = Number(response.data.price) || 0;
            this.productPriceCache.set(cacheKey, price);
            group.patchValue({ unitPrice: price }, { emitEvent: true });
            this.calculateProductPrice(group);
          } else {
            this.setFallbackPrice(group);
          }
        },
        error: (err) => {
          console.error('Error fetching customer price:', err);
          this.setFallbackPrice(group);
        }
      });
  }

  private setFallbackPrice(group: FormGroup): void {
    const productId = group.get('productId')?.value;
    const selectedProduct = this.getProductByValue(productId);
    if (selectedProduct) {
      const unitPrice = selectedProduct.saleAmount ?? selectedProduct.sale_amount ?? 0;
      group.patchValue({ unitPrice }, { emitEvent: true });
      this.calculateProductPrice(group);
      this.cdr.markForCheck();
    }
  }

  private setupCustomerChangeListener(): void {
    this.saleForm.get('customerId')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.productPriceCache.clear();
      });
  }

  private calculateProductPrice(group: FormGroup): void {
    if (!group) return;

    const quantity = Number(group.get('quantity')?.value || 0);
    const unitPrice = Number(group.get('unitPrice')?.value || 0);
    const taxPercentage = Number(group.get('taxPercentage')?.value || 0);
    const discountType = group.get('discountType')?.value || 'percentage';
    const discountPercentage = Number(group.get('discountPercentage')?.value || 0);
    let discountAmount = Number(group.get('discountAmount')?.value || 0);
    
    // Calculate subtotal = unitPrice * quantity (original price before discount)
    const subtotal = Number((quantity * unitPrice).toFixed(2));
    
    // Calculate discount amount based on type
    let calculatedDiscountAmount = 0;
    if (discountType === 'percentage' && discountPercentage > 0) {
      // Cap percentage at 100
      const cappedPercentage = Math.min(discountPercentage, 100);
      calculatedDiscountAmount = Number((subtotal * (cappedPercentage / 100)).toFixed(2));
      // Update the form if percentage was capped
      if (discountPercentage > 100) {
        group.patchValue({ discountPercentage: 100 }, { emitEvent: false });
      }
    } else if (discountType === 'amount' && discountAmount > 0) {
      // Cap discount amount at subtotal
      calculatedDiscountAmount = Math.min(discountAmount, subtotal);
      // Update the form if amount was capped
      if (discountAmount > subtotal) {
        group.patchValue({ discountAmount: subtotal }, { emitEvent: false });
      }
    }
    
    // Calculate discount price (price after discount)
    const calculatedDiscountPrice = Number((subtotal - calculatedDiscountAmount).toFixed(2));
    
    // Calculate tax on discounted price (not on original subtotal)
    const taxAmount = Number((calculatedDiscountPrice * taxPercentage / 100).toFixed(2));
    
    // Calculate final price = discountPrice + taxAmount
    const finalPrice = Number((calculatedDiscountPrice + taxAmount).toFixed(2));

    group.patchValue({
      price: subtotal, // Original subtotal before discount
      discountAmount: calculatedDiscountAmount,
      discountPrice: calculatedDiscountPrice,
      taxAmount: taxAmount
    }, { emitEvent: false });

    this.cdr.markForCheck();
    this.calculateTotalAmount();
  }

  getTotalAmount(): number {
    return this.productsFormArray.controls
      .reduce((total, group: any) => total + (group.get('price').value || 0), 0);
  }

  getTotalTaxAmount(): number {
    return this.productsFormArray.controls
      .reduce((total, group: any) => total + (group.get('taxAmount').value || 0), 0);
  }

  getTotalFinalPrice(): number {
    // Sum of all items' finalPrice (discountPrice + taxAmount for each item)
    return this.productsFormArray.controls
      .reduce((total, group: any) => {
        const discountPrice = Number(group.get('discountPrice')?.value || group.get('price')?.value || 0);
        const taxAmount = Number(group.get('taxAmount')?.value || 0);
        return total + (discountPrice + taxAmount);
      }, 0);
  }

  getTotalDiscountAmount(): number {
    return this.productsFormArray.controls
      .reduce((total, group: any) => total + (Number(group.get('discountAmount')?.value || 0)), 0);
  }

  onDiscountTypeChange(index: number): void {
    const group = this.productsFormArray.at(index) as FormGroup;
    const discountType = group.get('discountType')?.value;
    
    // Reset discount values when switching types
    if (discountType === 'percentage') {
      group.patchValue({ discountAmount: 0 }, { emitEvent: false });
    } else {
      group.patchValue({ discountPercentage: 0 }, { emitEvent: false });
    }
    
    this.calculateProductPrice(group);
  }

  validateDiscount(index: number): boolean {
    const group = this.productsFormArray.at(index) as FormGroup;
    const quantity = Number(group.get('quantity')?.value || 0);
    const unitPrice = Number(group.get('unitPrice')?.value || 0);
    const subtotal = quantity * unitPrice;
    const discountType = group.get('discountType')?.value;
    const discountPercentage = Number(group.get('discountPercentage')?.value || 0);
    const discountAmount = Number(group.get('discountAmount')?.value || 0);
    
    if (discountType === 'percentage') {
      if (discountPercentage < 0 || discountPercentage > 100) {
        return false;
      }
    } else if (discountType === 'amount') {
      if (discountAmount < 0) {
        return false;
      }
      if (discountAmount > subtotal) {
        // Cap discount amount at subtotal
        group.patchValue({ discountAmount: subtotal }, { emitEvent: false });
        this.calculateProductPrice(group);
        return false;
      }
    }
    
    return true;
  }

  getGrandTotal(): number {
    // totalAmount = sum of all items' finalPrice + packagingAndForwadingCharges
    const packagingCharges = Number(this.saleForm.get('packagingAndForwadingCharges')?.value || 0);
    return this.getTotalFinalPrice() + packagingCharges;
  }

  private loadProducts(): void {
    this.isLoadingProducts = true;
    this.productService.getProducts({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.queueOrApplyProductsList(transformProductsWithDisplayName(response.data));
          }
          this.isLoadingProducts = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.snackbar.error('Failed to load products');
          this.isLoadingProducts = false;
          this.cdr.markForCheck();
        }
      });
  }

  // Memory optimization: build Map for O(1) product lookups (sync path when products <= threshold)
  private buildProductMap(): void {
    this.productMap.clear();
    for (const product of this.products) {
      const id = product.id;
      if (id !== undefined && id !== null) {
        this.productMap.set(id, product);
        this.productMap.set(String(id), product);
      }
    }
    this.productCodeMap = buildProductCodeMap(this.products);
    this.productMapReady = true;
  }

  /** O(1) lookup with type tolerance; fallback to find when map is still building. */
  private getProductByValue(value: any): any {
    if (value === undefined || value === null) return undefined;
    if (this.productMap.size > 0) {
      let product = this.productMap.get(value);
      if (product) return product;
      if (typeof value === 'string' && /^\d+$/.test(String(value).trim())) {
        product = this.productMap.get(Number(value));
        if (product) return product;
      }
      if (typeof value === 'number') {
        product = this.productMap.get(String(value));
        if (product) return product;
      }
    }
    if (!this.productMapReady && this.products.length > 0) {
      return this.products.find((p: any) => p.id === value || p.id === Number(value));
    }
    return undefined;
  }

  /** Build productMap in chunks so UI stays responsive for 10k+ products. */
  private scheduleChunkedProductMapBuild(): void {
    this.productMapReady = false;
    this.productMap.clear();
    this.productCodeMap.clear();
    const list = this.products;
    const chunkSize = 2000;
    let processed = 0;

    const processChunk = () => {
      const endIndex = Math.min(processed + chunkSize, list.length);
      for (let i = processed; i < endIndex; i++) {
        const product = list[i];
        const id = product?.id;
        if (id !== undefined && id !== null) {
          this.productMap.set(id, product);
          this.productMap.set(String(id), product);
        }
      }
      processed = endIndex;
      if (processed < list.length) {
        requestAnimationFrame(processChunk);
      } else {
        this.productMapReady = true;
        this.productCodeMap = buildProductCodeMap(this.products);
        this.cdr.markForCheck();
      }
    };

    if (list.length > 0) {
      requestAnimationFrame(processChunk);
    } else {
      this.productMapReady = true;
      this.cdr.markForCheck();
    }
  }

  /** Avoid resetting open product search inputs when options reload mid-typing. */
  private queueOrApplyProductsList(products: any[], showRefreshSuccess = false): void {
    if (this.activeProductRowIndex !== null) {
      this.pendingProductsList = products;
      if (showRefreshSuccess) {
        this.snackbar.success('Products refreshed successfully');
      }
      return;
    }
    this.applyProductsList(products, showRefreshSuccess);
  }

  private flushPendingProductsList(): void {
    if (this.pendingProductsList === null) {
      return;
    }
    const pending = this.pendingProductsList;
    this.pendingProductsList = null;
    this.applyProductsList(pending);
  }

  private applyProductsList(products: any[], showRefreshSuccess = false): void {
    this.products = products;
    if (this.products.length === 0) {
      this.productMap.clear();
      this.productCodeMap.clear();
      this.productMapReady = true;
    } else if (this.products.length <= this.PRODUCT_MAP_SYNC_THRESHOLD) {
      this.buildProductMap();
    } else {
      this.scheduleChunkedProductMapBuild();
    }
    if (showRefreshSuccess) {
      this.snackbar.success('Products refreshed successfully');
    }
    this.cdr.markForCheck();
  }

  refreshProducts(): void {
    this.isLoadingProducts = true;
    this.productService.refreshProducts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.queueOrApplyProductsList(transformProductsWithDisplayName(response.data), true);
          }
          this.isLoadingProducts = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.snackbar.error('Failed to refresh products');
          this.isLoadingProducts = false;
          this.cdr.markForCheck();
        }
      });
  }

  private loadCustomers(): void {
    this.isLoadingCustomers = true;
    this.customerService.getCustomers({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.customers = response.data;
          }
          this.isLoadingCustomers = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.snackbar.error('Failed to load customers');
          this.isLoadingCustomers = false;
          this.cdr.markForCheck();
        }
      });
  }

  refreshCustomers(): void {
    this.isLoadingCustomers = true;
    this.customerService.refreshCustomers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.customers = response.data;
          }
          this.snackbar.success('Customers refreshed successfully');
          this.isLoadingCustomers = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.snackbar.error('Failed to load customers');
          this.isLoadingCustomers = false;
          this.cdr.markForCheck();
        }
      });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.saleForm.get(fieldName);
    return field ? field.invalid && field.touched : false;
  }

  isProductFieldInvalid(index: number, fieldName: string): boolean {
    const control = this.productsFormArray.at(index).get(fieldName);
    if (!control) return false;

    const isInvalid = control.invalid && (control.dirty || control.touched);
    
    if (isInvalid) {
      const errors = control.errors;
      if (errors) {
        if (errors['required']) return true;
        if (errors['min'] && (fieldName === 'quantity' || fieldName === 'unitPrice' || fieldName === 'discountAmount')) return true;
        if (errors['max'] && fieldName === 'discountPercentage') return true;
        if (errors['min'] || errors['max']) return true;
      }
    }
    
    // Additional validation for discount amount exceeding subtotal
    if (fieldName === 'discountAmount') {
      const group = this.productsFormArray.at(index) as FormGroup;
      const quantity = Number(group.get('quantity')?.value || 0);
      const unitPrice = Number(group.get('unitPrice')?.value || 0);
      const subtotal = quantity * unitPrice;
      const discountAmount = Number(control.value || 0);
      if (discountAmount > subtotal) {
        return true;
      }
    }
    
    return false;
  }

  resetForm() {
    this.isEdit = false;
    this.saleForm.patchValue({ id: null });
    this.initForm();
  }

  onSubmit() {
    this.markFormGroupTouched(this.saleForm);
    
    if (this.saleForm.valid) {
      this.loading = true;
      const formData = this.prepareFormData();
      
      const serviceCall = this.isEdit 
        ? this.saleService.updateSale(formData)
        : this.saleService.createSale(formData);
      
      serviceCall
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response: any) => {
            if (response?.success) {
              this.snackbar.success(`Sale ${this.isEdit ? 'updated' : 'created'} successfully`);
              localStorage.removeItem('saleId');
              this.router.navigate(['/sale']);
            }
            this.loading = false;
            this.cdr.markForCheck();
          },
          error: (error) => {
            this.snackbar.error(error?.error?.message || `Failed to ${this.isEdit ? 'update' : 'create'} sale`);
            this.loading = false;
            this.cdr.markForCheck();
          }
        });
    } else {
      // Scroll to first error
      const firstError = document.querySelector('.is-invalid');
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  private prepareFormData() {
    const formValue = this.saleForm.value;
    const data: any = {
      saleDate: formatDate(formValue.saleDate, 'dd-MM-yyyy', 'en'),
      customerId: formValue.customerId,
      invoiceNumber: formValue.invoiceNumber,
      price: this.getTotalAmount(),
      discountAmount: this.getTotalDiscountAmount(),
      taxAmount: this.getTotalTaxAmount(),
      packagingAndForwadingCharges: Number(formValue.packagingAndForwadingCharges || 0),
      totalAmount: this.getGrandTotal(),
      isBlack: Boolean(formValue.isBlack),
      products: formValue.products.map((product: ProductForm, index: number) => {
        const itemId = this.productsFormArray.at(index).get('id')?.value;
        const price = this.productsFormArray.at(index).get('price')?.value || 0; // Original subtotal
        const discountPercentage = Number(this.productsFormArray.at(index).get('discountPercentage')?.value || 0);
        const discountAmount = Number(this.productsFormArray.at(index).get('discountAmount')?.value || 0);
        const discountPrice = Number(this.productsFormArray.at(index).get('discountPrice')?.value || price);
        const taxAmount = this.productsFormArray.at(index).get('taxAmount')?.value || 0;
        const item: any = {
          productId: product.productId,
          quantity: product.quantity,
          batchNumber: product.batchNumber,
          unitPrice: product.unitPrice,
          price: price, // Original subtotal before discount
          discountPercentage: discountPercentage,
          discountAmount: discountAmount,
          taxPercentage: this.productsFormArray.at(index).get('taxPercentage')?.value,
          taxAmount: taxAmount,
          finalPrice: discountPrice + taxAmount, // Final price = discountPrice + tax
          remarks: product.remarks
        };
        // Include item id when updating
        if (this.isEdit && itemId) {
          item.id = itemId;
        }
        return item;
      })
    };
    
    // Include id only when updating
    if (this.isEdit && formValue.id) {
      data.id = formValue.id;
    }
    
    return data;
  }

  private markFormGroupTouched(formGroup: FormGroup | FormArray) {
    Object.values(formGroup.controls).forEach(control => {
      if (control instanceof FormGroup || control instanceof FormArray) {
        this.markFormGroupTouched(control);
      } else {
        control.markAsTouched();
        control.markAsDirty();
      }
    });
  }

  private calculateTotalAmount(): void {
    const controls = this.productsFormArray.controls;
    // Total amount is the sum of original subtotals (before discount); use Number() for disabled controls
    this.totalAmount = controls
      .reduce((sum, group: any) => sum + (Number(group.get('price')?.value) || 0), 0);
    this.totalDiscountAmount = controls
      .reduce((sum, group: any) => sum + (Number(group.get('discountAmount')?.value) || 0), 0);
    this.totalTaxAmount = controls
      .reduce((sum, group: any) => sum + (Number(group.get('taxAmount')?.value) || 0), 0);
    const packagingCharges = Number(this.saleForm.get('packagingAndForwadingCharges')?.value || 0);
    const totalFinalPrice = this.getTotalFinalPrice();
    this.grandTotal = totalFinalPrice + packagingCharges;

    this.saleSummary = {
      totalProducts: controls.length,
      totalAmount: this.totalAmount,
      totalDiscountAmount: this.totalDiscountAmount,
      totalTaxAmount: this.totalTaxAmount,
      totalFinalPrice,
      grandTotal: this.grandTotal
    };

    this.cdr.markForCheck();
  }

  private noDoubleQuotesValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      return control.value.includes('"') ? { doubleQuotes: true } : null;
    };
  }

  getFormattedPrice(index: number): string {
    const price = this.productsFormArray.at(index).get('price')?.value;
    return price ? price.toFixed(2) : '0.00';
  }

  getFormattedTaxAmount(index: number): string {
    const taxAmount = this.productsFormArray.at(index).get('taxAmount')?.value;
    return taxAmount ? taxAmount.toFixed(2) : '0.00';
  }

  getFormattedDiscountAmount(index: number): string {
    const discountAmount = this.productsFormArray.at(index).get('discountAmount')?.value;
    return discountAmount ? discountAmount.toFixed(2) : '0.00';
  }

  getFormattedDiscountPrice(index: number): string {
    const discountPrice = this.productsFormArray.at(index).get('discountPrice')?.value;
    const price = this.productsFormArray.at(index).get('price')?.value;
    return discountPrice ? discountPrice.toFixed(2) : (price ? price.toFixed(2) : '0.00');
  }

  private fetchSaleDetails(id: number): void {
    this.saleService.getSaleDetails(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          const raw = response?.data != null ? response.data : response;
          const data = raw?.sale != null ? raw.sale : raw;
          const hasId = data && (data.id != null || data.saleId != null);
          if (hasId) {
            this.isEdit = true;
            this.populateForm(data);
          }
          this.isLoadingSaleDetails = false;
          this.cdr.markForCheck();
          setTimeout(() => {
            this.viewport?.checkViewportSize();
            this.cdr.markForCheck();
          }, 0);

          
          setTimeout(() => {
            this.cdr.detectChanges();
            if (!this.viewport) return;
            this.viewport.checkViewportSize();
            requestAnimationFrame(() => {
              const el = this.viewport.elementRef.nativeElement as HTMLElement;
              const maxScroll = el.scrollHeight - el.clientHeight;
              el.scrollTop = Math.max(0, maxScroll);
              this.calculateTotalAmount();
              this.cdr.markForCheck();
              setTimeout(() => this.focusLastProductName(), 50);
            });
          }, 100);
        },
        error: (error: any) => {
          this.snackbar.error(error?.error?.message || 'Failed to load sale details');
          this.isLoadingSaleDetails = false;
          this.cdr.markForCheck();
          setTimeout(() => {
            this.viewport?.checkViewportSize();
            this.cdr.markForCheck();
          }, 0);
        }
      });
  }

  private populateForm(data: any): void {
    this.productSubscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    this.productSubscriptions = [];

    const saleId = data.id != null ? data.id : data.saleId;
    this.saleForm.patchValue({
      customerId: data.customerId != null ? data.customerId : data.customer_id,
      id: saleId,
      saleDate: formatDate(new Date(data.saleDate || data.sale_date || Date.now()), 'yyyy-MM-dd', 'en'),
      invoiceNumber: data.invoiceNumber ?? data.invoice_number ?? '',
      isBlack: data.isBlack != null ? data.isBlack : data.is_black || false,
      packagingAndForwadingCharges: data.packagingAndForwadingCharges != null ? data.packagingAndForwadingCharges : (data.packaging_and_forwading_charges ?? 0)
    });

    this.productsFormArray.clear();
    this.productControlsForView = [];

    const items = Array.isArray(data.items) ? data.items
      : Array.isArray(data.products) ? data.products
      : Array.isArray(data.saleItems) ? data.saleItems
      : Array.isArray(data.lineItems) ? data.lineItems
      : [];
    items.forEach((item: any) => {
      const productGroup = this.createProductFormGroup();
      const subscription = this.setupProductCalculations(productGroup);
      this.productSubscriptions.push(subscription);

      const discountPercentage = item.discountPercentage != null ? item.discountPercentage : (item.discount_percentage ?? 0);
      const discountAmount = item.discountAmount != null ? item.discountAmount : (item.discount_amount ?? 0);
      const discountType = discountPercentage > 0 ? 'percentage' : (discountAmount > 0 ? 'amount' : 'percentage');
      const price = item.price != null ? item.price : (item.unitPrice ?? item.unit_price ?? 0);
      const taxAmt = item.taxAmount != null ? item.taxAmount : (item.tax_amount ?? 0);
      const discountPriceVal = item.discountPrice != null ? item.discountPrice : (item.discount_price ?? (price - discountAmount));
      const taxPct = item.taxPercentage != null ? item.taxPercentage : (item.tax_percentage ?? 0);
      const productId = item.productId != null ? item.productId : item.product_id;
      const numProductId = productId != null ? Number(productId) : undefined;

      productGroup.patchValue({
        id: item.id,
        productId: numProductId != null ? numProductId : productId,
        quantity: item.quantity != null ? item.quantity : 1,
        unitPrice: item.unitPrice != null ? item.unitPrice : (item.unit_price ?? 0),
        price: price,
        discountType: discountType,
        discountPercentage: discountPercentage,
        discountAmount: discountAmount,
        discountPrice: discountPriceVal,
        taxPercentage: taxPct,
        taxAmount: taxAmt,
        batchNumber: item.batchNumber != null ? item.batchNumber : (item.batch_number ?? ''),
        remarks: item.remarks != null ? item.remarks : (item.remarks ?? '')
      }, { emitEvent: false });
      this.productsFormArray.push(productGroup);
    });
    this.productControlsForView = Array.from(this.productsFormArray.controls);

    this.isEdit = true;
    this.calculateTotalAmount();
    this.cdr.markForCheck();
    // Sync virtual viewport after form is populated so rows render correctly
    setTimeout(() => {
      this.viewport?.checkViewportSize();
      this.cdr.markForCheck();
    }, 0);
    setTimeout(() => {
      this.viewport?.checkViewportSize();
      this.cdr.markForCheck();
    }, 100);
    // Sync first row display after view is ready (fixes first row product name/quantity/rate not showing)
    if (items.length > 0) {
      requestAnimationFrame(() => {
        const firstGroup = this.productsFormArray.at(0);
        if (firstGroup) {
          firstGroup.updateValueAndValidity({ emitEvent: false });
          this.cdr.markForCheck();
        }
      });
    }
  }

  // --- Batch Number Autocomplete Methods ---

  getAvailableBatchNumbersForProduct(productId: any): string[] {
    if (!productId) return [];

    const apiBatches = this.apiBatchNumbersMap.get(productId) || [];
    const batchSet = new Set<string>(apiBatches);
    
    this.productsFormArray.controls.forEach(control => {
      const pId = control.get('productId')?.value;
      const bNumber = control.get('batchNumber')?.value;
      if (pId === productId && bNumber) {
        batchSet.add(bNumber);
      }
    });
    
    return Array.from(batchSet);
  }

  onBatchFocus(index: number): void {
    this.onLineFieldFocus(index, 'batchNumber');
    if (this.batchDropdownCloseTimeout) {
      clearTimeout(this.batchDropdownCloseTimeout);
    }
    this.activeBatchDropdownIndex = index;
    const group = this.productsFormArray.at(index);
    const productId = group.get('productId')?.value;
    const currentBatch = group.get('batchNumber')?.value || '';
    
    const allBatches = this.getAvailableBatchNumbersForProduct(productId);
    this.filteredBatchNumbers = allBatches.filter(b => b.toLowerCase().includes(currentBatch.toLowerCase()));
    this.cdr.markForCheck();
  }

  onBatchInput(index: number, event: any): void {
    this.onLineFieldInput(index, 'batchNumber');
    const value = event.target.value || '';
    const group = this.productsFormArray.at(index);
    const productId = group.get('productId')?.value;
    
    const allBatches = this.getAvailableBatchNumbersForProduct(productId);
    this.filteredBatchNumbers = allBatches.filter(b => b.toLowerCase().includes(value.toLowerCase()));
    
    // Make sure dropdown stays open as we type
    this.activeBatchDropdownIndex = index;
    this.cdr.markForCheck();
  }

  onBatchBlur(index: number): void {
    this.onLineFieldBlur(index, 'batchNumber');
    this.batchDropdownCloseTimeout = setTimeout(() => {
      if (this.activeBatchDropdownIndex === index) {
        this.activeBatchDropdownIndex = null;
        this.cdr.markForCheck();
      }
    }, 150); // slight delay to allow mousedown on option to register
  }

  selectBatch(index: number, batch: string): void {
    const group = this.productsFormArray.at(index);
    group.patchValue({ batchNumber: batch });
    group.get('batchNumber')?.markAsDirty();
    this.activeBatchDropdownIndex = null;
    this.cdr.markForCheck();
  }
  // -----------------------------------------

}

