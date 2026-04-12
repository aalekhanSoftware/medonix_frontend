import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, debounceTime } from 'rxjs';
import { formatDate } from '@angular/common';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

import { PurchaseService } from '../../../services/purchase.service';
import { ProductService } from '../../../services/product.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { ProductBatchStockService } from '../../../services/product-batch-stock.service';

@Component({
  selector: 'app-add-purchase-return',
  templateUrl: './add-purchase-return.component.html',
  styleUrls: ['./add-purchase-return.component.scss']
})
export class AddPurchaseReturnComponent implements OnInit, OnDestroy {
  @ViewChild(CdkVirtualScrollViewport) viewport!: CdkVirtualScrollViewport;

  returnForm: FormGroup;
  isLoading = false;
  isSaving = false;
  purchaseDetails: any;
  products: any[] = [];
  private destroy$ = new Subject<void>();
  private productMap: Map<any, any> = new Map();
  private productMapReady = false;
  private readonly PRODUCT_MAP_SYNC_THRESHOLD = 1000;

  // Batch numbers fetched per-product from API
  apiBatchNumbersMap: Map<number, string[]> = new Map();
  
  // Active dropdown state
  activeBatchDropdownIndex: number | null = null;
  filteredBatchNumbers: string[] = [];
  batchDropdownCloseTimeout: any;

  /** New array reference for cdkVirtualFor. */
  itemControlsForView: AbstractControl[] = [];

  readonly VIRTUAL_SCROLL_ITEM_SIZE_PX = 52;

  getViewportHeight(): number {
    const rowHeight = this.VIRTUAL_SCROLL_ITEM_SIZE_PX;
    const maxHeight = 750;
    const count = this.itemControlsForView.length;
    if (count === 0) return rowHeight;
    return Math.min(count * rowHeight, maxHeight);
  }

