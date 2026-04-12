import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ViewChild, ViewChildren, QueryList, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, ValidatorFn, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { formatDate } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

import { ProductService } from '../../../services/product.service';
import { PurchaseOrderService } from '../../../services/purchase-order.service';
import { CustomerService } from '../../../services/customer.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { PackagingChargesModalComponent } from '../../all-quotation/dispatch-quotation/packaging-charges-modal.component';

interface ProductForm {
  id?: number | null;
  productId: string;
  quantity: number;
  getQuantity?: number | null | string;
  unitPrice: number;
  price: number;
  taxPercentage: number;
  taxAmount: number;
  remarks: string
}

@Component({
  selector: 'app-add-purchase-order',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    ScrollingModule,
    LoaderComponent,
    SearchableSelectComponent,
    PackagingChargesModalComponent
  ],
  templateUrl: './add-purchase-order.component.html',
  styleUrls: ['./add-purchase-order.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddPurchaseOrderComponent implements OnInit, OnDestroy {
  purchaseOrderForm!: FormGroup;
  products: any[] = [];
  customers: any[] = [];
  loading = false;
  isLoadingProducts = false;
  isLoadingCustomers = false;
  isEdit = false;
  private destroy$ = new Subject<void>();
  private formReinit$ = new Subject<void>();
  private productSubscriptions: Subscription[] = [];
  private selectedItemIds = new Set<number>();
  showPackagingChargesModal = false;
  /**
   * Linked purchases for this Purchase Order (from detail response).
   * Source of truth: `purchaseIds` array from backend.
   */
  linkedPurchaseIds: number[] = [];
  private productMap: Map<any, any> = new Map();
  private productMapReady = false;
  private readonly PRODUCT_MAP_SYNC_THRESHOLD = 1000;
  totalAmount = 0;
  totalTaxAmount = 0;
  grandTotal = 0;
  private isPopulatingForm = false; // Flag to prevent recalculation during form population

  @ViewChild(CdkVirtualScrollViewport) viewport!: CdkVirtualScrollViewport;
  @ViewChildren(SearchableSelectComponent) searchableSelects!: QueryList<SearchableSelectComponent>;

  get productsFormArray() {
    return this.purchaseOrderForm.get('products') as FormArray;
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

  private getItemPurchaseIdsByIndex(index: number): number[] {
    const group = this.productsFormArray.at(index) as FormGroup | null;
    const value = group?.get('purchaseIds')?.value;
    return Array.isArray(value) ? value : [];
  }

  private getItemPurchaseItemIdsByIndex(index: number): number[] {
    const group = this.productsFormArray.at(index) as FormGroup | null;
    const value = group?.get('purchaseItemIds')?.value;
    return Array.isArray(value) ? value : [];
  }

  getItemPurchaseIds(index: number): number[] {
    return this.getItemPurchaseIdsByIndex(index);
  }

  getItemPurchaseItemIds(index: number): number[] {
    return this.getItemPurchaseItemIdsByIndex(index);
  }

  hasItemPurchaseLink(index: number): boolean {
    return this.getItemPurchaseIdsByIndex(index).length > 0;
  }

  isConvertibleItem(index: number): boolean {
    if (!this.isEdit) return false;
    const group = this.productsFormArray.at(index) as FormGroup;
    const itemId = group?.get('id')?.value;
    // Only saved items can be converted, and only if not already linked.
    return !!itemId && !this.hasItemPurchaseLink(index);
  }

  hasConvertibleItems(): boolean {
    return this.productsFormArray.controls.some((_, idx) => this.isConvertibleItem(idx));
  }

  constructor(
    private fb: FormBuilder,
    private productService: ProductService,
    private customerService: CustomerService,
    private purchaseOrderService: PurchaseOrderService,
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
    
    const encryptedId = localStorage.getItem('purchaseOrderId');
    if (encryptedId) {
      const purchaseOrderId = this.encryptionService.decrypt(encryptedId);
      if (purchaseOrderId) {
        this.fetchPurchaseOrderDetails(Number(purchaseOrderId));
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
    this.formReinit$.next();
    this.formReinit$.complete();

    // Clear arrays to release memory
    this.products = [];
    this.customers = [];
    this.selectedItemIds.clear();

    // Reset form to release form subscriptions
    if (this.purchaseOrderForm) {
      this.purchaseOrderForm.reset();
    }
    this.productMap.clear();
    this.productMapReady = false;
  }

  private initForm() {
    // Re-init boundary: cleanup previous form subscriptions
    this.formReinit$.next();

    this.purchaseOrderForm = this.fb.group({
      id: [null],
      customerId: ['', Validators.required],
      purchaseId: [null], // Optional: append PO items into an existing Purchase
      orderDate: [formatDate(new Date(), 'yyyy-MM-dd', 'en'), Validators.required],
      invoiceNumber: [null],
      packagingAndForwadingCharges: [0, [Validators.required, Validators.min(0)]],
      products: this.fb.array([])
    });

    this.purchaseOrderForm.get('packagingAndForwadingCharges')?.valueChanges
      .pipe(takeUntil(this.destroy$), takeUntil(this.formReinit$), debounceTime(300))
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
      getQuantity: [null, [this.getQuantityValidator()]],
      unitPrice: ['', [Validators.required, Validators.min(0.01)]],
      price: [{ value: 0, disabled: true }],
      taxPercentage: [{ value: 0, disabled: true }],
      taxAmount: [{ value: 0, disabled: true }],
      remarks:[null, []],
      // New linkage arrays from backend (source of truth)
      purchaseIds: [[] as number[]],
      purchaseItemIds: [[] as number[]]
    });
  }

  addProduct(): void {
    const productGroup = this.createProductFormGroup();
    const prevProductId = this.productsFormArray.length > 0
      ? this.productsFormArray.at(this.productsFormArray.length - 1).get('productId')?.value
      : '';
    productGroup.patchValue({ productId: prevProductId ?? '' }, { emitEvent: false });
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
    const compositeSubscription = new Subscription();

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
          }
        }
      });

    // Keep getQuantity in sync with quantity for validation
    const quantityControl = group.get('quantity');
    const quantitySubscription = quantityControl?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        group.get('getQuantity')?.updateValueAndValidity({ emitEvent: false });
      });

    // Listen to quantity and unitPrice changes
    const valueSubscription = group.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(150)
      )
      .subscribe(() => {
        this.calculateProductPrice(group);
      });
    
    if (productIdSubscription) {
      compositeSubscription.add(productIdSubscription);
    }
    if (quantitySubscription) {
      compositeSubscription.add(quantitySubscription);
    }
    compositeSubscription.add(valueSubscription);
    
    return compositeSubscription;
  }

  private calculateProductPrice(group: FormGroup): void {
    if (!group) return;
    
    // Skip recalculation if we're currently populating the form from API data
    if (this.isPopulatingForm) return;

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
    const packagingCharges = Number(this.purchaseOrderForm.get('packagingAndForwadingCharges')?.value || 0);
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
    const field = this.purchaseOrderForm.get(fieldName);
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
    this.linkedPurchaseIds = [];
    this.selectedItemIds.clear();
    this.purchaseOrderForm.patchValue({ id: null });
    this.initForm();
  }

  onSubmit() {
    this.markFormGroupTouched(this.purchaseOrderForm);
    
    if (this.purchaseOrderForm.valid) {
      this.loading = true;
      this.cdr.markForCheck(); // Show loader immediately
      
      const formData = this.preparePurchaseOrderData();
      
      const serviceCall = this.isEdit 
        ? this.purchaseOrderService.updatePurchaseOrder(formData)
        : this.purchaseOrderService.createPurchaseOrder(formData);
      
      serviceCall
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response: any) => {
            if (response?.success) {
              this.snackbar.success(`Purchase Order ${this.isEdit ? 'updated' : 'created'} successfully`);
              localStorage.removeItem('purchaseOrderId');
              this.router.navigate(['/purchase-order']);
            } else {
              // Backend may return a 200 with success=false (e.g., invalid purchaseId)
              this.snackbar.error(response?.message || `Failed to ${this.isEdit ? 'update' : 'create'} purchase order`);
            }
            this.loading = false;
            this.cdr.markForCheck();
          },
          error: (error) => {
            this.snackbar.error(error?.error?.message || `Failed to ${this.isEdit ? 'update' : 'create'} purchase order`);
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

  private preparePurchaseOrderData() {
    const formValue = this.purchaseOrderForm.getRawValue();
    const purchaseId =
      formValue.purchaseId === null || formValue.purchaseId === undefined || formValue.purchaseId === ''
        ? null
        : Number(formValue.purchaseId);
    const data: any = {
      orderDate: formatDate(formValue.orderDate, 'dd-MM-yyyy', 'en'),
      customerId: formValue.customerId,
      purchaseId: purchaseId,
      invoiceNumber: formValue.invoiceNumber,
      packagingAndForwadingCharges: Number(formValue.packagingAndForwadingCharges || 0),
      products: formValue.products.map((product: ProductForm, index: number) => {
        const itemId = this.productsFormArray.at(index).get('id')?.value;
        const item: any = {
          productId: Number(product.productId),
          quantity: Number(product.quantity),
          unitPrice: Number(product.unitPrice),
          getQuantity: product.getQuantity === null || product.getQuantity === undefined || product.getQuantity === '' 
            ? null 
            : Number(product.getQuantity),
          remarks: product.remarks || ''
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
      
    const packagingCharges = Number(this.purchaseOrderForm.get('packagingAndForwadingCharges')?.value || 0);
    this.totalAmount = totalPrice;
    this.totalTaxAmount = totalTaxAmount;
    this.grandTotal = totalPrice + totalTaxAmount + packagingCharges;

    this.purchaseOrderForm.patchValue({ 
      price: totalPrice,
      taxAmount: totalTaxAmount,
      totalAmount: this.grandTotal 
    }, { emitEvent: false });
  }

  getFormattedPrice(index: number): string {
    const price = this.productsFormArray.at(index).get('price')?.value;
    return price ? price.toFixed(2) : '0.00';
  }

  getFormattedTaxAmount(index: number): string {
    const taxAmount = this.productsFormArray.at(index).get('taxAmount')?.value;
    return taxAmount ? taxAmount.toFixed(2) : '0.00';
  }

  private fetchPurchaseOrderDetails(id: number, setLoading: boolean = false): void {
    if (setLoading) {
      this.loading = true;
      this.cdr.markForCheck();
    }
    this.purchaseOrderService.getPurchaseOrderDetails(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          if (response.id) {
            this.isEdit = true;
            this.populateForm(response);
          }
          if (setLoading) {
            this.loading = false;
            this.cdr.markForCheck();
          }
        },
        error: (error: any) => {
          this.snackbar.error(error?.error?.message || 'Failed to load purchase order details');
          if (setLoading) {
            this.loading = false;
            this.cdr.markForCheck();
          }
        }
      });
  }

  private populateForm(data: any): void {
    // Set flag to prevent recalculation during population
    this.isPopulatingForm = true;
    
    // Clear existing subscriptions before repopulating
    this.productSubscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    this.productSubscriptions = [];

    this.purchaseOrderForm.patchValue({
      customerId: data.customerId,
      id: data.id,
      orderDate: formatDate(new Date(data.orderDate), 'yyyy-MM-dd', 'en'),
      invoiceNumber: data.invoiceNumber,
      packagingAndForwadingCharges: data.packagingAndForwadingCharges || 0,
      purchaseId: null
    }, { emitEvent: false });

    // New backend linkage (source of truth)
    this.linkedPurchaseIds = Array.isArray(data.purchaseIds) ? data.purchaseIds : [];

    // Clear existing products
    this.productsFormArray.clear();

    // Populate products - handle both 'products' and 'items' from API response
    // Use exact API values instead of recalculating
    const productsArray = data.products || data.items || [];
    productsArray.forEach((item: any) => {
      const productGroup = this.createProductFormGroup();
      
      // Use exact values from API response (source of truth)
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || 0);
      // Use API price directly - don't recalculate
      const price = Number(item.price || 0);
      const taxPercentage = Number(item.taxPercentage || 0);
      // Use API taxAmount directly - don't recalculate
      const taxAmount = Number(item.taxAmount || 0);
      
      // Patch values without triggering calculations
      productGroup.patchValue({
        id: item.id, // Store item ID for updates
        productId: item.productId,
        quantity: quantity,
        getQuantity: item.getQuantity ?? null,
        unitPrice: unitPrice,
        price: price, // Use exact API value
        taxPercentage: taxPercentage,
        taxAmount: taxAmount, // Use exact API value
        remarks: item.remarks || '',
        purchaseIds: Array.isArray(item.purchaseIds) ? item.purchaseIds : [],
        purchaseItemIds: Array.isArray(item.purchaseItemIds) ? item.purchaseItemIds : []
      }, { emitEvent: false });

      // Disable per-item when it has any purchase linkage
      const itemPurchaseIds = Array.isArray(item.purchaseIds) ? item.purchaseIds : [];
      if (itemPurchaseIds.length > 0) {
        productGroup.get('productId')?.disable({ emitEvent: false });
        productGroup.get('quantity')?.disable({ emitEvent: false });
        productGroup.get('unitPrice')?.disable({ emitEvent: false });
        productGroup.get('remarks')?.disable({ emitEvent: false });
      }

      // Setup calculations AFTER patching values to prevent recalculation during population
      const subscription = this.setupProductCalculations(productGroup);
      this.productSubscriptions.push(subscription);

      this.productsFormArray.push(productGroup);
    });

    this.productControlsForView = Array.from(this.productsFormArray.controls);
    this.isEdit = true;
    // Calculate totals from the exact API values
    this.calculateTotalAmount();

    // Reset flag after population is complete
    this.isPopulatingForm = false;
    this.cdr.markForCheck();

    setTimeout(() => {
      this.viewport?.checkViewportSize();
      this.cdr.markForCheck();
    }, 0);
  }

  // Selection helpers for converting to purchase
  private getItemIdByIndex(index: number): number | null {
    const group = this.productsFormArray.at(index) as FormGroup;
    const id = group?.get('id')?.value;
    return typeof id === 'number' ? id : null;
  }

  isSelected(index: number): boolean {
    const id = this.getItemIdByIndex(index);
    if (!id) return false;
    return this.selectedItemIds.has(id);
  }

  toggleSelection(index: number, event: Event): void {
    if (!this.isConvertibleItem(index)) {
      return;
    }
    const id = this.getItemIdByIndex(index);
    if (!id) return;
    const input = event.target as HTMLInputElement;
    if (input.checked) {
      this.selectedItemIds.add(id);
    } else {
      this.selectedItemIds.delete(id);
    }
  }

  hasSelection(): boolean {
    return this.selectedItemIds.size > 0;
  }

  convertToPurchase(): void {
    const orderId = this.purchaseOrderForm.get('id')?.value;
    if (!orderId) {
      this.snackbar.error('Purchase order ID not found');
      return;
    }

    // Check if any items are selected
    if (!this.hasSelection()) {
      this.snackbar.error('Please select at least one item to convert to purchase');
      return;
    }

    // Show packaging charges modal before converting (as per requirement, matching dispatch-quotation behavior)
    this.showPackagingChargesModal = true;
  }

  onPackagingChargesConfirm(data: number | { id: number; invoiceNumber: string; packagingAndForwadingCharges: number; purchaseId?: number | null }): void {
    this.showPackagingChargesModal = false;
    
    // Get selected item IDs
    const purchaseOrderItemIds = Array.from(this.selectedItemIds);
    
    if (purchaseOrderItemIds.length === 0) {
      this.snackbar.error('Please select at least one item to convert to purchase');
      return;
    }
    
    // Handle both number (backward compatibility) and object (new format with invoice number)
    let requestBody: { id: number; invoiceNumber?: string; packagingAndForwadingCharges: number; purchaseOrderItemIds: number[]; purchaseId?: number | null };
    
    if (typeof data === 'object' && data.id !== undefined) {
      // New format: object with id, invoiceNumber (from user input), and packagingAndForwadingCharges
      // If purchaseId is provided, store it in the form (for future create/update flows).
      if (data.purchaseId !== undefined) {
        this.purchaseOrderForm.get('purchaseId')?.setValue(data.purchaseId ?? null, { emitEvent: false });
      }
      requestBody = {
        id: data.id,
        invoiceNumber: data.invoiceNumber,
        packagingAndForwadingCharges: data.packagingAndForwadingCharges,
        purchaseOrderItemIds: purchaseOrderItemIds,
        ...(data.purchaseId !== undefined ? { purchaseId: data.purchaseId ?? null } : {})
      };
    } else {
      // Fallback: use form values if number is passed (shouldn't happen but for safety)
      const orderId = this.purchaseOrderForm.get('id')?.value;
      const invoiceNumber = this.purchaseOrderForm.get('invoiceNumber')?.value;
      
      if (!orderId) {
        this.snackbar.error('Purchase order ID not found');
        return;
      }

      requestBody = {
        id: orderId,
        invoiceNumber: invoiceNumber || '',
        packagingAndForwadingCharges: typeof data === 'number' ? data : 0,
        purchaseOrderItemIds: purchaseOrderItemIds
      };
    }

    if (!requestBody.id) {
      this.snackbar.error('Purchase order ID not found');
      return;
    }

    this.loading = true;
    this.cdr.markForCheck();

    this.purchaseOrderService.convertToPurchase(requestBody)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          if (response?.success) {
            this.snackbar.success(response?.message || 'Purchase order converted to purchase successfully');
            if (response?.data?.purchaseId) {
              const purchaseId = Number(response.data.purchaseId);
              if (Number.isFinite(purchaseId) && !this.linkedPurchaseIds.includes(purchaseId)) {
                this.linkedPurchaseIds = [...this.linkedPurchaseIds, purchaseId];
              }
            }
            // Clear selections after successful conversion
            this.selectedItemIds.clear();
            // Refresh the component to reload purchase order details with updated purchaseIds/purchaseItemIds
            this.fetchPurchaseOrderDetails(requestBody.id, true);
          } else {
            this.snackbar.error(response?.message || 'Failed to convert purchase order to purchase');
            this.loading = false;
            this.cdr.markForCheck();
          }
        },
        error: (error: any) => {
          this.snackbar.error(error?.error?.message || 'Failed to convert purchase order to purchase');
          this.loading = false;
          this.cdr.markForCheck();
        }
      });
  }

  onPackagingChargesCancel(): void {
    this.showPackagingChargesModal = false;
  }

  private disableProductFormControls(): void {
    // Disable all product form controls (utility).
    this.productsFormArray.controls.forEach((control) => {
      const productGroup = control as FormGroup;
      productGroup.get('productId')?.disable();
      productGroup.get('quantity')?.disable();
      productGroup.get('unitPrice')?.disable();
      productGroup.get('remarks')?.disable();
    });
  }

  onGetQuantityFocus(index: number): void {
    const control = this.productsFormArray.at(index).get('getQuantity');
    if (control && control.value === null) {
      control.setValue('', { emitEvent: false });
    }
  }

  onGetQuantityChange(index: number, event: Event): void {
    const control = this.productsFormArray.at(index).get('getQuantity');
    const quantity = Number(this.productsFormArray.at(index).get('quantity')?.value || 0);
    const input = event.target as HTMLInputElement;
    const rawValue = input.value;

    if (!rawValue) {
      control?.setValue(null, { emitEvent: false });
      control?.updateValueAndValidity();
      this.syncGetQuantityToServer(index, null);
      return;
    }

    const value = Number(rawValue);
    if (isNaN(value) || value < 0) {
      control?.setValue(0, { emitEvent: false });
      control?.updateValueAndValidity();
      this.syncGetQuantityToServer(index, 0);
      return;
    }

    // if (value > quantity) {
    //   control?.setValue(quantity, { emitEvent: false });
    //   control?.updateValueAndValidity();
    //   this.snackbar.warning('Get Quantity cannot exceed Quantity');
    //   this.syncGetQuantityToServer(index, quantity);
    //   return;
    // }

    control?.setValue(value, { emitEvent: false });
    control?.updateValueAndValidity();
    this.syncGetQuantityToServer(index, value);
  }

  private syncGetQuantityToServer(index: number, getQuantity: number | null): void {
    const group = this.productsFormArray.at(index) as FormGroup;
    if (!this.isEdit) return;

    const itemId = group.get('id')?.value;
    if (!itemId) return;

    this.purchaseOrderService.updatePurchaseOrderItemGetQuantity({
      id: itemId,
      getQuantity: getQuantity === null ? null : Number(getQuantity)
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          if (response?.success === false) {
            this.snackbar.error(response?.message || 'Failed to update Get Quantity');
          }
        },
        error: () => {
          this.snackbar.error('Failed to update Get Quantity');
        }
      });
  }

  private getQuantityValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      // Allow null, undefined, or empty
      if (value === null || value === undefined || value === '') {
        return null;
      }
      const num = typeof value === 'number' ? value : Number(value);
      if (!Number.isNaN(num) && num < 0) {
        return { min: true };
      }
      return null;
    };
  }
}
