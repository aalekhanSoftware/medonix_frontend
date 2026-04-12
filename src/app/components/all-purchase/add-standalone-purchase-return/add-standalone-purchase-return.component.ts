import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, ViewChildren, QueryList, HostListener } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators, ValidatorFn, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { formatDate } from '@angular/common';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

import { PurchaseService } from '../../../services/purchase.service';
import { ProductService } from '../../../services/product.service';
import { CustomerService } from '../../../services/customer.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { StandalonePurchaseReturnRequest, StandalonePurchaseReturnUpdateRequest, StandalonePurchaseReturnProductDto } from '../../../models/purchase-return.model';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { ProductBatchStockService } from '../../../services/product-batch-stock.service';

@Component({
  selector: 'app-add-standalone-purchase-return',
  templateUrl: './add-standalone-purchase-return.component.html',
  styleUrls: ['./add-standalone-purchase-return.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddStandalonePurchaseReturnComponent implements OnInit, OnDestroy {
  returnForm!: FormGroup;
  products: any[] = [];
  customers: any[] = [];
  loading = false;
  isLoadingProducts = false;
  isLoadingCustomers = false;
  isEdit = false;
  standaloneReturnId: number | null = null;
  private destroy$ = new Subject<void>();
  private productSubscriptions: Subscription[] = [];

  private productMap: Map<any, any> = new Map();
  private productMapReady = false;
  private readonly PRODUCT_MAP_SYNC_THRESHOLD = 1000;

  @ViewChild(CdkVirtualScrollViewport) viewport!: CdkVirtualScrollViewport;
  @ViewChildren(SearchableSelectComponent) searchableSelects!: QueryList<SearchableSelectComponent>;

  apiBatchNumbersMap: Map<number, string[]> = new Map();
  activeBatchDropdownIndex: number | null = null;
  filteredBatchNumbers: string[] = [];
  batchDropdownCloseTimeout: any;

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

  totalAmount = 0;
  totalDiscountAmount = 0;
  totalTaxAmount = 0;
  grandTotal = 0;

  get productsFormArray(): FormArray {
    return this.returnForm.get('products') as FormArray;
  }

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private purchaseService: PurchaseService,
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
    const encryptedId = this.route.snapshot.paramMap.get('id');
    if (encryptedId) {
      const decrypted = this.encryptionService.decrypt(encryptedId);
      if (decrypted) {
        const id = Number(decrypted);
        if (!isNaN(id)) {
          this.standaloneReturnId = id;
          this.isEdit = true;
        }
      }
    }

    this.loadCustomers();

    this.isLoadingProducts = true;
    this.productService.getProducts({ status: 'A' }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        if (response?.success && response.data) {
          this.products = response.data.content || response.data;
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
        if (this.isEdit && this.standaloneReturnId) {
          this.loadStandaloneReturnDetails(this.standaloneReturnId);
        }
      },
      error: () => {
        this.snackbar.error('Failed to load products');
        this.isLoadingProducts = false;
        this.cdr.markForCheck();
      }
    });

    this.returnForm.get('packagingAndForwadingCharges')?.valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(150))
      .subscribe(() => {
        this.calculateTotals();
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.productSubscriptions.forEach(sub => {
      if (sub && !sub.closed) sub.unsubscribe();
    });
    this.productSubscriptions = [];
    this.destroy$.next();
    this.destroy$.complete();
    this.products = [];
    this.customers = [];
    this.productMap.clear();
    this.productMapReady = false;
    if (this.returnForm) {
      this.returnForm.reset();
    }
  }

  private initForm(): void {
    this.returnForm = this.fb.group({
      customerId: ['', Validators.required],
      purchaseReturnDate: [formatDate(new Date(), 'yyyy-MM-dd', 'en'), Validators.required],
      isDiscount: [false],
      packagingAndForwadingCharges: [0, [Validators.required, Validators.min(0)]],
      products: this.fb.array([])
    });
    if (!this.isEdit) {
      this.addProduct();
      this.productControlsForView = Array.from(this.productsFormArray.controls);
    }
  }

  private createProductFormGroup(): FormGroup {
    const group = this.fb.group({
      id: [null],
      productId: ['', Validators.required],
      quantity: ['', [Validators.required, Validators.min(0.001)]],
      unitPrice: ['', [Validators.required, Validators.min(0.01)]],
      batchNumber: ['', [this.noDoubleQuotesValidator()]],
      price: [{ value: 0, disabled: true }],
      discountType: ['percentage'],
      discountPercentage: [0, [Validators.min(0), Validators.max(100)]],
      discountAmount: [0, [Validators.min(0)]],
      discountPrice: [{ value: 0, disabled: true }],
      taxPercentage: [{ value: 0, disabled: true }],
      taxAmount: [{ value: 0, disabled: true }],
      remarks: [null as string | null]
    });
    const sub = this.setupProductCalculations(group);
    this.productSubscriptions.push(sub);
    return group;
  }

  private setupProductCalculations(group: FormGroup): Subscription {
    const subscription = new Subscription();
    const productIdSub = group.get('productId')?.valueChanges
      .pipe(takeUntil(this.destroy$), distinctUntilChanged())
      .subscribe((productId: any) => {
        if (productId) {
          const product = this.getProductByValue(productId);
          if (product && product.taxPercentage != null) {
            group.patchValue({ taxPercentage: product.taxPercentage }, { emitEvent: false });
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
    if (productIdSub) subscription.add(productIdSub);
    const valueSub = group.valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(150))
      .subscribe(() => this.calculateProductPrice(group));
    subscription.add(valueSub);
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
    const subtotal = Number((quantity * unitPrice).toFixed(2));
    let calculatedDiscountAmount = 0;
    if (discountType === 'percentage' && discountPercentage > 0) {
      const capped = Math.min(discountPercentage, 100);
      calculatedDiscountAmount = Number((subtotal * (capped / 100)).toFixed(2));
      if (discountPercentage > 100) group.patchValue({ discountPercentage: 100 }, { emitEvent: false });
    } else if (discountType === 'amount' && discountAmount > 0) {
      calculatedDiscountAmount = Math.min(discountAmount, subtotal);
      if (discountAmount > subtotal) group.patchValue({ discountAmount: subtotal }, { emitEvent: false });
    }
    const calculatedDiscountPrice = Number((subtotal - calculatedDiscountAmount).toFixed(2));
    const taxAmount = Number((calculatedDiscountPrice * taxPercentage / 100).toFixed(2));
    group.patchValue({
      price: subtotal,
      discountAmount: calculatedDiscountAmount,
      discountPrice: calculatedDiscountPrice,
      taxAmount
    }, { emitEvent: false });
    this.calculateTotals();
    this.cdr.markForCheck();
  }

  private noDoubleQuotesValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      return control.value.includes('"') ? { doubleQuotes: true } : null;
    };
  }

  onDiscountTypeChange(index: number): void {
    const group = this.productsFormArray.at(index) as FormGroup;
    const discountType = group.get('discountType')?.value;
    if (discountType === 'percentage') {
      group.patchValue({ discountAmount: 0 }, { emitEvent: false });
    } else {
      group.patchValue({ discountPercentage: 0 }, { emitEvent: false });
    }
    this.calculateProductPrice(group);
  }

  private calculateTotals(): void {
    this.totalAmount = this.productsFormArray.controls.reduce(
      (sum, c) => sum + (Number((c as FormGroup).get('price')?.value) || 0),
      0
    );
    this.totalDiscountAmount = this.productsFormArray.controls.reduce(
      (sum, c) => sum + (Number((c as FormGroup).get('discountAmount')?.value) || 0),
      0
    );
    this.totalTaxAmount = this.productsFormArray.controls.reduce(
      (sum, c) => sum + (Number((c as FormGroup).get('taxAmount')?.value) || 0),
      0
    );
    const packaging = Number(this.returnForm.get('packagingAndForwadingCharges')?.value || 0);
    const finalPrice = this.productsFormArray.controls.reduce(
      (sum, c) => {
        const g = c as FormGroup;
        const d = Number(g.get('discountPrice')?.value || g.get('price')?.value || 0);
        const t = Number(g.get('taxAmount')?.value || 0);
        return sum + d + t;
      },
      0
    );
    this.grandTotal = Number((finalPrice + packaging).toFixed(2));
    this.cdr.markForCheck();
  }

  getTotalFinalPrice(): number {
    return this.productsFormArray.controls.reduce(
      (sum, c) => {
        const g = c as FormGroup;
        const d = Number(g.get('discountPrice')?.value || g.get('price')?.value || 0);
        const t = Number(g.get('taxAmount')?.value || 0);
        return sum + d + t;
      },
      0
    );
  }

  addProduct(): void {
    const prevProductId = this.productsFormArray.length > 0
      ? this.productsFormArray.at(this.productsFormArray.length - 1).get('productId')?.value
      : '';
    const group = this.createProductFormGroup();
    if (prevProductId) {
      group.patchValue({ productId: prevProductId }, { emitEvent: false });
    }
    this.productsFormArray.push(group);
    this.productControlsForView = Array.from(this.productsFormArray.controls);
    if (prevProductId) {
      group.get('productId')?.setValue(prevProductId, { emitEvent: true });
    }
    this.calculateTotals();
    this.cdr.markForCheck();
    setTimeout(() => {
      this.cdr.detectChanges();
      if (!this.viewport) return;
      this.viewport.checkViewportSize();
      requestAnimationFrame(() => {
        const el = this.viewport.elementRef.nativeElement as HTMLElement;
        const maxScroll = el.scrollHeight - el.clientHeight;
        el.scrollTop = Math.max(0, maxScroll);
        this.calculateTotals();
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
    this.calculateTotals();
    this.cdr.markForCheck();
    this.cdr.detectChanges();
    setTimeout(() => {
      this.viewport?.checkViewportSize();
      this.calculateTotals();
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    }, 0);
  }

  private buildProductMap(): void {
    this.productMap.clear();
    for (const product of this.products) {
      const id = product?.id;
      if (id !== undefined && id !== null) {
        this.productMap.set(id, product);
        this.productMap.set(String(id), product);
      }
    }
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

  loadCustomers(): void {
    this.isLoadingCustomers = true;
    this.customerService.getCustomers({ status: 'A' }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        if (response?.success && response.data) {
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
        if (response?.success && response.data) {
          this.customers = response.data;
          this.snackbar.success('Customers refreshed successfully');
        }
        this.isLoadingCustomers = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.snackbar.error('Failed to refresh customers');
        this.isLoadingCustomers = false;
        this.cdr.markForCheck();
      }
    });
  }

  refreshProducts(): void {
    this.isLoadingProducts = true;
    this.productService.refreshProducts().pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        if (response?.success && response.data) {
          this.products = response.data.content ?? response.data;
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
      error: () => {
        this.snackbar.error('Failed to refresh products');
        this.isLoadingProducts = false;
        this.cdr.markForCheck();
      }
    });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.returnForm.get(fieldName);
    return field ? field.invalid && field.touched : false;
  }

  isProductFieldInvalid(index: number, fieldName: string): boolean {
    const control = this.productsFormArray.at(index)?.get(fieldName);
    return control ? !!(control.invalid && (control.dirty || control.touched)) : false;
  }

  getFormattedSubtotal(index: number): string {
    const v = this.productsFormArray.at(index)?.get('price')?.value;
    return v != null ? Number(v).toFixed(2) : '0.00';
  }

  getFormattedDiscountAmount(index: number): string {
    const v = this.productsFormArray.at(index)?.get('discountAmount')?.value;
    return v != null ? Number(v).toFixed(2) : '0.00';
  }

  getFormattedDiscountPrice(index: number): string {
    const g = this.productsFormArray.at(index);
    const v = g?.get('discountPrice')?.value;
    const p = g?.get('price')?.value;
    return v != null ? Number(v).toFixed(2) : (p != null ? Number(p).toFixed(2) : '0.00');
  }

  getFormattedTaxAmount(index: number): string {
    const v = this.productsFormArray.at(index)?.get('taxAmount')?.value;
    return v != null ? Number(v).toFixed(2) : '0.00';
  }

  resetForm(): void {
    this.productsFormArray.clear();
    this.productSubscriptions.forEach(s => s?.unsubscribe());
    this.productSubscriptions = [];
    this.initForm();
    this.productControlsForView = Array.from(this.productsFormArray.controls);
    this.cdr.markForCheck();
  }

  onSubmit(): void {
    this.markFormGroupTouched(this.returnForm);
    if (!this.returnForm.valid) {
      const firstError = document.querySelector('.is-invalid');
      if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    this.loading = true;
    this.cdr.markForCheck();

    if (this.isEdit && this.standaloneReturnId) {
      const payload = this.prepareFormDataForUpdate();
      this.purchaseService.updateStandalonePurchaseReturn(payload).pipe(takeUntil(this.destroy$)).subscribe({
        next: (response: any) => {
          if (response?.success !== false) {
            this.snackbar.success(response?.message || 'Purchase return updated successfully');
            this.router.navigate(['/purchase/return']);
          } else {
            this.snackbar.error(response?.message || 'Failed to update purchase return');
          }
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (error: any) => {
          this.snackbar.error(error?.error?.message || 'Failed to update purchase return');
          this.loading = false;
          this.cdr.markForCheck();
        }
      });
    } else {
      const payload = this.prepareFormData();
      this.purchaseService.createStandalonePurchaseReturn(payload).pipe(takeUntil(this.destroy$)).subscribe({
        next: (response: any) => {
          const isSuccess = response && (response.success !== false) && (response.id != null || response.success === true || response?.data?.id != null);
          if (isSuccess) {
            this.snackbar.success(response?.message || 'Purchase return created successfully');
            this.resetForm();
            this.router.navigate(['/purchase/return']);
          } else {
            this.snackbar.error(response?.message || 'Failed to create purchase return');
          }
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (error: any) => {
          this.snackbar.error(error?.error?.message || 'Failed to create purchase return');
          this.loading = false;
          this.cdr.markForCheck();
        }
      });
    }
  }

  private prepareFormData(): StandalonePurchaseReturnRequest {
    const v = this.returnForm.value;
    return {
      purchaseReturnDate: formatDate(v.purchaseReturnDate, 'dd-MM-yyyy', 'en'),
      customerId: Number(v.customerId),
      isDiscount: !!v.isDiscount,
      packagingAndForwadingCharges: Number(v.packagingAndForwadingCharges || 0),
      products: (v.products || []).map((p: any, index: number) => {
        const group = this.productsFormArray.at(index) as FormGroup;
        const discountType = p.discountType || 'percentage';
        const product: StandalonePurchaseReturnProductDto = {
          productId: Number(p.productId),
          quantity: Number(p.quantity),
          unitPrice: Number(p.unitPrice),
          remarks: p.remarks || null,
          batchNumber: p.batchNumber || null
        };
        if (discountType === 'percentage') {
          product.discountPercentage = Number(p.discountPercentage ?? 0);
          product.discountAmount = 0;
        } else {
          product.discountAmount = Number(p.discountAmount ?? 0);
          product.discountPercentage = 0;
        }
        product.taxPercentage = Number(group.get('taxPercentage')?.value ?? 0);
        return product;
      })
    };
  }

  private prepareFormDataForUpdate(): StandalonePurchaseReturnUpdateRequest {
    const v = this.returnForm.value;
    return {
      id: this.standaloneReturnId!,
      purchaseReturnDate: formatDate(v.purchaseReturnDate, 'dd-MM-yyyy', 'en'),
      customerId: Number(v.customerId),
      isDiscount: !!v.isDiscount,
      packagingAndForwadingCharges: Number(v.packagingAndForwadingCharges || 0),
      products: (v.products || []).map((p: any, index: number) => {
        const group = this.productsFormArray.at(index) as FormGroup;
        const discountType = p.discountType || 'percentage';
        const product: StandalonePurchaseReturnProductDto = {
          productId: Number(p.productId),
          quantity: Number(p.quantity),
          unitPrice: Number(p.unitPrice),
          remarks: p.remarks || null,
          batchNumber: p.batchNumber || null
        };
        if (discountType === 'percentage') {
          product.discountPercentage = Number(p.discountPercentage ?? 0);
          product.discountAmount = 0;
        } else {
          product.discountAmount = Number(p.discountAmount ?? 0);
          product.discountPercentage = 0;
        }
        product.taxPercentage = Number(group.get('taxPercentage')?.value ?? 0);
        return product;
      })
    };
  }

  private loadStandaloneReturnDetails(id: number): void {
    this.loading = true;
    this.cdr.markForCheck();
    this.purchaseService.getPurchaseReturnDetail(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        if (response && (response.id != null || response.purchaseReturnDate != null)) {
          // Defer so products list is applied and template sees [options]="products" before rows render
          setTimeout(() => {
            this.populateForm(response);
            this.loading = false;
            this.cdr.markForCheck();
          }, 0);
        } else {
          this.snackbar.error('Failed to load purchase return details');
          this.loading = false;
          this.cdr.markForCheck();
        }
      },
      error: (error: any) => {
        this.snackbar.error(error?.error?.message || 'Failed to load purchase return details');
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  private populateForm(data: any): void {
    // Unsubscribe before replacing the form array
    this.productSubscriptions.forEach(s => s?.unsubscribe());
    this.productSubscriptions = [];

    const items = data.items || data.products || [];
    const dateVal = data.purchaseReturnDate ? formatDate(new Date(data.purchaseReturnDate), 'yyyy-MM-dd', 'en') : this.returnForm.get('purchaseReturnDate')?.value;
    this.returnForm.patchValue({
      customerId: data.customerId ?? '',
      purchaseReturnDate: dateVal,
      isDiscount: data.isDiscount ?? false,
      packagingAndForwadingCharges: data.packagingAndForwadingCharges ?? 0
    });

    if (items.length > 0) {
      const groups: FormGroup[] = [];
      for (const item of items) {
        const group = this.createProductFormGroup();
        const discountPct = Number(item.discountPercentage ?? 0);
        const discountAmt = Number(item.discountAmount ?? 0);
        const discountType = discountPct > 0 ? 'percentage' : (discountAmt > 0 ? 'amount' : 'percentage');
        const productId = item.productId != null ? Number(item.productId) : '';
        const quantity = Number(item.quantity ?? 0);
        const unitPrice = Number(item.unitPrice ?? 0);
        const batchNumber = item.batchNumber != null ? String(item.batchNumber) : '';
        const price = Number(item.price ?? 0);
        const discountPrice = Number(item.discountPrice ?? item.price ?? 0);
        const taxPct = Number(item.taxPercentage ?? 0);
        const taxAmt = Number(item.taxAmount ?? 0);
        group.patchValue({
          id: item.id ?? null,
          productId,
          quantity,
          unitPrice,
          batchNumber,
          price,
          discountType,
          discountPercentage: discountPct,
          discountAmount: discountAmt,
          discountPrice,
          taxPercentage: taxPct,
          taxAmount: taxAmt,
          remarks: item.remarks ?? null
        }, { emitEvent: false });
        groups.push(group);

        if (productId && !this.apiBatchNumbersMap.has(productId)) {
          this.productBatchStockService.getAvailableBatchNames(productId)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (response) => {
                const batchArray = Array.isArray(response) ? response : (response && response.success && Array.isArray(response.data) ? response.data : null);
                if (batchArray) {
                  this.apiBatchNumbersMap.set(productId, batchArray);
                }
              },
              error: () => { }
            });
        }
      }
      this.returnForm.setControl('products', this.fb.array(groups));
      this.productControlsForView = Array.from(this.productsFormArray.controls);
      this.calculateTotals();
    } else {
      this.productsFormArray.clear();
      this.addProduct();
    }
    this.cdr.markForCheck();
    setTimeout(() => {
      this.viewport?.checkViewportSize();
      this.cdr.markForCheck();
    }, 0);
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
    
    this.activeBatchDropdownIndex = index;
    this.cdr.markForCheck();
  }

  onBatchBlur(index: number): void {
    this.batchDropdownCloseTimeout = setTimeout(() => {
      if (this.activeBatchDropdownIndex === index) {
        this.activeBatchDropdownIndex = null;
        this.cdr.markForCheck();
      }
    }, 150);
  }

  selectBatch(index: number, batch: string): void {
    const group = this.productsFormArray.at(index);
    group.patchValue({ batchNumber: batch });
    group.get('batchNumber')?.markAsDirty();
    this.activeBatchDropdownIndex = null;
    this.cdr.markForCheck();
  }
}
