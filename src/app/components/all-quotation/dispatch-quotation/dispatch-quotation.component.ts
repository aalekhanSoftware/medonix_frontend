import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, FormsModule, AbstractControl } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil, debounceTime, filter, distinctUntilChanged, Subscription } from 'rxjs';
import { formatDate } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { AuthService, UserRole } from '../../../services/auth.service';
import { SaleService } from '../../../services/sale.service';
import { ProductService } from '../../../services/product.service';
import { CustomerService } from '../../../services/customer.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { QuotationService } from '../../../services/quotation.service';
import { SearchableSelectComponent } from "../../../shared/components/searchable-select/searchable-select.component";
import { MatDialogModule } from '@angular/material/dialog';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { TransportMaster, TransportMasterService } from '../../../services/transport-master.service';
import { PackagingChargesModalComponent } from './packaging-charges-modal.component';
import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

@Component({
  standalone: true,
  selector: 'app-dispatch-quotation',
  templateUrl: './dispatch-quotation.component.html',
  styleUrl: './dispatch-quotation.component.scss',
  imports: [SearchableSelectComponent,
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule, MatDialogModule, LoaderComponent, PackagingChargesModalComponent, ScrollingModule]
})
export class DispatchQuotationComponent implements OnInit, OnDestroy {
  quotationForm!: FormGroup;
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
  private itemSubscriptions: Subscription[] = [];
  private lastStatusByIndex: { [index: number]: string } = {};
  private lastCreatedRollByIndex: { [index: number]: number | null } = {};
  private lastQuantityByIndex: { [index: number]: number } = {};
  private selectedQuotationItemIds = new Set<number>();
  private selectedDispatchItemIds = new Set<number>();
  canSeeSaleOption = false;
  showPackagingChargesModal = false;
  private productMap: Map<any, any> = new Map();
  private productMapReady = false;
  private readonly PRODUCT_MAP_SYNC_THRESHOLD = 1000;

  @ViewChild(CdkVirtualScrollViewport) viewport!: CdkVirtualScrollViewport;

  get itemsFormArray() {
    return this.quotationForm.get('items') as FormArray;
  }

  itemControlsForView: AbstractControl[] = [];

  trackByItemIndex(index: number): number {
    return index;
  }

  trackByItemControl(index: number, control: AbstractControl): AbstractControl {
    return control;
  }

  private readonly VIRTUAL_SCROLL_ITEM_SIZE_PX = 52;

  getViewportHeight(): number {
    const rowHeight = this.VIRTUAL_SCROLL_ITEM_SIZE_PX;
    const maxHeight = 750;
    const count = this.itemControlsForView.length;
    if (count === 0) return rowHeight;
    return Math.min(count * rowHeight, maxHeight);
  }

  constructor(
    private fb: FormBuilder,
    private quotationService: QuotationService,
    private productService: ProductService,
    private customerService: CustomerService,
    private transportService: TransportMasterService,
    private snackbar: SnackbarService,
    private encryptionService: EncryptionService,
    private router: Router,
    private dialog: Dialog,
    private cdr: ChangeDetectorRef,
    private saleService: SaleService,
    private authService: AuthService
  ) {
    const today = new Date();
    this.minValidUntilDate = formatDate(today, 'yyyy-MM-dd', 'en');
    this.initForm();
    this.canSeeSaleOption = this.authService.hasAnyRole([UserRole.ADMIN, UserRole.STAFF_ADMIN, UserRole.SALES_AND_MARKETING]);
  }

  ngOnInit() {
    this.loadProducts();
    this.loadCustomers();
    this.loadTransports();
    this.setupCustomerNameSync();
    this.checkForEdit();
  }