  trackByItemControl(index: number, control: AbstractControl): AbstractControl {
    return control;
  }

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private purchaseService: PurchaseService,
    private productService: ProductService,
    private snackbar: SnackbarService,
    private encryptionService: EncryptionService,
    private productBatchStockService: ProductBatchStockService
  ) {
    this.returnForm = this.fb.group({
      purchaseId: [null],
      customerId: [null],
      purchaseReturnDate: [formatDate(new Date(), 'yyyy-MM-dd', 'en'), Validators.required],
      invoiceNumber: [''],
      packagingAndForwadingCharges: [0, [Validators.required, Validators.min(0)]],
      items: this.fb.array([])
    });
  }

  get itemsFormArray(): FormArray {
    return this.returnForm.get('items') as FormArray;
  }

  ngOnInit(): void {
    const encryptedId = this.route.snapshot.paramMap.get('id');
    if (!encryptedId) {
      this.snackbar.error('Invalid purchase id');
      return;
    }

    const decryptedId = this.encryptionService.decrypt(encryptedId);
    const id = decryptedId ? Number(decryptedId) : NaN;

    if (!id || isNaN(id)) {
      this.snackbar.error('Invalid purchase id');
      return;
    }

    this.itemsFormArray.valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(150))
      .subscribe(() => this.recalculateAllItemPrices());

    this.loadProducts();
    this.loadPurchaseDetails(id);
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

  ngOnDestroy(): void {
    // Complete destroy subject to clean up all takeUntil subscriptions
    this.destroy$.next();
    this.destroy$.complete();

    // Clear arrays and maps to release memory
    this.products = [];
    this.purchaseDetails = null;
    this.productMap.clear();
    this.productMapReady = false;

    // Reset form to release form subscriptions
    if (this.returnForm) {
      this.returnForm.reset();
    }
  }

  private loadProducts(): void {
    this.productService.getProducts({ status: 'A' }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        if (response?.success && response.data) {
          this.products = response.data.content || response.data || [];
        } else {
          this.products = [];
        }
        if (this.products.length === 0) {
          this.productMap.clear();
          this.productMapReady = true;
        } else if (this.products.length <= this.PRODUCT_MAP_SYNC_THRESHOLD) {
          this.buildProductMap();
        } else {
          this.scheduleChunkedProductMapBuild();
        }
        this.mapProductNames();
      },
      error: () => {
        this.snackbar.error('Failed to load products');
      }
    });
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
      }
    };

    if (list.length > 0) {
      requestAnimationFrame(processChunk);
    } else {
      this.productMapReady = true;
    }
  }

  getMaxReturnQuantity(group: AbstractControl): number {
    const quantity = Number(group.get('quantity')?.value || 0);
    const qcPass = Number(group.get('qcPass')?.value || 0);
    const max = quantity - qcPass;
    return isNaN(max) || max < 0 ? 0 : max;
  }

  private loadPurchaseDetails(id: number): void {
    this.isLoading = true;
    this.purchaseService.getPurchaseDetails(id, true).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        this.purchaseDetails = response;
        this.returnForm.patchValue({
          purchaseId: response.id,
          customerId: response.customerId,
          invoiceNumber: response.invoiceNumber ? `PR-${response.invoiceNumber}` : '',
          isPurchaseReturn: true,
          packagingAndForwadingCharges: response.packagingAndForwadingCharges || 0
        });

        const items = response.items || [];
        this.buildItemsForm(items);

        if (response.purchaseReturns) {
          this.applyExistingPurchaseReturns(response.purchaseReturns);
        }
        this.isLoading = false;
      },
      error: (error: any) => {
        this.snackbar.error(error?.error?.message || 'Failed to load purchase details');
        this.isLoading = false;
      }
    });
  }

  private buildItemsForm(items: any[]): void {
    this.itemsFormArray.clear();

    items.forEach(item => {
      const quantity = Number(item.quantity || 0);
      const qcPass = Number(item.qcPass || 0);
      const maxReturn = Math.max(0, quantity - qcPass);

      const group = this.fb.group({
        purchaseItemId: [item.id],
        productId: [item.productId],
        productName: [null],
        quantity: [quantity],
        batchNumber: [item.batchNumber],
        qcPass: [qcPass],
        unitPrice: [item.unitPrice],
        returnQuantity: [{ value: null, disabled: maxReturn <= 0 }, [
          Validators.min(0),
          Validators.max(maxReturn)
        ]],
        remarks: [null],
        discountType: ['percentage'],
        discountPercentage: [0, [Validators.min(0), Validators.max(100)]],
        discountAmount: [0, [Validators.min(0)]],
        discountPrice: [{ value: 0, disabled: true }],
        taxPercentage: [{ value: 0, disabled: true }],
        taxAmount: [{ value: 0, disabled: true }],
        price: [{ value: 0, disabled: true }]
      });

      this.itemsFormArray.push(group);

      if (item.productId && !this.apiBatchNumbersMap.has(item.productId)) {
        this.productBatchStockService.getAvailableBatchNames(item.productId)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (response) => {
              const batchArray = Array.isArray(response) ? response : (response && response.success && Array.isArray(response.data) ? response.data : null);
              if (batchArray) {
                this.apiBatchNumbersMap.set(item.productId, batchArray);
              }
            },
            error: () => { }
          });
      }
    });

    this.itemControlsForView = Array.from(this.itemsFormArray.controls);
    this.mapProductNames();

    setTimeout(() => {
      this.viewport?.checkViewportSize();
    }, 0);
  }

  private applyExistingPurchaseReturns(purchaseReturns: any): void {
    if (!purchaseReturns) {
      return;
    }

    if (purchaseReturns.purchaseReturnDate) {
      const formattedDate = formatDate(purchaseReturns.purchaseReturnDate, 'yyyy-MM-dd', 'en');
      this.returnForm.get('purchaseReturnDate')?.setValue(formattedDate);
    }

    if (purchaseReturns.invoiceNumber) {
      this.returnForm.get('invoiceNumber')?.setValue(purchaseReturns.invoiceNumber);
    }

    if (purchaseReturns.packagingAndForwadingCharges != null) {
      this.returnForm.get('packagingAndForwadingCharges')?.setValue(purchaseReturns.packagingAndForwadingCharges);
    }

    const itemsByPurchaseItemId = new Map<number, any>();
    (purchaseReturns.items || []).forEach((item: any) => {
      if (item && item.purchaseItemId != null) {
        itemsByPurchaseItemId.set(item.purchaseItemId, item);
      }
    });

    this.itemsFormArray.controls.forEach(group => {
      const purchaseItemId = group.get('purchaseItemId')?.value;
      if (!purchaseItemId) {
        return;
      }

      const existing = itemsByPurchaseItemId.get(purchaseItemId);
      if (!existing) {
        return;
      }

      if (existing.quantity != null) {
        group.get('returnQuantity')?.setValue(existing.quantity, { emitEvent: false });
      }

      if (existing.unitPrice != null) {
        group.get('unitPrice')?.setValue(existing.unitPrice, { emitEvent: false });
      }

      if (existing.remarks != null) {
        group.get('remarks')?.setValue(existing.remarks, { emitEvent: false });
      }

      const discountPct = existing.discountPercentage ?? 0;
      const discountAmt = existing.discountAmount ?? 0;
      const discountType = discountPct > 0 ? 'percentage' : (discountAmt > 0 ? 'amount' : 'percentage');
      group.patchValue({
        discountType,
        discountPercentage: discountPct,
        discountAmount: discountAmt,
        discountPrice: existing.discountPrice ?? 0,
        taxPercentage: existing.taxPercentage ?? group.get('taxPercentage')?.value ?? 0,
        taxAmount: existing.taxAmount ?? 0
      }, { emitEvent: false });
    });
    this.recalculateAllItemPrices();
  }

  private mapProductNames(): void {
    if (!this.products || this.products.length === 0) {
      this.recalculateAllItemPrices();
      return;
    }

    this.itemsFormArray.controls.forEach(group => {
      const productId = group.get('productId')?.value;
      if (productId) {
        const product = this.getProductByValue(productId);
        if (product) {
          group.get('productName')?.setValue(product.name, { emitEvent: false });

          if (!group.get('unitPrice')?.value && product.unitPrice != null) {
            group.get('unitPrice')?.setValue(product.unitPrice, { emitEvent: false });
          }

          const taxPct = product.taxPercentage ?? 0;
          group.get('taxPercentage')?.setValue(taxPct, { emitEvent: false });
        }
      }
    });
    this.recalculateAllItemPrices();
  }

  private calculateItemPrice(group: FormGroup): void {
    if (!group) return;

    const returnQty = Number(group.get('returnQuantity')?.value || 0);
    const unitPrice = Number(group.get('unitPrice')?.value || 0);
    const taxPercentage = Number(group.get('taxPercentage')?.value || 0);
    const discountType = group.get('discountType')?.value || 'percentage';
    const discountPercentage = Number(group.get('discountPercentage')?.value || 0);
    let discountAmount = Number(group.get('discountAmount')?.value || 0);

    const subtotal = Number((unitPrice * returnQty).toFixed(2));

    let calculatedDiscountAmount = 0;
    if (discountType === 'percentage' && discountPercentage > 0) {
      const cappedPct = Math.min(discountPercentage, 100);
      calculatedDiscountAmount = Number((subtotal * (cappedPct / 100)).toFixed(2));
      if (discountPercentage > 100) {
        group.patchValue({ discountPercentage: 100 }, { emitEvent: false });
      }
    } else if (discountType === 'amount' && discountAmount > 0) {
      calculatedDiscountAmount = Math.min(discountAmount, subtotal);
      if (discountAmount > subtotal) {
        group.patchValue({ discountAmount: subtotal }, { emitEvent: false });
      }
    }

    const discountPrice = Number((subtotal - calculatedDiscountAmount).toFixed(2));
    const taxAmount = Number((discountPrice * taxPercentage / 100).toFixed(2));

    group.patchValue({
      price: subtotal,
      discountAmount: calculatedDiscountAmount,
      discountPrice,
      taxAmount
    }, { emitEvent: false });
  }

  private recalculateAllItemPrices(): void {
    this.itemsFormArray.controls.forEach(c => this.calculateItemPrice(c as FormGroup));
  }

  isReturnQuantityInvalid(index: number): boolean {
    const control = this.itemsFormArray.at(index).get('returnQuantity');
    if (!control || control.disabled) {
      return false;
    }
    return !!control.invalid;
  }

  getTotalReturnQuantity(): number {
    return this.itemsFormArray.controls.reduce((sum: number, group: AbstractControl) => {
      const control = group.get('returnQuantity');
      if (!control || control.disabled) {
        return sum;
      }

      const value = Number(control.value || 0);
      return sum + (isNaN(value) ? 0 : value);
    }, 0);
  }

  getTotalAmount(): number {
    return this.itemsFormArray.controls.reduce(
      (sum, group) => sum + (Number((group as FormGroup).get('price')?.value) || 0),
      0
    );
  }

  getTotalDiscountAmount(): number {
    return this.itemsFormArray.controls.reduce(
      (sum, group) => sum + (Number((group as FormGroup).get('discountAmount')?.value) || 0),
      0
    );
  }

  getTotalTaxAmount(): number {
    return this.itemsFormArray.controls.reduce(
      (sum, group) => sum + (Number((group as FormGroup).get('taxAmount')?.value) || 0),
      0
    );
  }

  getTotalFinalPrice(): number {
    return this.itemsFormArray.controls.reduce(
      (sum, group) => {
        const g = group as FormGroup;
        const d = Number(g.get('discountPrice')?.value) || Number(g.get('price')?.value) || 0;
        const t = Number(g.get('taxAmount')?.value) || 0;
        return sum + d + t;
      },
      0
    );
  }

  getGrandTotal(): number {
    const packaging = Number(this.returnForm.get('packagingAndForwadingCharges')?.value || 0);
    return this.getTotalFinalPrice() + packaging;
  }

  // --- Batch Number Autocomplete Methods ---

  getAvailableBatchNumbersForProduct(productId: any): string[] {
    if (!productId) return [];

    // 1. Get from API cache
    const apiBatches = this.apiBatchNumbersMap.get(productId) || [];
    const batchSet = new Set<string>(apiBatches);
    
    // 2. Add any batches currently typed in other columns for this same product
    this.itemsFormArray.controls.forEach(control => {
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
    const group = this.itemsFormArray.at(index);
    const productId = group.get('productId')?.value;
    const currentBatch = group.get('batchNumber')?.value || '';
    
    const allBatches = this.getAvailableBatchNumbersForProduct(productId);
    this.filteredBatchNumbers = allBatches.filter(b => b.toLowerCase().includes(currentBatch.toLowerCase()));
  }

  onBatchInput(index: number, event: any): void {
    const value = event.target.value || '';
    const group = this.itemsFormArray.at(index);
    const productId = group.get('productId')?.value;
    
    const allBatches = this.getAvailableBatchNumbersForProduct(productId);
    this.filteredBatchNumbers = allBatches.filter(b => b.toLowerCase().includes(value.toLowerCase()));
    
    // Make sure dropdown stays open as we type
    this.activeBatchDropdownIndex = index;
  }

  onBatchBlur(index: number): void {
    this.batchDropdownCloseTimeout = setTimeout(() => {
      if (this.activeBatchDropdownIndex === index) {
        this.activeBatchDropdownIndex = null;
      }
    }, 150);
  }

  selectBatch(index: number, batch: string): void {
    const group = this.itemsFormArray.at(index);
    group.patchValue({ batchNumber: batch });
    group.get('batchNumber')?.markAsDirty();
    this.activeBatchDropdownIndex = null;
  }
  // -----------------------------------------

  getFormattedPrice(i: number): string {
    const v = this.itemsFormArray.at(i)?.get('price')?.value;
    return v != null ? Number(v).toFixed(2) : '0.00';
  }

  getFormattedDiscountAmount(i: number): string {
    const v = this.itemsFormArray.at(i)?.get('discountAmount')?.value;
    return v != null ? Number(v).toFixed(2) : '0.00';
  }

  getFormattedDiscountPrice(i: number): string {
    const g = this.itemsFormArray.at(i) as FormGroup;
    const v = g?.get('discountPrice')?.value;
    const p = g?.get('price')?.value;
    return v != null ? Number(v).toFixed(2) : (p != null ? Number(p).toFixed(2) : '0.00');
  }

  getFormattedTaxAmount(i: number): string {
    const v = this.itemsFormArray.at(i)?.get('taxAmount')?.value;
    return v != null ? Number(v).toFixed(2) : '0.00';
  }

  onSubmit(): void {
    if (!this.purchaseDetails) {
      this.snackbar.error('Purchase details not loaded');
      return;
    }

    if (this.returnForm.invalid) {
      this.returnForm.markAllAsTouched();
      return;
    }

    const rawValue = this.returnForm.getRawValue();

    const products = (rawValue.items || [])
      .filter((item: any) => {
        const qty = Number(item.returnQuantity || 0);
        return !isNaN(qty) && qty > 0;
      })
      .map((item: any) => {
        const subTotal = Number(item.unitPrice || 0) * Number(item.returnQuantity || 0);
        const discountType = item.discountType || 'percentage';
        const discountAmount = Number(item.discountAmount || 0);
        // Keep percentage as-is (or 0 for amount-type), do not derive it from amount.
        // This matches `add-sale-return` behavior and avoids backend percentage precedence.
        const discountPercentage = discountType === 'percentage'
          ? Number(item.discountPercentage || 0)
          : 0;
        const discountPrice = Number(item.discountPrice) || (subTotal - discountAmount);
        const taxAmount = Number(item.taxAmount || 0);
        const finalPrice = discountPrice + taxAmount;
        return {
          purchaseItemId: item.purchaseItemId,
          productId: item.productId,
          quantity: Number(item.returnQuantity),
          unitPrice: Number(item.unitPrice || 0),
          price: subTotal,
          discountPercentage,
          discountAmount,
          taxPercentage: Number(item.taxPercentage || 0),
          taxAmount,
          sgst: 0,
          cgst: 0,
          igst: 0,
          finalPrice,
          remarks: item.remarks ?? undefined,
          batchNumber: item.batchNumber || undefined
        };
      });

    if (!products.length) {
      this.snackbar.error('Please enter at least one return quantity greater than 0');
      return;
    }

    const existingReturnId = this.purchaseDetails?.purchaseReturns?.id ?? null;

    const payload = {
      id: existingReturnId,
      purchaseId: rawValue.purchaseId,
      customerId: rawValue.customerId,
      purchaseReturnDate: formatDate(rawValue.purchaseReturnDate, 'dd-MM-yyyy', 'en'),
      invoiceNumber: rawValue.invoiceNumber,
      packagingAndForwadingCharges: Number(rawValue.packagingAndForwadingCharges || 0),
      price: this.getTotalAmount(),
      discountAmount: this.getTotalDiscountAmount(),
      taxAmount: this.getTotalTaxAmount(),
      totalAmount: this.getGrandTotal(),
      products
    };

    this.isSaving = true;

    this.purchaseService.createPurchaseReturn(payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        if (res?.success) {
          this.snackbar.success(res.message || 'Purchase return created successfully');
          this.router.navigate(['purchase/return']);
        } else {
          this.snackbar.error(res?.message || 'Failed to create purchase return');
        }
        this.isSaving = false;
      },
      error: (error: any) => {
        const message = error?.error?.message || 'Failed to create purchase return';
        this.snackbar.error(message);
        this.isSaving = false;
      }
    });
  }
}
