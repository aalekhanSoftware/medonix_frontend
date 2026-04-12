import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, ViewChildren, QueryList, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, ValidatorFn, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { formatDate } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

import { ProductService } from '../../../services/product.service';
import { PurchaseChallanService } from '../../../services/purchase-challan.service';
import { CustomerService } from '../../../services/customer.service';
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
  taxPercentage: number;
  taxAmount: number;
  remarks: string
}

@Component({
  selector: 'app-add-purchase-challan',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    ScrollingModule,
    LoaderComponent,
    SearchableSelectComponent
  ],
  templateUrl: './add-purchase-challan.component.html',
  styleUrls: ['./add-purchase-challan.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddPurchaseChallanComponent implements OnInit, OnDestroy {
  purchaseChallanForm!: FormGroup;
  products: any[] = [];
  customers: any[] = [];
  loading = false;
  isLoadingProducts = false;
  isLoadingCustomers = false;
  isEdit = false;
  private destroy$ = new Subject<void>();
  private productSubscriptions: Subscription[] = [];
  private productMap: Map<any, any> = new Map();
  private productMapReady = false;
  private readonly PRODUCT_MAP_SYNC_THRESHOLD = 1000;
  totalAmount = 0;
  totalTaxAmount = 0;
  grandTotal = 0;

  // Batch numbers fetched per-product from API
  apiBatchNumbersMap: Map<number, string[]> = new Map();
  
  // Active dropdown state
  activeBatchDropdownIndex: number | null = null;
  filteredBatchNumbers: string[] = [];
  batchDropdownCloseTimeout: any;

  @ViewChild(CdkVirtualScrollViewport) viewport!: CdkVirtualScrollViewport;
  @ViewChildren(SearchableSelectComponent) searchableSelects!: QueryList<SearchableSelectComponent>;

  get productsFormArray() {
    return this.purchaseChallanForm.get('products') as FormArray;
  }

  productControlsForView: AbstractControl[] = [];

  trackByProductControl(index: number, control: AbstractControl): AbstractControl {
    return control;
  }

  private readonly VIRTUAL_SCROLL_ITEM_SIZE_PX = 52;

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
    private purchaseChallanService: PurchaseChallanService,
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
    
    const encryptedId = localStorage.getItem('purchaseChallanId');
    if (encryptedId) {
      const purchaseChallanId = this.encryptionService.decrypt(encryptedId);
      if (purchaseChallanId) {
        this.fetchPurchaseChallanDetails(Number(purchaseChallanId));
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

    // Clear arrays to release memory
    this.products = [];
    this.customers = [];

    this.purchaseChallanForm.reset();
    this.productMap.clear();
    this.productMapReady = false;
  }

  private initForm() {
    this.purchaseChallanForm = this.fb.group({
      id: [null],
      customerId: ['', Validators.required],
      challanDate: [formatDate(new Date(), 'yyyy-MM-dd', 'en'), Validators.required],
      invoiceNumber: ['', Validators.required],
      packagingAndForwadingCharges: [0, [Validators.required, Validators.min(0)]],
      products: this.fb.array([])
    });

    this.purchaseChallanForm.get('packagingAndForwadingCharges')?.valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(300))
      .subscribe(() => {
        this.calculateTotalAmount();
        this.cdr.markForCheck();
      });

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

  private setupProductCalculations(group: FormGroup): Subscription {
    const subscription = new Subscription();

    // Listen to product selection to get tax percentage and purchaseAmount
    const productIdSubscription = group.get('productId')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(150),
        distinctUntilChanged()
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
    
    // Calculate price = unitPrice * quantity
    const price = Number((quantity * unitPrice).toFixed(2));
    
    // Calculate taxAmount = (price * taxPercentage) / 100
    const taxAmount = Number((price * taxPercentage / 100).toFixed(2));

    group.patchValue({
      price: price,
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

  getGrandTotal(): number {
    const packagingCharges = Number(this.purchaseChallanForm.get('packagingAndForwadingCharges')?.value || 0);
    return this.getTotalAmount() + this.getTotalTaxAmount() + packagingCharges;
  }

  private loadProducts(): void {
    this.isLoadingProducts = true;
    this.productService.getProducts({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.products = response.data;
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

  refreshProducts(): void {
    this.isLoadingProducts = true;
    this.productService.refreshProducts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.products = response.data;
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
          this.snackbar.error('Failed to refresh customers');
          this.isLoadingCustomers = false;
          this.cdr.markForCheck();
        }
      });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.purchaseChallanForm.get(fieldName);
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
        if (errors['min'] && fieldName === 'quantity') return true;
        if (errors['min'] && fieldName === 'unitPrice') return true;
        if (errors['min'] || errors['max']) return true;
        if (errors['min']) return true;
      }
    }
    
    return false;
  }

  resetForm() {
    this.isEdit = false;
    this.purchaseChallanForm.patchValue({ id: null });
    this.initForm();
  }

  onSubmit() {
    this.markFormGroupTouched(this.purchaseChallanForm);
    
    if (this.purchaseChallanForm.valid) {
      this.loading = true;
      const formData = this.preparePurchaseChallanData();
      
      const serviceCall = this.isEdit 
        ? this.purchaseChallanService.updatePurchaseChallan(formData)
        : this.purchaseChallanService.createPurchaseChallan(formData);
      
      serviceCall
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response: any) => {
            if (response?.success) {
              this.snackbar.success(`Purchase Challan ${this.isEdit ? 'updated' : 'created'} successfully`);
              localStorage.removeItem('purchaseChallanId');
              this.router.navigate(['/purchase-challan']);
            }
            this.loading = false;
            this.cdr.markForCheck();
          },
          error: (error) => {
            this.snackbar.error(error?.error?.message || `Failed to ${this.isEdit ? 'update' : 'create'} purchase challan`);
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

  private preparePurchaseChallanData() {
    const formValue = this.purchaseChallanForm.value;
    const data: any = {
      challanDate: formatDate(formValue.challanDate, 'dd-MM-yyyy', 'en'),
      customerId: formValue.customerId,
      invoiceNumber: formValue.invoiceNumber,
      price: this.getTotalAmount(),
      taxAmount: this.getTotalTaxAmount(),
      packagingAndForwadingCharges: Number(formValue.packagingAndForwadingCharges || 0),
      products: formValue.products.map((product: ProductForm, index: number) => {
        const itemId = this.productsFormArray.at(index).get('id')?.value;
        const item: any = {
          productId: product.productId,
          quantity: product.quantity,
          batchNumber: product.batchNumber,
          unitPrice: product.unitPrice,
          price: this.productsFormArray.at(index).get('price')?.value,
          taxPercentage: this.productsFormArray.at(index).get('taxPercentage')?.value,
          taxAmount: this.productsFormArray.at(index).get('taxAmount')?.value,
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
    const totalPrice = this.productsFormArray.controls
      .reduce((sum, group: any) => sum + (group.get('price').value || 0), 0);
    
    const totalTaxAmount = this.productsFormArray.controls
      .reduce((sum, group: any) => sum + (group.get('taxAmount').value || 0), 0);
      
    const packagingCharges = Number(this.purchaseChallanForm.get('packagingAndForwadingCharges')?.value || 0);
    this.totalAmount = totalPrice;
    this.totalTaxAmount = totalTaxAmount;
    this.grandTotal = totalPrice + totalTaxAmount + packagingCharges;

    this.purchaseChallanForm.patchValue({ 
      price: totalPrice,
      taxAmount: totalTaxAmount,
      totalAmount: this.grandTotal 
    }, { emitEvent: false });
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

  private fetchPurchaseChallanDetails(id: number): void {
    this.purchaseChallanService.getPurchaseChallanDetails(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          if (response.id) {
            this.isEdit = true;
            this.populateForm(response);
          }
        },
        error: (error: any) => {
          this.snackbar.error(error?.error?.message || 'Failed to load purchase challan details');
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

    this.purchaseChallanForm.patchValue({
      customerId: data.customerId,
      id: data.id,
      challanDate: formatDate(new Date(data.challanDate), 'yyyy-MM-dd', 'en'),
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
      
      productGroup.patchValue({
        id: item.id, // Store item ID for updates
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        price: item.price,
        taxPercentage: item.taxPercentage,
        taxAmount: item.taxAmount,
        batchNumber: item.batchNumber,
        remarks: item.remarks
      }, { emitEvent: false });
      this.productsFormArray.push(productGroup);
    });
    this.productControlsForView = Array.from(this.productsFormArray.controls);
    this.cdr.markForCheck();
    this.isEdit = true;

    setTimeout(() => {
      this.viewport?.checkViewportSize();
      this.cdr.markForCheck();
    }, 0);
  }

}

