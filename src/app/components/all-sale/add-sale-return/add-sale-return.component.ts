import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, ViewChildren, QueryList, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, Validators, ReactiveFormsModule, ValidatorFn, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { formatDate } from '@angular/common';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

import { SaleService } from '../../../services/sale.service';
import { ProductService } from '../../../services/product.service';
import { CustomerService } from '../../../services/customer.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SaleProductSelectComponent } from '../shared/sale-product-select/sale-product-select.component';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { ProductBatchStockService } from '../../../services/product-batch-stock.service';
import { toProductOptionsList } from '../../../shared/utils/product-display.util';
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
import { focusProductNameSelect, focusQuantityInput } from '../../../shared/utils/product-line-focus.util';

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
  remarks: string;
}

@Component({
  selector: 'app-add-sale-return',
  templateUrl: './add-sale-return.component.html',
  styleUrls: ['./add-sale-return.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddSaleReturnComponent implements OnInit, OnDestroy {
  returnForm!: FormGroup;
  products: any[] = [];
  customers: any[] = [];
  loading = false;
  isLoadingProducts = false;
  isLoadingCustomers = false;
  isEdit = false;
  saleReturnId: number | null = null;
  private destroy$ = new Subject<void>();
  private productSubscriptions: Subscription[] = [];
  
  private productMap: Map<any, any> = new Map();
  private productCodeMap: Map<string, any> = new Map();
  private productMapReady = false;
  private readonly PRODUCT_MAP_SYNC_THRESHOLD = 1000;

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

  // Batch numbers fetched per-product from API
  apiBatchNumbersMap: Map<number, string[]> = new Map();
  
  // Active dropdown state
  activeBatchDropdownIndex: number | null = null;
  filteredBatchNumbers: string[] = [];
  batchDropdownCloseTimeout: any;

  @ViewChild(CdkVirtualScrollViewport) viewport!: CdkVirtualScrollViewport;
  @ViewChild('productsSection') productsSectionRef!: ElementRef<HTMLElement>;
  @ViewChildren(SaleProductSelectComponent) searchableSelects!: QueryList<SaleProductSelectComponent>;

  productControlsForView: AbstractControl[] = [];

  private readonly VIRTUAL_SCROLL_ITEM_SIZE_PX = 52;

  getViewportHeight(): number {
    const rowHeight = this.VIRTUAL_SCROLL_ITEM_SIZE_PX;
    const maxHeight = 750;
    const count = this.productControlsForView.length;
    if (count === 0) return rowHeight;
    return Math.min(count * rowHeight, maxHeight);
  }

  trackByProductControl(index: number, control: AbstractControl): AbstractControl {
    return control;
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.altKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      this.addProduct();
    }
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

  // Memory optimization: cached totals to avoid recalculating in template
  totalAmount: number = 0;
  totalDiscountAmount: number = 0;
  totalTaxAmount: number = 0;
  grandTotal: number = 0;

  get productsFormArray() {
    return this.returnForm.get('products') as FormArray;
  }

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private saleService: SaleService,
    private productService: ProductService,
    private customerService: CustomerService,
    private snackbar: SnackbarService,
    private encryptionService: EncryptionService,
    private productBatchStockService: ProductBatchStockService,
    private cdr: ChangeDetectorRef
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    // Check if we're in edit mode (route has encrypted ID)
    const encryptedId = this.route.snapshot.paramMap.get('id');
    if (encryptedId) {
      const decryptedId = this.encryptionService.decrypt(encryptedId);
      if (decryptedId) {
        const id = Number(decryptedId);
        if (!isNaN(id)) {
          this.saleReturnId = id;
          this.isEdit = true;
        }
      }
    }
    
    // Load customers
    this.loadCustomers();
    
    // Load products and fetch details after products are loaded (if in edit mode)
    this.isLoadingProducts = true;
    this.productService.getProducts({ status: 'A' }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        if (response?.success && response.data) {
          this.queueOrApplyProductsList(toProductOptionsList(response.data));
          // Fetch sale return details after products are loaded (if in edit mode)
          if (this.isEdit && this.saleReturnId) {
            this.fetchSaleReturnDetails(this.saleReturnId);
          }
        }
        this.isLoadingProducts = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.snackbar.error('Failed to load products');
        this.isLoadingProducts = false;
        this.cdr.markForCheck();
      }
    });
    
    // Listen to packaging charges changes to update display
    this.returnForm.get('packagingAndForwadingCharges')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(150)
      )
      .subscribe(() => {
        this.calculateTotalAmount();
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
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

    // Clear arrays to release memory
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
    if (this.returnForm) {
      this.returnForm.reset();
    }
  }

  private initForm(): void {
    this.returnForm = this.fb.group({
      id: [null],
      customerId: ['', Validators.required],
      saleReturnDate: [formatDate(new Date(), 'yyyy-MM-dd', 'en'), Validators.required],
      invoiceNumber: [''],
      isDiscount: [false],
      products: this.fb.array([]),
      packagingAndForwadingCharges: [0, [Validators.required, Validators.min(0)]]
    });

    // Add initial product form group only if not in edit mode
    if (!this.isEdit) {
      this.addProduct();
      this.productControlsForView = Array.from(this.productsFormArray.controls);
    }
  }

  private createProductFormGroup(): FormGroup {
    return this.fb.group({
      id: [null], // Item ID for updates
      productId: ['', Validators.required],
      quantity: ['', [Validators.required, Validators.min(1)]],
      batchNumber: ['', [this.noDoubleQuotesValidator()]],
      unitPrice: ['', [Validators.required, Validators.min(0.01)]],
      price: [{ value: 0, disabled: true }],
      discountType: ['percentage'],
      discountPercentage: [0, [Validators.min(0), Validators.max(100)]],
      discountAmount: [0, [Validators.min(0)]],
      discountPrice: [{ value: 0, disabled: true }],
      taxPercentage: [{ value: 0, disabled: true }],
      taxAmount: [{ value: 0, disabled: true }],
      remarks: [null, []]
    });
  }

  addProduct(options?: { skipProductFocus?: boolean }): void {
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
    const lastIndex = this.productsFormArray.length - 1;
    setTimeout(() => {
      this.cdr.detectChanges();
      if (!this.viewport) return;
      this.viewport.checkViewportSize();
      requestAnimationFrame(() => {
        this.viewport.scrollToIndex(lastIndex, 'auto');
        this.calculateTotalAmount();
        this.cdr.markForCheck();
        if (!options?.skipProductFocus) {
          setTimeout(() => this.focusLastProductName(), 50);
        }
      });
    }, 100);
  }

  private focusLastProductName(): void {
    const rowIndex = this.productsFormArray.length - 1;
    if (rowIndex < 0) {
      return;
    }

    focusProductNameSelect(
      rowIndex,
      this.viewport?.elementRef.nativeElement,
      this.viewport,
      (idx) => {
        this.cdr.detectChanges();
        const container = this.viewport?.elementRef.nativeElement;
        const row = container?.querySelector(`[data-product-row-index="${idx}"]`);
        if (!row) {
          return false;
        }

        for (const select of this.searchableSelects?.toArray() ?? []) {
          if (row.contains(select.hostElement)) {
            select.focusAndOpen();
            return true;
          }
        }
        return false;
      }
    );
  }

  onRemarksKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Tab' && index === this.productControlsForView.length - 1) {
      event.preventDefault();
      this.addProduct();
    }
  }

  removeProduct(index: number): void {
    if (this.productsFormArray.length <= 1) return;
    if (index < 0 || index >= this.productsFormArray.length) return;
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

    // Listen to product selection to get tax percentage
    const productIdSubscription = group.get('productId')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged()
      )
      .subscribe((productId) => {
        if (productId) {
          const selectedProduct = this.getProductByValue(productId);
          if (selectedProduct) {
            const taxPercentage = selectedProduct.taxPercentage || 0;
            group.patchValue({ taxPercentage }, { emitEvent: false });
            this.calculateProductPrice(group);

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

    this.calculateTotalAmount();
    this.cdr.markForCheck();
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

  getGrandTotal(): number {
    // totalAmount = sum of all items' finalPrice + packagingAndForwadingCharges
    const packagingCharges = Number(this.returnForm.get('packagingAndForwadingCharges')?.value || 0);
    return this.getTotalFinalPrice() + packagingCharges;
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

  getFormattedDiscountAmount(index: number): string {
    const discountAmount = this.productsFormArray.at(index).get('discountAmount')?.value;
    return discountAmount ? discountAmount.toFixed(2) : '0.00';
  }

  getFormattedDiscountPrice(index: number): string {
    const discountPrice = this.productsFormArray.at(index).get('discountPrice')?.value;
    const price = this.productsFormArray.at(index).get('price')?.value;
    return discountPrice ? discountPrice.toFixed(2) : (price ? price.toFixed(2) : '0.00');
  }

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
    this.productService.refreshProducts().pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        if (response?.success) {
          this.queueOrApplyProductsList(toProductOptionsList(response.data), true);
        }
        this.isLoadingProducts = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.snackbar.error('Failed to refresh products');
        this.isLoadingProducts = false;
        this.cdr.markForCheck();
      }
    });
  }

  private loadCustomers(): void {
    this.isLoadingCustomers = true;
    this.customerService.getCustomers({ status: 'A' }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        if (response?.success) {
          this.customers = response.data;
        }
        this.isLoadingCustomers = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.snackbar.error('Failed to load customers');
        this.isLoadingCustomers = false;
        this.cdr.markForCheck();
      }
    });
  }

  refreshCustomers(): void {
    this.isLoadingCustomers = true;
    this.customerService.refreshCustomers().pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        if (response?.success) {
          this.customers = response.data;
          this.snackbar.success('Customers refreshed successfully');
        }
        this.isLoadingCustomers = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.snackbar.error('Failed to load customers');
        this.isLoadingCustomers = false;
        this.cdr.markForCheck();
      }
    });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.returnForm.get(fieldName);
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

  resetForm(): void {
    this.initForm();
  }

  onSubmit(): void {
    this.markFormGroupTouched(this.returnForm);
    
    if (this.returnForm.valid) {
      this.loading = true;
      const formData = this.prepareFormData();
      
      const serviceCall = this.isEdit 
        ? this.saleService.createSaleReturn(formData) // Update uses same endpoint with id
        : this.saleService.createSaleReturn(formData);
      
      serviceCall.pipe(takeUntil(this.destroy$)).subscribe({
        next: (response: any) => {
          if (response?.success) {
            this.snackbar.success(response.message || `Sale return ${this.isEdit ? 'updated' : 'created'} successfully`);
            this.router.navigate(['/sale/return']);
          } else {
            this.snackbar.error(response?.message || `Failed to ${this.isEdit ? 'update' : 'create'} sale return`);
          }
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (error: any) => {
          const message = error?.error?.message || `Failed to ${this.isEdit ? 'update' : 'create'} sale return`;
          this.snackbar.error(message);
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

  private prepareFormData(): any {
    const formValue = this.returnForm.value;
    const data: any = {
      saleReturnDate: formatDate(formValue.saleReturnDate, 'dd-MM-yyyy', 'en'),
      customerId: formValue.customerId,
      invoiceNumber: formValue.invoiceNumber,
      isDiscount: !!formValue.isDiscount,
      price: this.getTotalAmount(),
      discountAmount: this.getTotalDiscountAmount(),
      taxAmount: this.getTotalTaxAmount(),
      packagingAndForwadingCharges: Number(formValue.packagingAndForwadingCharges || 0),
      totalAmount: this.getGrandTotal(),
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

  private markFormGroupTouched(formGroup: FormGroup | FormArray): void {
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
    // Memory optimization: calculate once and cache in properties
    // Total amount is the sum of original subtotals (before discount)
    this.totalAmount = this.productsFormArray.controls
      .reduce((sum, group: any) => sum + (group.get('price').value || 0), 0);
    
    // Total discount amount
    this.totalDiscountAmount = this.productsFormArray.controls
      .reduce((sum, group: any) => sum + (Number(group.get('discountAmount')?.value || 0)), 0);
    
    // Total tax amount (calculated on discounted prices)
    this.totalTaxAmount = this.productsFormArray.controls
      .reduce((sum, group: any) => sum + (group.get('taxAmount').value || 0), 0);
      
    const packagingCharges = Number(this.returnForm.get('packagingAndForwadingCharges')?.value || 0);
    // Grand total = sum of (discountPrice + taxAmount) for all items + packaging charges
    this.grandTotal = this.getTotalFinalPrice() + packagingCharges;

    this.returnForm.patchValue({ 
      price: this.totalAmount,
      taxAmount: this.totalTaxAmount
    }, { emitEvent: false });
    
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

  private fetchSaleReturnDetails(id: number): void {
    this.loading = true;
    this.saleService.getSaleReturnDetail(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        if (response && response.id) {
          this.populateForm(response);
        } else {
          this.snackbar.error('Failed to load sale return details');
        }
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (error: any) => {
        this.snackbar.error(error?.error?.message || 'Failed to load sale return details');
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  private populateForm(data: any): void {
    // Clear existing products
    this.productsFormArray.clear();
    this.productSubscriptions.forEach(sub => sub?.unsubscribe());
    this.productSubscriptions = [];

    // Populate form with sale return data
    const isDiscount = data?.isDiscount ?? data?.is_discount ?? false;
    this.returnForm.patchValue({
      id: data.id,
      customerId: data.customerId,
      saleReturnDate: formatDate(new Date(data.saleReturnDate), 'yyyy-MM-dd', 'en'),
      invoiceNumber: data.invoiceNumber,
      isDiscount,
      packagingAndForwadingCharges: data.packagingAndForwadingCharges || 0
    });

    // Populate products
    if (data.items && data.items.length > 0) {
      data.items.forEach((item: any) => {
        const productGroup = this.createProductFormGroup();
        const subscription = this.setupProductCalculations(productGroup);
        this.productSubscriptions.push(subscription);
        
        // Determine discount type based on which field has a value
        const discountPercentage = item.discountPercentage || 0;
        const discountAmount = item.discountAmount || 0;
        const discountType = discountPercentage > 0 ? 'percentage' : (discountAmount > 0 ? 'amount' : 'percentage');
        
        productGroup.patchValue({
          id: item.id, // Store item ID for updates
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          price: item.price || 0, // Original subtotal
          discountType: discountType,
          discountPercentage: discountPercentage,
          discountAmount: discountAmount,
          discountPrice: item.discountPrice || (item.price || 0) - (discountAmount || 0),
          taxPercentage: item.taxPercentage || 0,
          taxAmount: item.taxAmount || 0,
          batchNumber: item.batchNumber || '',
          remarks: item.remarks || ''
        }, { emitEvent: false });

        this.productsFormArray.push(productGroup);
      });
      this.productControlsForView = Array.from(this.productsFormArray.controls);
    } else {
      // If no items, add one empty product
      this.addProduct();
    }
    this.cdr.markForCheck();
    setTimeout(() => {
      this.viewport?.checkViewportSize();
      this.cdr.markForCheck();
    }, 0);
  }
}