  ngOnDestroy() {
    // Unsubscribe from all item subscriptions
    this.itemSubscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    this.itemSubscriptions = [];

    // Complete destroy subject to clean up all takeUntil subscriptions
    this.destroy$.next();
    this.destroy$.complete();

    // Clear Maps and Sets to help with garbage collection
    this.lastStatusByIndex = {};
    this.lastCreatedRollByIndex = {};
    this.lastQuantityByIndex = {};
    this.selectedQuotationItemIds.clear();
    this.selectedDispatchItemIds.clear();

    // Clear arrays to release memory
    this.products = [];
    this.customers = [];
    this.transports = [];
    this.productMap.clear();
    this.productMapReady = false;

    // Reset form to release form subscriptions
    if (this.quotationForm) {
      this.quotationForm.reset();
    }
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
      isProduction: [false],
      transportMasterId: [null, Validators.required],
      caseNumber: [''],
      packagingAndForwadingCharges: [0, [Validators.required, Validators.min(0)]]
    });

    this.addItem(true);
    this.itemControlsForView = Array.from(this.itemsFormArray.controls);
  }

  get isCustomerIdSelected() {
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
    const itemGroup = this.fb.group({
      productId: ['', Validators.required],
      productName: [''],
      productType: [''],
      quantity: [0, [Validators.required, Validators.min(0)]],
      unitPrice: [0, [Validators.required, Validators.min(0.01)]],
      isQuantityManual: [false],
      remarks: [''],
      isDispatch: [false],
      // Dispatch-only additional fields
      isProduction: [false],
      id: [null],
      quotationItemStatus: ['O', Validators.required],
      createdRoll: [null, [Validators.min(0)]],
      // Price-related fields retained for backend compatibility but hidden in UI
      price: [0],
      taxPercentage: [0],
      taxAmount: [0],
      finalPrice: [0],
      quotationDiscountAmount: [0],
      calculations: [[]]
    });

    this.itemsFormArray.push(itemGroup);
    const newIndex = this.itemsFormArray.length - 1;
    const subscription = this.setupItemCalculations(itemGroup, newIndex);
    this.itemSubscriptions.push(subscription);
    this.calculateItemPrice(newIndex, isInitializing);

    this.itemControlsForView = Array.from(this.itemsFormArray.controls);
    this.cdr.markForCheck();
    setTimeout(() => {
      this.viewport?.checkViewportSize();
      const el = this.viewport?.elementRef?.nativeElement as HTMLElement;
      if (el) {
        const maxScroll = el.scrollHeight - el.clientHeight;
        el.scrollTop = Math.max(0, maxScroll);
      }
      this.cdr.markForCheck();
    }, 100);
  }

  removeItem(index: number): void {
    if (this.itemsFormArray.length === 1) return;

    if (this.itemSubscriptions[index]) {
      this.itemSubscriptions[index].unsubscribe();
      this.itemSubscriptions.splice(index, 1);
    }
    this.itemsFormArray.removeAt(index);
    this.itemControlsForView = Array.from(this.itemsFormArray.controls);
    this.cdr.markForCheck();
    setTimeout(() => {
      this.viewport?.checkViewportSize();
      this.cdr.markForCheck();
    }, 0);
  }

  private setupItemCalculations(group: FormGroup, index: number): Subscription {
    const subscription = new Subscription();

    const productIdSub = group.get('productId')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        filter((productId: string) => !!productId),
        debounceTime(100),
        distinctUntilChanged()
      )
      .subscribe(productId => {
        const selectedProduct = this.getProductByValue(productId);
        if (selectedProduct) {
          group.patchValue({
            productType: selectedProduct.type,
            productName: selectedProduct.name,
            taxPercentage: selectedProduct.tax_percentage ?? 0,
            quantity: selectedProduct.quantity || 1
          }, { emitEvent: false });
          group.patchValue({ unitPrice: selectedProduct.sale_amount || 0 }, { emitEvent: true });
        }
      });
    if (productIdSub) subscription.add(productIdSub);

    const quantitySub = group.get('quantity')?.valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(50))
      .subscribe(() => this.markQuantityManual(index));
    subscription.add(quantitySub);

    const valueSub = group.valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(100))
      .subscribe(() => this.calculateItemPrice(index));
    subscription.add(valueSub);

    return subscription;
  }

  private markQuantityManual(index: number) {
    const group = this.itemsFormArray.at(index) as FormGroup;
    if (!group) return;
    if (!group.get('isQuantityManual')?.value) {
      group.patchValue({ isQuantityManual: true }, { emitEvent: false });
    }
  }

  onQuantityEdit(index: number) {
    this.markQuantityManual(index);
    this.calculateItemPrice(index);
  }

  onQuantityFocus(index: number) {
    const group = this.itemsFormArray.at(index) as FormGroup;
    const current = Number(group.get('quantity')?.value || 0);
    this.lastQuantityByIndex[index] = current;
  }

  onQuantityChange(index: number, event: Event) {
    const group = this.itemsFormArray.at(index) as FormGroup;
    if (group.get('isDispatch')?.value === true) {
      // Revert UI change if dispatched
      const prevValue = this.lastQuantityByIndex[index] ?? Number(group.get('quantity')?.value || 0);
      group.patchValue({ quantity: prevValue }, { emitEvent: false });
      this.cdr.detectChanges();
      return;
    }
    const id = group.get('id')?.value;
    const status = group.get('quotationItemStatus')?.value;
    const input = event.target as HTMLInputElement;
    const newValue = Number(Number(input.value).toFixed(3));
    const prevValue = this.lastQuantityByIndex[index] ?? Number(group.get('quantity')?.value || 0);

    // Disallow update when billed
    if (status === 'B') {
      group.patchValue({ quantity: prevValue }, { emitEvent: false });
      this.cdr.detectChanges();
      return;
    }

    if (Number.isNaN(newValue) || newValue < 0) {
      this.snackbar.error('Invalid value for Quantity');
      group.patchValue({ quantity: prevValue }, { emitEvent: false });
      this.cdr.detectChanges();
      return;
    }

    if (!id) {
      // Not yet persisted; only local recalculation
      this.lastQuantityByIndex[index] = newValue;
      this.onQuantityEdit(index);
      return;
    }

    if (newValue === prevValue) {
      return;
    }

    this.quotationService.updateQuotationItemQuantity(id, newValue)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res?.success) {
            this.snackbar.success(res?.message || 'Quantity updated successfully');
            this.lastQuantityByIndex[index] = newValue;
            this.onQuantityEdit(index);
          } else {
            this.snackbar.error(res?.message || 'Failed to update quantity');
            group.patchValue({ quantity: prevValue }, { emitEvent: false });
            this.cdr.detectChanges();
          }
        },
        error: (err) => {
          this.snackbar.error(err?.error?.message || 'Failed to update quantity');
          group.patchValue({ quantity: prevValue }, { emitEvent: false });
          this.cdr.detectChanges();
        }
      });
  }



  private calculateItemPrice(index: number, skipChangeDetection = false): void {
    const group = this.itemsFormArray.at(index) as FormGroup;
    const quantity = Number(Number(group.get('quantity')?.value || 0).toFixed(3));
    const unitPrice = Number(Number(group.get('unitPrice')?.value || 0).toFixed(2));
    const basePrice = Number((quantity * unitPrice).toFixed(2));
    // Keep internal price fields updated for backend, but not shown in UI
    group.patchValue({
      price: basePrice,
      taxAmount: 0,
      finalPrice: basePrice,
      quotationDiscountAmount: 0
    }, { emitEvent: false });
    if (!skipChangeDetection) {
      this.cdr.markForCheck();
    }
  }

  getFormattedPrice(index: number): string {
    const price = this.itemsFormArray.at(index)?.get('price')?.value;
    return price != null ? Number(price).toFixed(2) : '0.00';
  }

  getFormattedFinalPrice(index: number): string {
    const finalPrice = this.itemsFormArray.at(index)?.get('finalPrice')?.value;
    return finalPrice != null ? Number(finalPrice).toFixed(2) : '0.00';
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
      error: () => {
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
      error: () => {
        this.snackbar.error('Failed to refresh products');
        this.isLoadingProducts = false;
        this.cdr.markForCheck();
      }
    });
  }

  private transformProductsWithDisplayName(products: any[]): any[] {
    return products.map(product => ({
      ...product,
      displayName: product.materialName
        ? `${product.name} (${product.materialName})`
        : product.name
    }));
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
      },
      error: () => {
        this.snackbar.error('Failed to load transports');
        this.isLoadingTransports = false;
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
      },
      error: () => {
        this.snackbar.error('Failed to refresh transports');
        this.isLoadingTransports = false;
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
      },
      error: () => {
        this.snackbar.error('Failed to load customers');
        this.isLoadingCustomers = false;
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
      },
      error: () => {
        this.snackbar.error('Failed to refresh customers');
        this.isLoadingCustomers = false;
      }
    });
  }

  onProductSelect(index: number, event: any): void {
    const selectedProduct = this.getProductByValue(event.value);
    if (!selectedProduct) {
      return;
    }
    const itemGroup = this.itemsFormArray.at(index);
    itemGroup.patchValue({
      productId: selectedProduct.id
    }, { emitEvent: true });
  }

  private checkForEdit(): void {
    const encryptedId = localStorage.getItem('editQuotationId');
    console.log('encryptedId >>',encryptedId)
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
            this.populateForm(response.data);
          }
          this.isLoading = false;
          this.loading = false;
        },
        error: () => {
          this.snackbar.error('Failed to load quotation details');
          this.isLoading = false;
          this.loading = false;
          localStorage.removeItem('editQuotationId');
        }
      });
    } catch (error) {
      localStorage.removeItem('editQuotationId');
    }
  }

  async populateForm(data: any) {
    if (!data) return;
    // Clear existing item subscriptions to avoid duplicate subscriptions
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
      transportMasterId: data.transportMasterId || null,
      caseNumber: data.caseNumber || '',
      packagingAndForwadingCharges: data.packagingAndForwadingCharges ?? 0
    });
    if (data.items && Array.isArray(data.items)) {
      data.items.forEach((item: any, idx: number) => {
        const itemGroup = this.fb.group({
          id: [item.id || null],
          productId: [item.productId || '', Validators.required],
          productName: [item.productName || item.product?.name || ''],
          productType: [item.productType || ''],
          quantity: [item.quantity || 1, [Validators.required, Validators.min(1)]],
          unitPrice: [item.unitPrice || 0, [Validators.required, Validators.min(0.01)]],
          remarks: [item.remarks || ''],
          // dispatch extras
          isProduction: [item.isProduction ?? false],
          isDispatch: [item.isDispatch ?? false],
          quotationItemStatus: [item.quotationItemStatus ?? 'O', Validators.required],
          createdRoll: [item.createdRoll ?? null, [Validators.min(0)]],
          // price fields for backend
          price: [item.price || 0],
          taxPercentage: [item.taxPercentage ?? 0],
          taxAmount: [item.taxAmount || 0],
          finalPrice: [item.finalPrice || 0],
          quotationDiscountAmount: [item.quotationDiscountAmount || 0],
          calculations: [item.calculations || []]
        });
        const sub = this.setupItemCalculations(itemGroup, this.itemsFormArray.length);
        this.itemsFormArray.push(itemGroup);
        this.itemSubscriptions.push(sub);
      });
    }
    this.itemControlsForView = Array.from(this.itemsFormArray.controls);
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
    // Single pass over items (same pattern as add-sale) for scale (5000+ items)
    const items = this.itemsFormArray.controls.map((control) => ({
      id: control.get('id')?.value,
      productId: control.get('productId')?.value,
      productName: control.get('productName')?.value,
      productType: control.get('productType')?.value,
      quantity: control.get('quantity')?.value,
      unitPrice: control.get('unitPrice')?.value,
      remarks: control.get('remarks')?.value,
      isProduction: control.get('isProduction')?.value,
      isDispatch: control.get('isDispatch')?.value,
      quotationItemStatus: control.get('quotationItemStatus')?.value,
      createdRoll: control.get('createdRoll')?.value,
      price: control.get('price')?.value,
      taxPercentage: control.get('taxPercentage')?.value,
      taxAmount: control.get('taxAmount')?.value,
      finalPrice: control.get('finalPrice')?.value,
      quotationDiscountAmount: control.get('quotationDiscountAmount')?.value,
      calculations: control.get('calculations')?.value || []
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
      transportMasterId: formValue.transportMasterId,
      caseNumber: formValue.caseNumber,
      packagingAndForwadingCharges: Number(formValue.packagingAndForwadingCharges || 0),
      items
    };
  }

  private setupItemSubscriptions(): void {
    this.itemsFormArray.controls.forEach((control, index) => {
      this.subscribeToItemChanges(control, index);
    });
  }

  private subscribeToItemChanges(control: AbstractControl, index: number): void {
    if (this.itemSubscriptions[index]) {
      this.itemSubscriptions[index].unsubscribe();
    }
    const subscription = control.valueChanges.pipe(
      takeUntil(this.destroy$),
      debounceTime(100),
    ).subscribe(() => {
      this.calculateItemPrice(index);
    });
    this.itemSubscriptions[index] = subscription;

    // We now handle status updates via explicit (change) handler to control revert UX
  }

  onStatusChange(index: number, event: Event) {
    const group = this.itemsFormArray.at(index) as FormGroup;
    const id = group.get('id')?.value;
    if (!id) {
      return;
    }
    const target = event.target as HTMLSelectElement;
    const newStatus = target.value;
    const previousStatus = this.lastStatusByIndex[index] ?? group.get('quotationItemStatus')?.value;

    // If no change, do nothing
    if (previousStatus === newStatus) {
      return;
    }

    // Validate that the status is one of the allowed values
    const validStatuses = ['O', 'IP', 'C', 'B'];
    if (!validStatuses.includes(newStatus)) {
      this.snackbar.error('Invalid status value');
      group.patchValue({ quotationItemStatus: previousStatus }, { emitEvent: false });
      this.cdr.detectChanges();
      return;
    }

    // Enforce forward-only transitions
    const isInvalidTransition =
      (previousStatus === 'IP' && newStatus === 'O') ||
      (previousStatus === 'C' && (newStatus === 'O' || newStatus === 'IP')) ||
      (previousStatus === 'B' && (newStatus === 'O' || newStatus === 'IP' || newStatus === 'C'));

    if (isInvalidTransition) {
      this.snackbar.error('Invalid transition. Status can only move forward.');
      // revert UI selection
      group.patchValue({ quotationItemStatus: previousStatus }, { emitEvent: false });
      this.cdr.detectChanges();
      return;
    }

    // Type assertion after validation
    this.quotationService.updateQuotationItemStatus(id, newStatus as 'O' | 'IP' | 'C' | 'B')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res?.success) {
            this.snackbar.success('Status updated successfully');
            this.lastStatusByIndex[index] = newStatus;
          } else {
            this.snackbar.error(res?.message || 'Failed to update status');
            group.patchValue({ quotationItemStatus: previousStatus }, { emitEvent: false });
            this.cdr.detectChanges();
          }
        },
        error: (err) => {
          this.snackbar.error(err?.error?.message || 'Failed to update status');
          group.patchValue({ quotationItemStatus: previousStatus }, { emitEvent: false });
          this.cdr.detectChanges();
        }
      });
  }

  onStatusFocus(index: number) {
    const group = this.itemsFormArray.at(index) as FormGroup;
    const current = group.get('quotationItemStatus')?.value;
    this.lastStatusByIndex[index] = current;
  }

  onCreatedRollFocus(index: number) {
    const group = this.itemsFormArray.at(index) as FormGroup;
    const val = group.get('createdRoll')?.value;
    const current = (val === null || val === '') ? null : Number(val);
    this.lastCreatedRollByIndex[index] = current;
  }

  onCreatedRollChange(index: number, event: Event) {
    const group = this.itemsFormArray.at(index) as FormGroup;

    const getPrevValue = () => {
      const stored = this.lastCreatedRollByIndex[index];
      if (stored !== undefined) return stored;
      const val = group.get('createdRoll')?.value;
      return (val === null || val === '') ? null : Number(val);
    };

    const prevValue = getPrevValue();

    if (group.get('isDispatch')?.value === true) {
      group.patchValue({ createdRoll: prevValue }, { emitEvent: false });
      this.cdr.detectChanges();
      return;
    }
    const id = group.get('id')?.value;
    if (!id) return;
    const target = event.target as HTMLInputElement;
    const inputValue = target.value;
    const newValue = inputValue === '' ? null : Number(inputValue);

    if (newValue !== null && (Number.isNaN(newValue) || newValue < 0)) {
      this.snackbar.error('Invalid value for Created Roll');
      group.patchValue({ createdRoll: prevValue }, { emitEvent: false });
      this.cdr.detectChanges();
      return;
    }

    const quantity = Number(group.get('quantity')?.value || 0);
    if (newValue !== null && newValue > quantity) {
      this.snackbar.error('Send quantity cannot be greater than Quantity');
      group.patchValue({ createdRoll: prevValue }, { emitEvent: false });
      this.cdr.detectChanges();
      return;
    }

    if (newValue === prevValue) {
      return;
    }

    this.quotationService.updateQuotationItemCreatedRoll(id, newValue as any)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res?.status === 'success' || res?.success) {
            this.snackbar.success('Created roll updated successfully');
            this.lastCreatedRollByIndex[index] = newValue;
          } else {
            this.snackbar.error(res?.message || 'Failed to update created roll');
            group.patchValue({ createdRoll: prevValue }, { emitEvent: false });
            this.cdr.detectChanges();
          }
        },
        error: (err) => {
          this.snackbar.error(err?.error?.message || 'Failed to update created roll');
          group.patchValue({ createdRoll: prevValue }, { emitEvent: false });
          this.cdr.detectChanges();
        }
      });
  }

  onProductionClick(index: number, event: Event) {
    const group = this.itemsFormArray.at(index) as FormGroup;
    const status = group.get('quotationItemStatus')?.value;
    if (status === undefined || status === null || status === '' || status !== 'O') {
      event.preventDefault();
      event.stopPropagation();
      this.snackbar.error('Allowed only when status is Open');
      return false as unknown as void;
    }
  }

  onProductionToggle(index: number) {
    const group = this.itemsFormArray.at(index) as FormGroup;
    const status = group.get('quotationItemStatus')?.value;
    if (status === undefined || status === null || status === '' || status !== 'O') {
      // Disallow changes when not Open; revert UI change just in case
      const current = !!group.get('isProduction')?.value;
      group.patchValue({ isProduction: !current }, { emitEvent: false });
      return;
    }
    const quotationItemId = group.get('id')?.value;
    const isProduction = !!group.get('isProduction')?.value;
    if (!quotationItemId) {
      // Not yet persisted; just ignore API call
      return;
    }
    this.quotationService.updateQuotationItemProductionStatus(quotationItemId, isProduction)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.snackbar.success('Production status updated');
        },
        error: () => {
          this.snackbar.error('Failed to update production status');
          // Revert toggle on error
          group.patchValue({ isProduction: !isProduction }, { emitEvent: false });
          this.cdr.detectChanges();
        }
      });
  }

  onDispatchToggle(index: number) {
    const group = this.itemsFormArray.at(index) as FormGroup;
    const quotationItemId = group.get('id')?.value;
    if (!quotationItemId) {
      return;
    }
    const isDispatch = !!group.get('isDispatch')?.value;
    this.quotationService.updateQuotationItemDispatch(quotationItemId, isDispatch)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.snackbar.success('Dispatch status updated');
        },
        error: () => {
          this.snackbar.error('Failed to update dispatch status');
          group.patchValue({ isDispatch: !isDispatch }, { emitEvent: false });
          this.cdr.detectChanges();
        }
      });
  }

  // Selection helpers for creating sale
  private getQuotationItemIdByIndex(index: number): number | null {
    const group = this.itemsFormArray.at(index) as FormGroup;
    const id = group?.get('id')?.value;
    return typeof id === 'number' ? id : null;
  }

  isSelectable(index: number): boolean {
    const group = this.itemsFormArray.at(index) as FormGroup;
    const status = group?.get('quotationItemStatus')?.value;
    const id = this.getQuotationItemIdByIndex(index);
    return !!id && status !== 'B';
  }

  isSelected(index: number): boolean {
    const id = this.getQuotationItemIdByIndex(index);
    if (!id) return false;
    return this.selectedQuotationItemIds.has(id);
  }

  toggleSelection(index: number, event: Event): void {
    const id = this.getQuotationItemIdByIndex(index);
    if (!id) return;
    const input = event.target as HTMLInputElement;
    if (input.checked) {
      this.selectedQuotationItemIds.add(id);
    } else {
      this.selectedQuotationItemIds.delete(id);
    }
  }

  hasSelection(): boolean {
    return this.selectedQuotationItemIds.size > 0;
  }

  hasDispatchSelection(): boolean {
    return this.selectedDispatchItemIds.size > 0;
  }

  isDispatchSelected(index: number): boolean {
    const id = this.getQuotationItemIdByIndex(index);
    if (!id) return false;
    return this.selectedDispatchItemIds.has(id);
  }

  toggleDispatchSelection(index: number, event: Event): void {
    const id = this.getQuotationItemIdByIndex(index);
    if (!id) return;
    const input = event.target as HTMLInputElement;
    if (input.checked) {
      this.selectedDispatchItemIds.add(id);
    } else {
      this.selectedDispatchItemIds.delete(id);
    }
  }

  createDispatchSlip(): void {
    const ids = Array.from(this.selectedDispatchItemIds);
    if (!ids.length) {
      this.snackbar.error('Please select at least one item for dispatch');
      return;
    }
    if (!this.quotationId) {
      this.snackbar.error('Quotation ID not found');
      return;
    }
    this.isLoading = true;
    this.quotationService.generateDispatchPdf(this.quotationId, ids)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: { blob: Blob; filename: string }) => {
          const url = window.URL.createObjectURL(response.blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = response.filename;
          link.click();
          window.URL.revokeObjectURL(url);
          this.snackbar.success('Dispatch slip generated successfully');
          this.isLoading = false;
        },
        error: (err) => {
          this.snackbar.error(err?.error?.message || 'Failed to generate dispatch slip');
          this.isLoading = false;
        }
      });
  }

  createSaleFromSelected(): void {
    const ids = Array.from(this.selectedQuotationItemIds);
    if (!ids.length) {
      this.snackbar.error('Please select at least one item');
      return;
    }
    
    // Show modal to get packaging and forwarding charges for sale
    // Note: This is separate from quotation's packagingAndForwadingCharges
    this.showPackagingChargesModal = true;
  }

  onPackagingChargesConfirm(data: number | { id: number; invoiceNumber: string; packagingAndForwadingCharges: number }): void {
    this.showPackagingChargesModal = false;
    const ids = Array.from(this.selectedQuotationItemIds);
    
    // Extract charges - handle both number (backward compatibility) and object (new format)
    const charges = typeof data === 'number' ? data : data.packagingAndForwadingCharges;
    
    // Create sale with the packaging charges entered in modal
    // This is separate from the quotation's packagingAndForwadingCharges
    this.isLoading = true;
    this.saleService.createFromQuotationItems(ids, charges)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          if (res?.success) {
            this.snackbar.success(res?.message || 'Sale created successfully');
            this.selectedQuotationItemIds.clear();
          } else {
            this.snackbar.error(res?.message || 'Failed to create sale');
          }
          this.isLoading = false;
          this.initForm();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.snackbar.error(err?.error?.message || 'Failed to create sale');
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      });
  }

  onPackagingChargesCancel(): void {
    this.showPackagingChargesModal = false;
  }
}


