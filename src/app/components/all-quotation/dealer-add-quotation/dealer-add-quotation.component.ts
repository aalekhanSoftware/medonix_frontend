import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild, ViewChildren, QueryList, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, AbstractControl } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil, Subscription, debounceTime, filter, distinctUntilChanged, finalize } from 'rxjs';
import { formatDate } from '@angular/common';
import { ProductService } from '../../../services/product.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { QuotationService } from '../../../services/quotation.service';
import { PriceService } from '../../../services/price.service';
import { SearchableSelectComponent } from "../../../shared/components/searchable-select/searchable-select.component";
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

@Component({
  standalone: true,
  selector: 'app-dealer-add-quotation',
  templateUrl: './dealer-add-quotation.component.html',
  styleUrls: ['./dealer-add-quotation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    SearchableSelectComponent,
    LoaderComponent,
    ScrollingModule
  ]
})
export class DealerAddQuotationComponent implements OnInit, OnDestroy {
  quotationForm!: FormGroup;
  products: any[] = [];
  loading = false;
  isLoadingProducts = false;
  private destroy$ = new Subject<void>();
  isLoading = false;
  isLoadingPrices: { [key: number]: boolean } = {};
  private productPriceCache: Map<string, number> = new Map();
  private productMap: Map<any, any> = new Map();

  totals: { price: number; tax: number; finalPrice: number; taxPercentage: number } = {
    price: 0,
    tax: 0,
    finalPrice: 0,
    taxPercentage: 0
  };

  private itemSubscriptions: Subscription[] = [];

  @ViewChild(CdkVirtualScrollViewport) viewport!: CdkVirtualScrollViewport;
  @ViewChildren(SearchableSelectComponent) searchableSelects!: QueryList<SearchableSelectComponent>;

  get itemsFormArray() {
    return this.quotationForm.get('items') as FormArray;
  }

