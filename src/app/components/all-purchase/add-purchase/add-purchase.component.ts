import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, ViewChildren, QueryList, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, ValidatorFn, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { formatDate } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

import { ProductService } from '../../../services/product.service';
import { PurchaseService } from '../../../services/purchase.service';
import { CustomerService } from '../../../services/customer.service';
import { ProductBatchStockService } from '../../../services/product-batch-stock.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { EncryptionService } from '../../../shared/services/encryption.service';

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
  selector: 'app-add-purchase',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    ScrollingModule,
    LoaderComponent,
    SearchableSelectComponent
  ],
  templateUrl: './add-purchase.component.html',
  styleUrls: ['./add-purchase.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddPurchaseComponent implements OnInit, OnDestroy {
  purchaseForm!: FormGroup;
  products: any[] = [];
  customers: any[] = [];
  loading = false;
  isLoadingProducts = false;
  isLoadingCustomers = false;
  isEdit = false;
  private destroy$ = new Subject<void>();
  private productSubscriptions: Subscription[] = [];

  // Memory optimization: cached totals to avoid recalculating in template
  totalAmount: number = 0;
  totalDiscountAmount: number = 0;
  totalTaxAmount: number = 0;
  totalAfterDiscountAndTax: number = 0;
  grandTotal: number = 0;

  // Memory optimization: Map for O(1) product lookups instead of O(n) find()
  private productMap: Map<any, any> = new Map();
  /** True when productMap is fully built (sync or chunked build finished). */
  private productMapReady = false;
  /** Build map synchronously when products <= this; otherwise build in chunks to avoid UI hang. */
  private readonly PRODUCT_MAP_SYNC_THRESHOLD = 1000;

  // Batch numbers mapping by productId fetched from API
  private apiBatchNumbersMap: Map<any, string[]> = new Map();

  // Active dropdown state
  activeBatchDropdownIndex: number | null = null;
  filteredBatchNumbers: string[] = [];
  private batchDropdownCloseTimeout: any;

  @ViewChild(CdkVirtualScrollViewport) viewport!: CdkVirtualScrollViewport;
  @ViewChildren(SearchableSelectComponent) searchableSelects!: QueryList<SearchableSelectComponent>;

  get productsFormArray() {
    return this.purchaseForm.get('products') as FormArray;
  }

  /** New array reference on each add/remove so cdkVirtualFor detects changes. */
  productControlsForView: AbstractControl[] = [];

  trackByProductControl(index: number, control: AbstractControl): number {
    return index;
  }

  /** Row height in px; must match template itemSize. */
  private readonly VIRTUAL_SCROLL_ITEM_SIZE_PX = 52;

  /** Viewport height: grows with items up to a cap. */
  getViewportHeight(): number {
    const rowHeight = this.VIRTUAL_SCROLL_ITEM_SIZE_PX;
    const maxHeight = 750;
    const count = this.productControlsForView.length;
    if (count === 0) return rowHeight;
    return Math.min(count * rowHeight, maxHeight);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.altKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      this.addProduct();
    }
  }

  constructor(
    private fb: FormBuilder,
    private productService: ProductService,
    private customerService: CustomerService,
    private purchaseService: PurchaseService,
    private productBatchStockService: ProductBatchStockService,
    private snackbar: SnackbarService,
    private http: HttpClient,
    private router: Router,
    private encryptionService: EncryptionService,
    private cdr: ChangeDetectorRef
  ) {
    this.initForm();
  }

  ngOnInit() {
    this.loadProducts();
    this.loadCustomers();

    const encryptedId = localStorage.getItem('purchaseId');
    if (encryptedId) {
      const purchaseId = this.encryptionService.decrypt(encryptedId);
      if (purchaseId) {
        this.fetchPurchaseDetails(Number(purchaseId));
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

    // Clear arrays and maps to release memory
    this.products = [];
    this.customers = [];
    this.productMap.clear();
    this.productMapReady = false;

    // Reset form to release form subscriptions
    if (this.purchaseForm) {
      this.purchaseForm.reset();
    }
  }

  private initForm() {
    this.purchaseForm = this.fb.group({
      id: [null],
      customerId: ['', Validators.required],
      purchaseDate: [formatDate(new Date(), 'yyyy-MM-dd', 'en'), Validators.required],
      invoiceNumber: ['', Validators.required],
      packagingAndForwadingCharges: [0, [Validators.required, Validators.min(0)]],
      products: this.fb.array([])
    });

    // Listen to packaging charges changes to update grandTotal
    this.purchaseForm.get('packagingAndForwadingCharges')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(150)
      )
      .subscribe(() => {
        const packagingCharges = Number(this.purchaseForm.get('packagingAndForwadingCharges')?.value || 0);
        // this.grandTotal = this.totalAmount + this.totalTaxAmount + packagingCharges;
        this.cdr.markForCheck();
      });

    // Debounced total recalculation for large forms (2000+ items) to avoid UI hang
    this.productsFormArray.valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(200))
      .subscribe(() => this.calculateTotalAmount());

    // Add initial product form group
    this.addProduct();
    this.productControlsForView = Array.from(this.productsFormArray.controls);
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

  addProduct(): void {
    const productGroup = this.createProductFormGroup();
    const prevProductId = this.productsFormArray.length > 0
      ? this.productsFormArray.at(this.productsFormArray.length - 1).get('productId')?.value
      : '';
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

    // If previous row has a valid product, default unitPrice/tax from productMap (predefined rate)
    if (prevProductId) {
      const selectedProduct = this.getProductByValue(prevProductId);
      if (selectedProduct) {
        const taxPercentage = selectedProduct.taxPercentage || 0;
        const unitPrice = selectedProduct.purchaseAmount || 0;
        productGroup.patchValue({ productId: prevProductId, taxPercentage, unitPrice }, { emitEvent: false });
        this.calculateProductPrice(productGroup);
      }
    }

    const subscription = this.setupProductCalculations(productGroup);
    this.productSubscriptions.push(subscription);
    this.productsFormArray.push(productGroup);
    this.productControlsForView = Array.from(this.productsFormArray.controls);
    // Ensure productId valueChanges triggers downstream calculations when defaulting
    if (prevProductId) {
      productGroup.get('productId')?.setValue(prevProductId, { emitEvent: true });
    }
    this.calculateTotalAmount();
    this.cdr.markForCheck();
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
  }

  private focusLastProductName(): void {
    this.cdr.detectChanges();
    const selects = this.searchableSelects?.toArray() ?? [];
    if (selects.length < 2) return;
    const lastProductSelect = selects[selects.length - 1];
    lastProductSelect.focus();
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

    // Listen to product selection to get tax percentage and purchaseAmount
    const productIdSubscription = group.get('productId')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged() // Only trigger when productId actually changes
      )
      .subscribe((productId) => {
        if (productId) {
          const selectedProduct = this.getProductByValue(productId);
          if (selectedProduct) {
            const taxPercentage = selectedProduct.taxPercentage || 0;
            const unitPrice = selectedProduct.purchaseAmount || 0;
            group.patchValue({ taxPercentage, unitPrice }, { emitEvent: false });
            this.calculateProductPrice(group);

            // Fetch available batch names if not cached
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

    // Listen to quantity and unitPrice changes with debouncing
    const valueSubscription = group.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(150) // Batch rapid changes to reduce calculation overhead
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

    // Total recalculated via productsFormArray.valueChanges debounce (avoids hang with 2000+ rows)
  }

  // --- Batch Number Autocomplete Methods ---

  getAvailableBatchNumbersForProduct(productId: any): string[] {
    if (!productId) return [];

    // 1. Get from API cache
    const apiBatches = this.apiBatchNumbersMap.get(productId) || [];
    const batchSet = new Set<string>(apiBatches);

    // 2. Add any batches currently typed in other rows for this same product
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

  getTotalAmount(): number {
    return this.productsFormArray.controls
      .reduce((total, group: any) => total + (group.get('price').value || 0), 0);
  }

  getTotalTaxAmount(): number {
    return this.productsFormArray.controls
      .reduce((total, group: any) => total + (group.get('taxAmount').value || 0), 0);
  }

  getGrandTotal(): number {
    const packagingCharges = Number(this.purchaseForm.get('packagingAndForwadingCharges')?.value || 0);
    return this.getTotalFinalPrice() + packagingCharges;
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

  private transformProductsWithDisplayName(products: any[]): any[] {
    return products.map(product => ({
      ...product,
      displayName: product.materialName
        ? `${product.name} (${product.materialName})`
        : product.name
    }));
  }

  private loadProducts(): void {
    this.isLoadingProducts = true;
    this.productService.getProducts({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.products = this.transformProductsWithDisplayName(response.data);
            if (this.products.length === 0) {
              this.productMap.clear();
              this.productMapReady = true;
            } else if (this.products.length <= this.PRODUCT_MAP_SYNC_THRESHOLD) {
              this.buildProductMap();
            } else {
              this.scheduleChunkedProductMapBuild();
            }
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

  refreshProducts(): void {
    this.isLoadingProducts = true;
    this.productService.refreshProducts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.products = this.transformProductsWithDisplayName(response.data);
            if (this.products.length === 0) {
              this.productMap.clear();
              this.productMapReady = true;
            } else if (this.products.length <= this.PRODUCT_MAP_SYNC_THRESHOLD) {
              this.buildProductMap();
            } else {
              this.scheduleChunkedProductMapBuild();
            }
            this.snackbar.success('Products refreshed successfully');
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
    const field = this.purchaseForm.get(fieldName);
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
    this.purchaseForm.patchValue({ id: null });
    this.initForm();
  }

  onSubmit() {
    this.markFormGroupTouched(this.purchaseForm);

    if (this.purchaseForm.valid) {
      this.loading = true;
      const formData = this.preparePurchaseData();

      const serviceCall = this.isEdit
        ? this.purchaseService.updatePurchase(formData)
        : this.purchaseService.createPurchase(formData);

      serviceCall
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response: any) => {
            if (response?.success) {
              this.snackbar.success(`Purchase ${this.isEdit ? 'updated' : 'created'} successfully`);
              localStorage.removeItem('purchaseId');
              this.router.navigate(['/purchase']);
            }
            this.loading = false;
          },
          error: (error) => {
            this.snackbar.error(error?.error?.message || `Failed to ${this.isEdit ? 'update' : 'create'} purchase`);
            this.loading = false;
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

  private preparePurchaseData() {
    const formValue = this.purchaseForm.value;
    const data: any = {
      purchaseDate: formatDate(formValue.purchaseDate, 'dd-MM-yyyy', 'en'),
      customerId: formValue.customerId,
      invoiceNumber: formValue.invoiceNumber,
      price: this.getTotalAmount(),
      discountAmount: this.getTotalDiscountAmount(),
      taxAmount: this.getTotalTaxAmount(),
      packagingAndForwadingCharges: Number(formValue.packagingAndForwadingCharges || 0),
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

    const packagingCharges = Number(this.purchaseForm.get('packagingAndForwadingCharges')?.value || 0);
    // Total after discount & tax = sum of (discountPrice + taxAmount) for all items
    this.totalAfterDiscountAndTax = this.productsFormArray.controls
      .reduce((total, group: any) => {
        const discountPrice = Number(group.get('discountPrice')?.value || group.get('price')?.value || 0);
        const taxAmount = Number(group.get('taxAmount')?.value || 0);
        return total + (discountPrice + taxAmount);
      }, 0);

    // Grand total = total after discount & tax + packaging charges
    this.grandTotal = this.totalAfterDiscountAndTax + packagingCharges;

    this.purchaseForm.patchValue({
      price: this.totalAmount,
      taxAmount: this.totalTaxAmount
    }, { emitEvent: false });

    // Trigger change detection for OnPush
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

  private fetchPurchaseDetails(id: number): void {
    this.purchaseService.getPurchaseDetails(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          if (response.id) {
            this.isEdit = true;
            this.populateForm(response);
          }
        },
        error: (error: any) => {
          this.snackbar.error(error?.error?.message || 'Failed to load purchase details');
        }
      });
  }

  private populateForm(data: any): void {
    // Clear existing subscriptions before repopulating
    this.productSubscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    this.productSubscriptions = [];

    this.purchaseForm.patchValue({
      customerId: data.customerId,
      id: data.id,
      purchaseDate: formatDate(new Date(data.purchaseDate), 'yyyy-MM-dd', 'en'),
      invoiceNumber: data.invoiceNumber,
      packagingAndForwadingCharges: data.packagingAndForwadingCharges || 0,
    });

    // Clear existing products
    this.productsFormArray.clear();

    // Populate products
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

    // Calculate totals after populating form from API
    this.calculateTotalAmount();
    this.productControlsForView = Array.from(this.productsFormArray.controls);
    this.cdr.markForCheck();
    this.isEdit = true;

    setTimeout(() => {
      this.viewport?.checkViewportSize();
      this.cdr.markForCheck();
    }, 0);
  }

}
