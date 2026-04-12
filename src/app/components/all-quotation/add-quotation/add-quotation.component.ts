import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild, ViewChildren, QueryList, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, FormControl, AbstractControl, ValidatorFn, ValidationErrors, FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil, Subscription, finalize, debounceTime, filter, distinctUntilChanged } from 'rxjs';
import { formatDate } from '@angular/common';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { ProductService } from '../../../services/product.service';
import { CustomerService } from '../../../services/customer.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { QuotationService } from '../../../services/quotation.service';
import { PriceService } from '../../../services/price.service';
import { SearchableSelectComponent } from "../../../shared/components/searchable-select/searchable-select.component";
import { MatDialogModule } from '@angular/material/dialog';

import { LoaderComponent } from '../../../shared/components/loader/loader.component';

import { TransportMaster, TransportMasterService } from '../../../services/transport-master.service';
import { QuotationItemStatus } from '../../../models/quotation.model copy';
import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

@Component({
  standalone: true,
  selector: 'app-add-quotation',
  templateUrl: './add-quotation.component.html',
  styleUrl: './add-quotation.component.scss',
  imports: [SearchableSelectComponent,
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule, MatDialogModule, LoaderComponent, ScrollingModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddQuotationComponent implements OnInit, OnDestroy {
  quotationForm!: FormGroup;
  createQuotationForm!: FormGroup;
  products: any[] = [];
  customers: any[] = [];
  transports: TransportMaster[] = [];
  loading = false;
  isLoadingProducts = false;
  isLoadingCustomers = false;
  isLoadingTransports = false;
  minValidUntilDate: string;
  private destroy$ = new Subject<void>();
  isLoading = false;
  isEdit = false;
  quotationId?: number;
  selectedProduct!: string
  totals: { price: number; tax: number; finalPrice: number; taxPercentage: number; afterQuotationDiscount: number; quotationDiscountAmount: number; lineDiscountAmount: number; afterDiscountPrice: number } = {
    price: 0,
    tax: 0,
    finalPrice: 0,
    taxPercentage: 0,
    afterQuotationDiscount: 0,
    quotationDiscountAmount: 0,
    lineDiscountAmount: 0,
    afterDiscountPrice: 0
  };
  private itemSubscriptions: Subscription[] = [];
  private productPriceCache: Map<string, number> = new Map();
  // Memory optimization: Map for O(1) product lookups
  private productMap: Map<any, any> = new Map();
  /** True when productMap is fully built (sync or chunked build finished). */
  private productMapReady = false;
  /** Build map synchronously when products <= this; otherwise build in chunks to avoid UI hang (e.g. 50k+ products). */
  private readonly PRODUCT_MAP_SYNC_THRESHOLD = 1000;
  isLoadingPrices: { [key: number]: boolean } = {};

  @ViewChild(CdkVirtualScrollViewport) viewport!: CdkVirtualScrollViewport;
  @ViewChildren(SearchableSelectComponent) searchableSelects!: QueryList<SearchableSelectComponent>;

  get itemsFormArray() {
    return this.quotationForm.get('items') as FormArray;
  }

  /** New array reference on each add/remove so cdkVirtualFor detects changes; keeps DOM to visible rows only (10k+ items). */
  itemControlsForView: AbstractControl[] = [];

  trackByItemIndex(index: number, item: any): any {
    return item;
  }

  trackByItemControl(index: number, control: AbstractControl): AbstractControl {
    return control;
  }

  /** Row height in px; must match template itemSize. */
  private readonly VIRTUAL_SCROLL_ITEM_SIZE_PX = 52;

  getViewportHeight(): number {
    const rowHeight = this.VIRTUAL_SCROLL_ITEM_SIZE_PX;
    const maxHeight = 750;
    const count = this.itemControlsForView.length;
    if (count === 0) return rowHeight;
    return Math.min(count * rowHeight, maxHeight);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.altKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      this.addItem();
    }
  }

  onRemarksKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Tab' && index === this.itemControlsForView.length - 1) {
      event.preventDefault();
      this.addItem();
    }
  }

  private focusLastProductName(): void {
    this.cdr.detectChanges();
    const selects = this.searchableSelects?.toArray() ?? [];
    if (selects.length === 0) return;
    const lastProductSelect = selects[selects.length - 1];
    lastProductSelect.focus();
  }

  constructor(
    private fb: FormBuilder,
    private quotationService: QuotationService,
    private productService: ProductService,
    private customerService: CustomerService,
    private transportService: TransportMasterService,
    private priceService: PriceService,
    private snackbar: SnackbarService,
    private encryptionService: EncryptionService,
    private router: Router,
    private dialog: Dialog,
    private cdr: ChangeDetectorRef
  ) {
    const today = new Date();
    this.minValidUntilDate = formatDate(today, 'yyyy-MM-dd', 'en');
    this.initForm();
  }

  ngOnInit() {
    this.loadProducts();
    this.loadCustomers();
    this.loadTransports();
    this.setupCustomerNameSync();
    this.setupCustomerChangeListener();
    this.checkForEdit();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemSubscriptions.forEach(sub => sub?.unsubscribe());
    this.itemSubscriptions = [];

    // Clear Map to help with garbage collection
    this.productPriceCache.clear();
    this.productMap.clear();
    this.productMapReady = false;

    // Clear arrays
    this.products = [];
    this.customers = [];
    this.transports = [];
  }

  private initForm() {
    const today = new Date();
    const validUntil = new Date();
    validUntil.setDate(today.getDate() + 7);

    this.quotationForm = this.fb.group({
      customerId: [''],
      customerName: ['', Validators.required],
      referenceName: [''],
      contactNumber: ['', Validators.required],
      quoteDate: [formatDate(today, 'yyyy-MM-dd', 'en')],
      validUntil: [formatDate(validUntil, 'yyyy-MM-dd', 'en'), [Validators.required]],
      remarks: [''],
      termsConditions: [''],
      items: this.fb.array([]),
      address: [''],
      quotationDiscountPercentage: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
      transportMasterId: [null],
      caseNumber: [''],
      packagingAndForwadingCharges: [0, [Validators.required, Validators.min(0)]]
    });

    this.addItem(true);
    this.itemControlsForView = Array.from(this.itemsFormArray.controls);

    this.quotationForm.get('quotationDiscountPercentage')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(100)
      )
      .subscribe(newValue => {
        // console.log('Quotation discount percentage changed to:', newValue);
        this.itemsFormArray.controls.forEach((_, index) => {
          this.calculateItemPrice(index);
        });
        this.calculateTotalAmount();
        this.cdr.markForCheck();
      });

    // Recalculate totals when packagingAndForwadingCharges changes
    this.quotationForm.get('packagingAndForwadingCharges')?.valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(100))
      .subscribe(() => {
        this.calculateTotalAmount();
        this.cdr.markForCheck();
      });
  }

  private createItemFormGroup(initialData?: any): FormGroup {
    return this.fb.group({
      id: [initialData?.id || ''],
      productId: [initialData?.productId || '', Validators.required],
      productType: [initialData?.productType || ''],
      quantity: [initialData?.quantity || 1, [Validators.required, Validators.min(0.001)]],
      unitPrice: [initialData?.unitPrice || 0, [Validators.required, Validators.min(0.01)]],
      quotationItemStatus: [initialData?.quotationItemStatus || null],
      remarks: [initialData?.remarks || ''],
      price: [initialData?.price || 0],
      discountType: [(initialData?.discountPercentage != null && initialData.discountPercentage > 0) ? 'percentage' : ((initialData?.discountAmount != null && initialData.discountAmount > 0) ? 'amount' : 'percentage')],
      discountPercentage: [initialData?.discountPercentage ?? 0, [Validators.min(0), Validators.max(100)]],
      discountAmount: [initialData?.discountAmount ?? 0, [Validators.min(0)]],
      discountPrice: [initialData?.discountPrice ?? 0],
      taxPercentage: [{ value: initialData?.taxPercentage ?? 18 }],
      taxAmount: [{ value: initialData?.taxAmount || 0, disabled: true }],
      finalPrice: [{ value: initialData?.finalPrice || 0, disabled: true }],
      quotationDiscountAmount: [{ value: initialData?.quotationDiscountAmount || 0, disabled: true }],
      calculations: [initialData?.calculations || []]
    });
  }

  private feetInchValidator(calculationType: string): ValidatorFn {
    return (group: AbstractControl): ValidationErrors | null => {
      if(calculationType === 'SQ_FEET'){
        const feet = group.get('feet')?.value || 0;
        const inch = group.get('inch')?.value
        if (feet === 0 && inch === 0) {
          return { bothZero: true };
        }
      }

      if(calculationType === 'MM'){
        const mm = group.get('mm')?.value || 0;
        if (mm === 0){
          return { mmZero: true };
        }
      }
      return null;
    };
  }


  createCalculationGroup(item: any, calculationType: string): FormGroup {
    // console.log('createCalculationGroup item : ', item);
    return this.fb.group({
      mm: [item.mm, calculationType === 'MM' ? Validators.required : null],
      feet: [item.feet],
      nos: [item.nos, Validators.required],
      weight: [item.weight, Validators.required],
      id: [item?.id],
      inch: [item.inch],
      sqFeet: [item.sqFeet, Validators.required],
      runningFeet: [item.runningFeet, Validators.required]
    }, { validators: this.feetInchValidator(calculationType) });
  }
  
  get isCustomerIdSelected(){
    return this.quotationForm?.get('customerId')?.value
  }
  
  private setupCustomerNameSync() {
    this.quotationForm.get('customerId')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(customerId => {
        if (customerId) {
          const selectedCustomer = this.customers.find(c => c.id === customerId);
          if (selectedCustomer) {
            this.quotationForm.patchValue({ customerName: selectedCustomer.name });
            this.quotationForm.patchValue({ address: selectedCustomer.address });
            this.quotationForm.patchValue({ contactNumber: selectedCustomer.mobile });
            this.quotationForm.patchValue({ referenceName: selectedCustomer.referenceName });
          }
        }
      });
  }

  addItem(isInitializing = false): void {
    const prevProductId = this.itemsFormArray.length > 0
      ? this.itemsFormArray.at(this.itemsFormArray.length - 1).get('productId')?.value
      : '';

    const itemGroup = this.fb.group({
      id: [null],
      productId: [prevProductId ?? '', Validators.required],
      productType: [''],
      quantity: [1, [Validators.required, Validators.min(0.001)]],
      unitPrice: [0, [Validators.required, Validators.min(0.01)]],
      remarks: [''],
      price: [0],
      discountType: ['percentage'],
      discountPercentage: [0, [Validators.min(0), Validators.max(100)]],
      discountAmount: [0, [Validators.min(0)]],
      discountPrice: [0],
      taxPercentage: [18],
      taxAmount: [0],
      finalPrice: [0],
      quotationDiscountAmount: [0],
      calculations: [[]],
      quotationItemStatus: null
    });

    // Add to form array first so indexing (if needed anywhere else) is correct
    this.itemsFormArray.push(itemGroup);

    // Setup logic returning subscription
    const subscription = this.setupItemCalculations(itemGroup);
    this.itemSubscriptions.push(subscription);

    if (prevProductId) {
      itemGroup.get('productId')?.setValue(prevProductId, { emitEvent: true });
    }

    this.calculateItemPrice(itemGroup, isInitializing);
    this.calculateTotalAmount();

    this.itemControlsForView = Array.from(this.itemsFormArray.controls);
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

  removeItem(index: number): void {
    if (this.itemsFormArray.length <= 1) return;
    if (index < 0 || index >= this.itemsFormArray.length) return;

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

    const sub = this.itemSubscriptions[index];
    if (sub && !sub.closed) {
      sub.unsubscribe();
    }
    this.itemSubscriptions.splice(index, 1);

    this.itemsFormArray.removeAt(index);
    this.itemControlsForView = Array.from(this.itemsFormArray.controls);
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

  private setupItemCalculations(group: FormGroup): Subscription {
    const subscription = new Subscription();

    const productIdSub = group.get('productId')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        filter(productId => !!productId),
        debounceTime(100),
        distinctUntilChanged()
      )
      .subscribe(productId => {
        const selectedProduct = this.getProductByValue(productId);
        if (selectedProduct) {
          this.fetchProductPrice(group, selectedProduct);
        }
      });
    
    if (productIdSub) subscription.add(productIdSub);

    // Consolidated valueChanges subscription
    const valueSub = group.valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(150))
      .subscribe(() => {
        this.calculateItemPrice(group);
      });
      
    subscription.add(valueSub);
    
    return subscription;
  }


  calculateItemPrice(group: FormGroup | number, skipChangeDetection = false): void {
    // Support legacy calls with index if any
    let groupControl: FormGroup;
    if (typeof group === 'number') {
      groupControl = this.itemsFormArray.at(group) as FormGroup;
    } else {
      groupControl = group;
    }
    
    if (!groupControl) return;
    
    const values = {
      quantity: Number(Number(groupControl.get('quantity')?.value || 0).toFixed(3)),
      unitPrice: Number(Number(groupControl.get('unitPrice')?.value || 0).toFixed(2)),
      taxPercentage: Number(groupControl.get('taxPercentage')?.value ?? 18),
      discountType: groupControl.get('discountType')?.value || 'percentage',
      discountPercentage: Number(groupControl.get('discountPercentage')?.value || 0),
      discountAmount: Number(groupControl.get('discountAmount')?.value || 0)
    };

    const quotationDiscountPercentage = Number(Number(this.quotationForm.get('quotationDiscountPercentage')?.value || 0).toFixed(2));

    // Base price (quantity × unit price)
    const basePrice = Number((values.quantity * values.unitPrice).toFixed(2));

    // Line-level discount: percentage or amount (mirror add-sale)
    let calculatedDiscountAmount = 0;
    if (values.discountType === 'percentage' && values.discountPercentage > 0) {
      const cappedPercentage = Math.min(values.discountPercentage, 100);
      calculatedDiscountAmount = Number((basePrice * (cappedPercentage / 100)).toFixed(2));
      if (values.discountPercentage > 100) {
        groupControl.patchValue({ discountPercentage: 100 }, { emitEvent: false });
      }
    } else if (values.discountType === 'amount' && values.discountAmount > 0) {
      calculatedDiscountAmount = Math.min(values.discountAmount, basePrice);
      if (values.discountAmount > basePrice) {
        groupControl.patchValue({ discountAmount: basePrice }, { emitEvent: false });
      }
    }

    const discountPrice = Number((basePrice - calculatedDiscountAmount).toFixed(2));

    // Tax on discounted price (existing quotation discount on tax)
    const grossTaxAmount = Number(((discountPrice * values.taxPercentage) / 100).toFixed(2));
    const quotationDiscountAmount = Number(((grossTaxAmount * quotationDiscountPercentage) / 100).toFixed(2));
    const netTaxAmount = Number((grossTaxAmount - quotationDiscountAmount).toFixed(2));
    const finalTaxAmount = Math.max(0, netTaxAmount);
    const finalPrice = Number((discountPrice + finalTaxAmount).toFixed(2));

    groupControl.patchValue({
      price: basePrice,
      discountAmount: calculatedDiscountAmount,
      discountPrice: discountPrice,
      quotationDiscountAmount: quotationDiscountAmount,
      taxAmount: finalTaxAmount,
      finalPrice: finalPrice
    }, { emitEvent: false });

    this.calculateTotalAmount();

    if (!skipChangeDetection) {
      this.cdr.markForCheck();
    }
  }

  getTotalAmount(): number {
    const itemsTotal = this.itemsFormArray.controls
      .reduce((total, group: any) => total + (Number(group.get('finalPrice').value) || 0), 0);
    const packagingCharges = Number(this.quotationForm.get('packagingAndForwadingCharges')?.value || 0);
    return Math.round(itemsTotal + packagingCharges);
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

  /** Build Map for O(1) lookups; sync path when products <= threshold (avoids UI hang for 50k+ products). */
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

  /** O(1) lookup with number/string tolerance; fallback to find when map is still building. */
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

  /** Build productMap in chunks so UI stays responsive for 50k+ products. */
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

  private loadTransports(): void {
    this.isLoadingTransports = true;
    this.transportService.getTransports({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
      next: (response) => {
        if (response?.success !== false) {
          this.transports = response.data || response.transports || [];
        }
        this.isLoadingTransports = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.snackbar.error('Failed to load transports');
        this.isLoadingTransports = false;
        this.cdr.markForCheck();
      }
    });
  }

  refreshTransports(): void {
    this.isLoadingTransports = true;
    this.transportService.refreshTransports()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
      next: (response) => {
        if (response?.success !== false) {
          this.transports = response.data || response.transports || [];
          this.snackbar.success('Transports refreshed successfully');
        }
        this.isLoadingTransports = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.snackbar.error('Failed to refresh transports');
        this.isLoadingTransports = false;
        this.cdr.markForCheck();
      }
    });
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
          this.snackbar.success('Customers refreshed successfully');
        }
        this.isLoadingCustomers = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.snackbar.error('Failed to refresh customers');
        this.isLoadingCustomers = false;
        this.cdr.markForCheck();
      }
    });
  }

  private calculateTotalAmount(): void {
    // Memory optimization: single pass with reduce (same pattern as add-sale), cache in properties
    const controls = this.itemsFormArray.controls;
    const packagingCharges = Number(this.quotationForm.get('packagingAndForwadingCharges')?.value || 0);

    const sums = controls.reduce(
      (acc, group: AbstractControl) => {
        const price = Number(Number(group.get('price')?.value || 0).toFixed(2));
        const discountAmount = Number(Number(group.get('discountAmount')?.value || 0).toFixed(2));
        const discountPrice = Number(Number(group.get('discountPrice')?.value || 0).toFixed(2));
        const finalPrice = Number(Number(group.get('finalPrice')?.value || 0).toFixed(2));
        const taxAmount = Number(Number(group.get('taxAmount')?.value || 0).toFixed(2));
        const quotationDiscountAmount = Number(Number(group.get('quotationDiscountAmount')?.value || 0).toFixed(2));
        return {
          price: Number((acc.price + price).toFixed(2)),
          lineDiscountAmount: Number((acc.lineDiscountAmount + discountAmount).toFixed(2)),
          afterDiscountPrice: Number((acc.afterDiscountPrice + discountPrice).toFixed(2)),
          finalPrice: Number((acc.finalPrice + finalPrice).toFixed(2)),
          tax: Number((acc.tax + taxAmount).toFixed(2)),
          quotationDiscountAmount: Number((acc.quotationDiscountAmount + quotationDiscountAmount).toFixed(2)),
          taxPercentage: Number(group.get('taxPercentage')?.value ?? 18)
        };
      },
      { price: 0, lineDiscountAmount: 0, afterDiscountPrice: 0, finalPrice: 0, tax: 0, quotationDiscountAmount: 0, taxPercentage: 0 }
    );

    const afterQuotationDiscount = Number((sums.afterDiscountPrice - sums.quotationDiscountAmount).toFixed(2));
    this.totals = {
      price: Number((sums.price + packagingCharges).toFixed(2)),
      tax: sums.tax,
      finalPrice: Number((sums.finalPrice + packagingCharges).toFixed(2)),
      taxPercentage: sums.taxPercentage,
      afterQuotationDiscount,
      quotationDiscountAmount: sums.quotationDiscountAmount,
      lineDiscountAmount: sums.lineDiscountAmount,
      afterDiscountPrice: sums.afterDiscountPrice
    };
    this.cdr.markForCheck();
  }

  getFormattedPrice(index: number): string {
    const price = this.itemsFormArray.at(index)?.get('price')?.value;
    return price != null ? Number(price).toFixed(2) : '0.00';
  }

  getFormattedTaxAmount(index: number): string {
    const taxAmount = this.itemsFormArray.at(index)?.get('taxAmount')?.value;
    return taxAmount != null ? Number(taxAmount).toFixed(2) : '0.00';
  }

  getFormattedFinalPrice(index: number): string {
    const finalPrice = this.itemsFormArray.at(index)?.get('finalPrice')?.value;
    return finalPrice != null ? Number(finalPrice).toFixed(2) : '0.00';
  }

  getFormattedQuotationDiscountAmount(index: number): string {
    const amount = this.itemsFormArray.at(index)?.get('quotationDiscountAmount')?.value;
    return amount != null ? Number(amount).toFixed(2) : '0.00';
  }

  getFormattedDiscountAmount(index: number): string {
    const amount = this.itemsFormArray.at(index)?.get('discountAmount')?.value;
    return amount != null ? Number(amount).toFixed(2) : '0.00';
  }

  getFormattedDiscountPrice(index: number): string {
    const discountPrice = this.itemsFormArray.at(index)?.get('discountPrice')?.value;
    const price = this.itemsFormArray.at(index)?.get('price')?.value;
    return discountPrice != null ? Number(discountPrice).toFixed(2) : (price != null ? Number(price).toFixed(2) : '0.00');
  }

  onDiscountTypeChange(i: number): void {
    const group = this.itemsFormArray.at(i) as FormGroup;
    const discountType = group.get('discountType')?.value;
    if (discountType === 'percentage') {
      group.patchValue({ discountAmount: 0 }, { emitEvent: false });
    } else {
      group.patchValue({ discountPercentage: 0 }, { emitEvent: false });
    }
    this.calculateItemPrice(group);
  }

  resetForm(): void {
    const today = new Date();
    const validUntil = new Date();
    validUntil.setDate(today.getDate() + 7);

    this.quotationForm.reset({
      quoteDate: formatDate(today, 'yyyy-MM-dd', 'en'),
      validUntil: formatDate(validUntil, 'yyyy-MM-dd', 'en'),
      remarks: '',
      termsConditions: '',
      quotationDiscountPercentage: 0
    });

    while (this.itemsFormArray.length) {
      this.itemsFormArray.removeAt(0);
    }
    this.addItem();
    
    this.calculateTotalAmount();
    this.cdr.markForCheck();
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.quotationForm.get(fieldName);
    return field ? field.invalid && (field.dirty || field.touched) : false;
  }

  isItemFieldInvalid(index: number, fieldName: string): boolean {
    const control = this.itemsFormArray.at(index).get(fieldName);
    if (!control) return false;

    const isInvalid = control.invalid && (control.dirty || control.touched);

    if (isInvalid) {
      const errors = control.errors;
      if (errors) {
        if (errors['required']) return true;
        if (errors['min'] && (fieldName === 'quantity' || fieldName === 'unitPrice' || fieldName === 'discountPercentage' || fieldName === 'discountAmount')) return true;
        if (errors['max'] && fieldName === 'discountPercentage') return true;
      }
    }

    return false;
  }

  getFieldError(fieldName: string): string {
    const control = this.quotationForm.get(fieldName);
    if (control?.errors) {
      if (control.errors['required']) return `${fieldName} is required`;
      if (control.errors['min']) return `${fieldName} must be greater than ${control.errors['min'].min}`;
      if (control.errors['max']) return `${fieldName} must be less than ${control.errors['max'].max}`;
    }
    return '';
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

  onProductSelect(index: number, event: any): void {
    const selectedProduct = this.getProductByValue(event.value);
    if (!selectedProduct) {
      console.warn('No product found with ID:', event.value);
      return;
    }

    const itemGroup = this.itemsFormArray.at(index);
    
    itemGroup.patchValue({
      productId: selectedProduct.id
    }, { emitEvent: true });
  }

  private fetchProductPrice(group: FormGroup, selectedProduct: any): void {
    const index = this.itemsFormArray.controls.indexOf(group);
    
    const taxPercentage = selectedProduct.taxPercentage !== undefined ? 
                        selectedProduct.taxPercentage : 18;
    
    group.patchValue({
      productType: selectedProduct.type,
      taxPercentage: taxPercentage,
      quantity: selectedProduct.quantity || 1
    }, { emitEvent: false });

    const customerId = this.quotationForm.get('customerId')?.value;
    
    if (customerId) {
      // Fetch customer price from API
      this.fetchCustomerPrice(group, selectedProduct.id, customerId, index);
    } else {
      // If no customer selected, use product saleAmount
      group.patchValue({
        unitPrice: (selectedProduct.saleAmount ?? selectedProduct.sale_amount ?? 0)
      }, { emitEvent: true });
      this.calculateItemPrice(group);
    }
  }

  private fetchCustomerPrice(group: FormGroup, productId: number, customerId: number, index: number): void {
    if (index >= 0) {
      this.isLoadingPrices[index] = true;
    }
    
    const cacheKey = `${customerId}-${productId}`;
    
    // Check cache first
    if (this.productPriceCache.has(cacheKey)) {
      const cachedPrice = this.productPriceCache.get(cacheKey)!;
      
      group.patchValue({
        unitPrice: cachedPrice
      }, { emitEvent: true });
      
      if (index >= 0) {
        this.isLoadingPrices[index] = false;
      }
      this.calculateItemPrice(group);
      this.cdr.markForCheck();
      return;
    }
    
    const requestData = {
      customerId: customerId,
      productId: productId
    };

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
          if (response.success && response.data) {
            const price = response.data.price || 0;
            
            // Cache the price
            this.productPriceCache.set(cacheKey, price);
            
            group.patchValue({
              unitPrice: price
            }, { emitEvent: true });

            this.calculateItemPrice(group);
          } else {
            this.setFallbackPrice(group);
          }
        },
        error: (error) => {
          console.error('Error fetching customer price:', error);
          this.setFallbackPrice(group);
        }
      });
  }

  private setFallbackPrice(group: FormGroup): void {
    const productId = group.get('productId')?.value;
    const selectedProduct = this.getProductByValue(productId);
    
    if (selectedProduct) {
      const unitPrice = selectedProduct.saleAmount ?? selectedProduct.sale_amount ?? 0;
      group.patchValue({
        unitPrice: unitPrice
      }, { emitEvent: true });

      this.calculateItemPrice(group);
      this.cdr.markForCheck();
    }
  }

  validateDates(): void {
    const quoteDate = this.quotationForm.get('quoteDate')?.value;
    const validUntil = this.quotationForm.get('validUntil')?.value;

    if (quoteDate && validUntil && new Date(validUntil) < new Date(quoteDate)) {
      this.quotationForm.get('validUntil')?.setErrors({ invalidDate: true });
    }
  }

  private checkForEdit(): void {
    const encryptedId = localStorage.getItem('editQuotationId');

    if (!encryptedId) {
      return;
    }

    try {
      const quotationId = this.encryptionService.decrypt(encryptedId);

      if (!quotationId) {
        localStorage.removeItem('editQuotationId');
        return;
      }

      this.isLoading = true;
      this.loading = true;
      this.quotationService.getQuotationDetail(parseInt(quotationId))
        .pipe(takeUntil(this.destroy$))
        .subscribe({
        next: (response) => {
          if (response) {
            this.quotationId = parseInt(quotationId);
            this.isEdit = true;
            // console.log('edit response >>',response.data)
            this.populateForm(response.data);
          }
          this.isLoading = false;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error loading quotation details:', error);
          this.snackbar.error('Failed to load quotation details');
          this.isLoading = false;
          this.loading = false;
          localStorage.removeItem('editQuotationId');
          this.cdr.markForCheck();
        }
      });
    } catch (error) {
      console.error('Decryption error:', error);
      localStorage.removeItem('editQuotationId');
    }
  }

  async populateForm(data: any) {
    if (!data) return;

    this.itemSubscriptions.forEach(sub => sub?.unsubscribe());
    this.itemSubscriptions = [];
    while (this.itemsFormArray.length) {
      this.itemsFormArray.removeAt(0);
    }

    this.quotationForm.patchValue({
      customerName: data.customerName,
      customerId: data.customerId,
      referenceName: data.referenceName || '',
      quoteDate: data.quoteDate,
      validUntil: data.validUntil,
      remarks: data.remarks || '',
      termsConditions: data.termsConditions || '',
      address: data.address,
      contactNumber: data.contactNumber,
      quotationDiscountPercentage: data.quotationDiscountPercentage || data.quotationDiscount || 0,
      transportMasterId: data.transportMasterId || null,
      caseNumber: data.caseNumber || '',
      packagingAndForwadingCharges: data.packagingAndForwadingCharges ?? 0
    });

    if (data.items && Array.isArray(data.items)) {
      data.items.forEach((item: any) => {
        const product = this.getProductByValue(item.productId);
        const taxPercentage = product?.taxPercentage !== undefined
          ? product.taxPercentage
          : (item.taxPercentage ?? 18);
        const discountPercentage = item.discountPercentage != null ? item.discountPercentage : 0;
        const discountAmount = item.discountAmount != null ? item.discountAmount : 0;
        const discountPrice = item.discountPrice != null ? item.discountPrice : (Number(item.price || 0) - discountAmount);
        const discountType = discountPercentage > 0 ? 'percentage' : 'amount';

        const itemGroup = this.fb.group({
          id: [item.id || null],
          productId: [item.productId || '', Validators.required],
          productType: [item.productType || ''],
          quantity: [item.quantity || 1, [Validators.required, Validators.min(0.001)]],
          unitPrice: [item.unitPrice || 0, [Validators.required, Validators.min(0.01)]],
          remarks: [item.remarks || ''],
          price: [item.price || 0],
          discountType: [discountType],
          discountPercentage: [discountPercentage, [Validators.min(0), Validators.max(100)]],
          discountAmount: [discountAmount, [Validators.min(0)]],
          discountPrice: [discountPrice],
          taxPercentage: [taxPercentage],
          taxAmount: [item.taxAmount || 0],
          finalPrice: [item.finalPrice || 0],
          quotationDiscountAmount: [item.quotationDiscountAmount || 0],
          calculations: [item.calculations || []],
          quotationItemStatus: [item.quotationItemStatus || null]
        });

        this.itemsFormArray.push(itemGroup);
        const subscription = this.setupItemCalculations(itemGroup);
        this.itemSubscriptions.push(subscription);
      });
    }

    this.itemControlsForView = Array.from(this.itemsFormArray.controls);
    this.calculateTotalAmount();
    this.cdr.markForCheck();
    setTimeout(() => {
      this.viewport?.checkViewportSize();
      this.cdr.markForCheck();
    }, 0);
  }

  onSubmit(): void {
    if (this.quotationForm.valid) {
      this.isLoading = true;
      this.loading = true;
      const formData = this.prepareFormData();

      const request$ = this.isEdit
        ? this.quotationService.updateQuotation(this.quotationId!, formData)
        : this.quotationService.createQuotation(formData);

      request$
        .pipe(takeUntil(this.destroy$))
        .subscribe({
        next: (response: any) => {
          if (response.success) {
            this.snackbar.success(`Quotation ${this.isEdit ? 'updated' : 'created'} successfully`);
            this.quotationForm.reset();
            this.router.navigate(['/quotation']);
          }
          this.isLoading = false;
          this.loading = false;
        },
        error: (error: any) => {
          this.snackbar.error(error?.error?.message || `Failed to ${this.isEdit ? 'update' : 'create'} quotation`);
          this.isLoading = false;
          this.loading = false;
        }
      });
    }
  }

  private prepareFormData() {
    const formValue = this.quotationForm.value;
    const quotationDiscountPercentage = Number(this.quotationForm.get('quotationDiscountPercentage')?.value || 0);

    // Single pass over items (same pattern as add-sale prepareFormData) for scale (5000+ items)
    const items = this.itemsFormArray.controls.map((control) => ({
      id: control.get('id')?.value,
      productId: control.get('productId')?.value,
      productType: control.get('productType')?.value,
      quantity: control.get('quantity')?.value,
      unitPrice: control.get('unitPrice')?.value,
      remarks: control.get('remarks')?.value,
      price: control.get('price')?.value,
      discountPercentage: Number(control.get('discountPercentage')?.value ?? 0),
      discountAmount: Number(control.get('discountAmount')?.value ?? 0),
      taxPercentage: control.get('taxPercentage')?.value,
      taxAmount: control.get('taxAmount')?.value,
      finalPrice: control.get('finalPrice')?.value,
      quotationDiscountAmount: control.get('quotationDiscountAmount')?.value,
      calculations: control.get('calculations')?.value || [],
      quotationItemStatus: control.get('quotationItemStatus')?.value
    }));

    return {
      customerId: formValue.customerId,
      customerName: formValue.customerName,
      referenceName: formValue.referenceName,
      contactNumber: formValue.contactNumber,
      quoteDate: formatDate(formValue.quoteDate, 'yyyy-MM-dd', 'en'),
      validUntil: formatDate(formValue.validUntil, 'yyyy-MM-dd', 'en'),
      remarks: formValue.remarks,
      termsConditions: formValue.termsConditions,
      address: formValue.address,
      quotationDiscountPercentage,
      transportMasterId: formValue.transportMasterId,
      caseNumber: formValue.caseNumber,
      packagingAndForwadingCharges: Number(formValue.packagingAndForwadingCharges || 0),
      items
    };
  }



  private setupCustomerChangeListener(): void {
    this.quotationForm.get('customerId')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.productPriceCache.clear();
      });
  }

  onQuotationDiscountPercentageChange(event: any): void {
    // console.log('Quotation discount percentage changed to:', event.target.value);
    
    const newValue = Number(event.target.value || 0);
    
    this.quotationForm.get('quotationDiscountPercentage')?.setValue(newValue, { emitEvent: false });
    
    this.itemsFormArray.controls.forEach((group: AbstractControl) => {
      this.calculateItemPrice(group as FormGroup);
    });
    
    this.calculateTotalAmount();
    
    this.cdr.markForCheck();
  }

  // Map item status code to human-readable label using QuotationItemStatus enum
  getQuotationItemStatusLabel(code: string | null | undefined): string {
    if (!code) return '';
    const map: Record<string, string> = {
      O: QuotationItemStatus.O,
      I: QuotationItemStatus.I,
      C: QuotationItemStatus.C,
      B: QuotationItemStatus.B,
    } as unknown as Record<string, string>;
    return map[code] || String(code);
  }

  // Touch event handling for mobile devices
  private touchStartTime: number = 0;
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private isTouchScrolling: boolean = false;

  handleTouchStart(event: TouchEvent): void {
    this.touchStartTime = Date.now();
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
    this.isTouchScrolling = false;
  }

  handleTouchMove(event: TouchEvent): void {
    const touchMoveX = event.touches[0].clientX;
    const touchMoveY = event.touches[0].clientY;
    const deltaX = Math.abs(touchMoveX - this.touchStartX);
    const deltaY = Math.abs(touchMoveY - this.touchStartY);
    
    // If user has moved more than 10px, consider it scrolling/dragging
    if (deltaX > 10 || deltaY > 10) {
      this.isTouchScrolling = true;
    }
  }

  handleTouchEnd(event: TouchEvent): void {
    const touchEndTime = Date.now();
    const touchDuration = touchEndTime - this.touchStartTime;
    
    // Prevent accidental form submissions from quick taps
    if (touchDuration < 200 && !this.isTouchScrolling) {
      // This was a quick tap, not a scroll
      event.preventDefault();
    }
  }

}

