import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, ViewChildren, QueryList, HostListener } from '@angular/core';
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
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { ProductBatchStockService } from '../../../services/product-batch-stock.service';

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

  @ViewChild(CdkVirtualScrollViewport) viewport!: CdkVirtualScrollViewport;
  @ViewChildren(SearchableSelectComponent) searchableSelects!: QueryList<SearchableSelectComponent>;

  get productsFormArray() {
    return this.saleForm.get('products') as FormArray;
  }

  /** New array reference on each add/remove so cdkVirtualFor detects changes (it ignores mutable push). */
  productControlsForView: AbstractControl[] = [];

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
    this.productMapReady = false;

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
    const subscription = this.setupProductCalculations(productGroup);
    this.productSubscriptions.push(subscription);
    this.productsFormArray.push(productGroup);
    this.productControlsForView = Array.from(this.productsFormArray.controls);
    if (prevProductId) {
      productGroup.get('productId')?.setValue(prevProductId, { emitEvent: true });
    }
    this.calculateTotalAmount();
    this.cdr.markForCheck();
    const newIndex = this.productsFormArray.length - 1;
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

  /** Focus the product name (first column) of the last row. First searchable is customer; rest are product selects. */
  private focusLastProductName(): void {
    this.cdr.detectChanges();
    const selects = this.searchableSelects?.toArray() ?? [];
    if (selects.length < 2) return;
    const lastProductSelect = selects[selects.length - 1];
    lastProductSelect.focus();
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

}