  /** New array reference on each add/remove so cdkVirtualFor detects changes; keeps DOM to visible rows only. */
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

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.altKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      this.addItem();
    }
  }

  constructor(
    private fb: FormBuilder,
    private quotationService: QuotationService,
    private productService: ProductService,
    private priceService: PriceService,
    private snackbar: SnackbarService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.initForm();
  }

  ngOnInit() {
    this.loadProducts();
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

    // Clear arrays and maps to release memory
    this.products = [];
    this.productPriceCache.clear();
    this.productMap.clear();

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
      quoteDate: [formatDate(today, 'yyyy-MM-dd', 'en')],
      validUntil: [formatDate(validUntil, 'yyyy-MM-dd', 'en')],
      remarks: [''],
      items: this.fb.array([])
    });

    this.addItem(true);
    this.itemControlsForView = Array.from(this.itemsFormArray.controls);
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
    selects[selects.length - 1].focus();
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
      unitPrice: [0],
      remarks: [''],
      price: [0],
      taxPercentage: [5],
      taxAmount: [0],
      finalPrice: [0],
      calculations: [[]]
    });

    // Add to form array first so indexing (if needed anywhere else) is correct
    this.itemsFormArray.push(itemGroup);
    const newIndex = this.itemsFormArray.length - 1;

    // Setup logic returning subscription
    const subscription = this.setupItemCalculations(itemGroup, newIndex);
    this.itemSubscriptions.push(subscription);

    if (prevProductId) {
      itemGroup.get('productId')?.setValue(prevProductId, { emitEvent: true });
    }

    this.calculateItemPrice(newIndex, isInitializing);
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
        const selectedProduct = this.productMap.get(productId);
        if (selectedProduct) {
          this.setProductPrice(index, selectedProduct);
        }
      });
    if (productIdSub) subscription.add(productIdSub);

    const valueSub = group.valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(150))
      .subscribe(() => this.calculateItemPrice(index));
    subscription.add(valueSub);

    return subscription;
  }

  private setProductPrice(index: number, selectedProduct: any): void {
    const itemGroup = this.itemsFormArray.at(index);

    const taxPercentage = selectedProduct.taxPercentage !== undefined ?
      selectedProduct.taxPercentage : 5;

    // Set product type and tax percentage immediately
    itemGroup.patchValue({
      productType: selectedProduct.type,
      taxPercentage: taxPercentage,
      quantity: selectedProduct.quantity || 1
    }, { emitEvent: false });

    // Fetch customer price from API (for DEALER role, customerId is auto-resolved)
    this.fetchCustomerPrice(index, selectedProduct.id);
  }

  private fetchCustomerPrice(index: number, productId: number): void {
    this.isLoadingPrices[index] = true;
    
    // For DEALER role, customerId is auto-resolved by backend, so we don't pass it
    const cacheKey = `dealer-${productId}`;
    
    // Check cache first
    if (this.productPriceCache.has(cacheKey)) {
      const cachedPrice = this.productPriceCache.get(cacheKey)!;
      const itemGroup = this.itemsFormArray.at(index);
      
      itemGroup.patchValue({
        unitPrice: cachedPrice
      }, { emitEvent: true });
      
      this.isLoadingPrices[index] = false;
      this.calculateItemPrice(index);
      this.cdr.markForCheck();
      return;
    }
    
    const requestData = {
      productId: productId
      // customerId is not passed for DEALER role - backend auto-resolves it
    };

    this.priceService.getCustomerPrice(requestData)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoadingPrices[index] = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            const price = response.data.price || 0;
            
            // Cache the price
            this.productPriceCache.set(cacheKey, price);
            
            const itemGroup = this.itemsFormArray.at(index);
            itemGroup.patchValue({
              unitPrice: price
            }, { emitEvent: true });

            this.calculateItemPrice(index);
          } else {
            // Fallback to product saleAmount if API fails
            this.setFallbackPrice(index);
          }
        },
        error: (error) => {
          // Fallback to product saleAmount if API fails
          this.setFallbackPrice(index);
        }
      });
  }

  private setFallbackPrice(index: number): void {
    const itemGroup = this.itemsFormArray.at(index);
    const productId = itemGroup.get('productId')?.value;
    const selectedProduct = this.productMap.get(productId);

    if (selectedProduct) {
      const unitPrice = selectedProduct.saleAmount ?? selectedProduct.sale_amount ?? 0;
      itemGroup.patchValue({
        unitPrice: unitPrice
      }, { emitEvent: false });

      this.calculateItemPrice(index);
      this.cdr.markForCheck();
    }
  }

  calculateItemPrice(index: number, skipChangeDetection = false): void {
    const group = this.itemsFormArray.at(index) as FormGroup;

    const values = {
      quantity: Number(Number(group.get('quantity')?.value || 0).toFixed(3)),
      unitPrice: Number(Number(group.get('unitPrice')?.value || 0).toFixed(2)),
      taxPercentage: Number(group.get('taxPercentage')?.value ?? 5)
    };

    const basePrice = Number((values.quantity * values.unitPrice).toFixed(2));
    const taxAmount = Number(((basePrice * values.taxPercentage) / 100).toFixed(2));
    const finalPrice = Number((basePrice + taxAmount).toFixed(2));

    group.patchValue({
      price: basePrice,
      taxAmount: taxAmount,
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
    return Math.round(itemsTotal);
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
      this.productMap.set(product.id, product);
    }
  }

  private loadProducts(): void {
    this.isLoadingProducts = true;
    this.productService.getProducts({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.products = this.transformProductsWithDisplayName(response.data);
            this.buildProductMap();
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
            this.buildProductMap();
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

  private calculateTotalAmount(): void {
    // Memory optimization: single pass with reduce (same pattern as add-sale), cache in properties
    const controls = this.itemsFormArray.controls;
    const sums = controls.reduce(
      (acc, group: AbstractControl) => {
        const price = Number(Number(group.get('price')?.value || 0).toFixed(2));
        const finalPrice = Number(Number(group.get('finalPrice')?.value || 0).toFixed(2));
        const taxAmount = Number(Number(group.get('taxAmount')?.value || 0).toFixed(2));
        return {
          price: Number((acc.price + price).toFixed(2)),
          tax: Number((acc.tax + taxAmount).toFixed(2)),
          finalPrice: Number((acc.finalPrice + finalPrice).toFixed(2)),
          taxPercentage: Number(group.get('taxPercentage')?.value ?? 5)
        };
      },
      { price: 0, tax: 0, finalPrice: 0, taxPercentage: 0 }
    );
    this.totals = sums;
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

  resetForm(): void {
    const today = new Date();
    const validUntil = new Date();
    validUntil.setDate(today.getDate() + 7);

    this.quotationForm.reset({
      quoteDate: formatDate(today, 'yyyy-MM-dd', 'en'),
      validUntil: formatDate(validUntil, 'yyyy-MM-dd', 'en'),
      remarks: ''
    });

    this.itemSubscriptions.forEach(sub => sub?.unsubscribe());
    this.itemSubscriptions = [];
    while (this.itemsFormArray.length) {
      this.itemsFormArray.removeAt(0);
    }
    this.addItem();
    this.itemControlsForView = Array.from(this.itemsFormArray.controls);

    this.calculateTotalAmount();
    this.cdr.markForCheck();
  }

  isItemFieldInvalid(index: number, fieldName: string): boolean {
    const control = this.itemsFormArray.at(index).get(fieldName);
    if (!control) return false;

    const isInvalid = control.invalid && (control.dirty || control.touched);

    if (isInvalid) {
      const errors = control.errors;
      if (errors) {
        if (errors['required']) return true;
        if (errors['min'] && (fieldName === 'quantity')) return true;
      }
    }

    return false;
  }

  onProductSelect(index: number, event: any): void {
    const selectedProduct = this.productMap.get(event.value);
    if (!selectedProduct) {
      return;
    }

    const itemGroup = this.itemsFormArray.at(index);
    itemGroup.patchValue({
      productId: selectedProduct.id
    }, { emitEvent: true });
  }

  onSubmit(): void {
    if (this.quotationForm.valid) {
      this.isLoading = true;
      const formData = this.prepareFormData();

      this.quotationService.createQuotation(formData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response: any) => {
            if (response.success) {
              this.snackbar.success('Dealer order created successfully');
              this.quotationForm.reset();
              this.router.navigate(['/quotation']);
            }
            this.isLoading = false;
          },
          error: (error: any) => {
            this.snackbar.error(error?.error?.message || 'Failed to create dealer order');
            this.isLoading = false;
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
      productType: control.get('productType')?.value,
      quantity: control.get('quantity')?.value,
      unitPrice: control.get('unitPrice')?.value,
      remarks: control.get('remarks')?.value,
      price: control.get('price')?.value,
      taxPercentage: control.get('taxPercentage')?.value,
      taxAmount: control.get('taxAmount')?.value,
      finalPrice: control.get('finalPrice')?.value,
      quotationDiscountAmount: 0,
      calculations: control.get('calculations')?.value || []
    }));

    return {
      quoteDate: formatDate(formValue.quoteDate, 'yyyy-MM-dd', 'en'),
      validUntil: formatDate(formValue.validUntil, 'yyyy-MM-dd', 'en'),
      remarks: formValue.remarks,
      termsConditions: '',
      quotationDiscountPercentage: 0,
      packagingAndForwadingCharges: 0,
      items
    };
  }

  private setupItemSubscriptions(): void {
    this.itemsFormArray.controls.forEach((control, index) => {
      if (!this.itemSubscriptions[index]) {
        const subscription = this.setupItemCalculations(control as FormGroup, index);
        this.itemSubscriptions[index] = subscription;
      }
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

    if (deltaX > 10 || deltaY > 10) {
      this.isTouchScrolling = true;
    }
  }

  handleTouchEnd(event: TouchEvent): void {
    const touchEndTime = Date.now();
    const touchDuration = touchEndTime - this.touchStartTime;

    if (touchDuration < 200 && !this.isTouchScrolling) {
      event.preventDefault();
    }
  }
}
