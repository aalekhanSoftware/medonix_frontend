import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, Validators, ReactiveFormsModule, ValidatorFn, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { formatDate } from '@angular/common';

import { SaleService } from '../../services/sale.service';
import { ProductService } from '../../services/product.service';
import { CustomerService } from '../../services/customer.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../shared/components/searchable-select/searchable-select.component';
import { EncryptionService } from '../../shared/services/encryption.service';
import { toProductOptionsList, transformProductsWithDisplayName } from '../../shared/utils/product-display.util';

interface ProductForm {
  id?: number | null;
  productId: string;
  quantity: number;
  batchNumber: string;
  unitPrice: number;
  price: number;
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
  
  // Memory optimization: Map for O(1) product lookups instead of O(n) find()
  private productMap: Map<any, any> = new Map();
  
  // Memory optimization: cached totals to avoid recalculating in template
  totalAmount: number = 0;
  totalDiscountAmount: number = 0;
  totalBillDiscountAmount: number = 0;
  totalTaxAmount: number = 0;
  grandTotal: number = 0;

  get productsFormArray() {
    return this.returnForm.get('products') as FormArray;
  }

  trackByProductIndex(index: number, item: any): any {
    return item;
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
          this.products = toProductOptionsList(response.data);
          // Fetch sale return details after products are loaded (if in edit mode)
          if (this.isEdit && this.saleReturnId) {
            this.fetchSaleReturnDetails(this.saleReturnId);
          }
        }
        this.isLoadingProducts = false;
      },
      error: () => {
        this.snackbar.error('Failed to load products');
        this.isLoadingProducts = false;
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

    // Listen to bill-level discount percentage changes
    this.returnForm.get('totalSaleReturnDiscountPercentage')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(150)
      )
      .subscribe(() => {
        this.productsFormArray.controls.forEach((group: any) => {
          this.calculateProductPrice(group);
        });
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
      totalSaleReturnDiscountPercentage: [0, [Validators.min(0), Validators.max(100)]],
      products: this.fb.array([]),
      packagingAndForwadingCharges: [0, [Validators.required, Validators.min(0)]]
    });

    // Add initial product form group only if not in edit mode
    if (!this.isEdit) {
      this.addProduct();
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
      saleReturnDiscountPercentage: [0],
      saleReturnDiscountAmount: [{ value: 0, disabled: true }],
      totalDiscount: [{ value: 0, disabled: true }],
      discountPrice: [{ value: 0, disabled: true }],
      taxPercentage: [{ value: 0, disabled: true }],
      taxAmount: [{ value: 0, disabled: true }],
      remarks: [null, []]
    });
  }

  addProduct(): void {
    const productGroup = this.createProductFormGroup();
    const subscription = this.setupProductCalculations(productGroup);
    this.productSubscriptions.push(subscription);
    this.productsFormArray.push(productGroup);
  }

  removeProduct(index: number): void {
    if (this.productsFormArray.length === 1) return;
    
    // Unsubscribe from the removed product's subscription bundle
    if (this.productSubscriptions[index]) {
      this.productSubscriptions[index].unsubscribe();
      this.productSubscriptions.splice(index, 1);
    }
    
    this.productsFormArray.removeAt(index);
    this.calculateTotalAmount();
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
          const selectedProduct = this.productMap.get(productId);
          if (selectedProduct) {
            const taxPercentage = selectedProduct.taxPercentage || 0;
            group.patchValue({ taxPercentage }, { emitEvent: false });
            this.calculateProductPrice(group);
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
    const totalSaleReturnDiscountPercentage = Number(this.returnForm.get('totalSaleReturnDiscountPercentage')?.value || 0);
    
    // Calculate subtotal = unitPrice * quantity
    const subtotal = Number((quantity * unitPrice).toFixed(2));
    
    // Calculate item-level discount
    let calculatedItemDiscountAmount = 0;
    if (discountType === 'percentage' && discountPercentage > 0) {
      const cappedPercentage = Math.min(discountPercentage, 100);
      calculatedItemDiscountAmount = Number((subtotal * (cappedPercentage / 100)).toFixed(2));
      if (discountPercentage > 100) {
        group.patchValue({ discountPercentage: 100 }, { emitEvent: false });
      }
    } else if (discountType === 'amount' && discountAmount > 0) {
      calculatedItemDiscountAmount = Math.min(discountAmount, subtotal);
      if (discountAmount > subtotal) {
        group.patchValue({ discountAmount: subtotal }, { emitEvent: false });
      }
    }
    
    // Price after item-level discount
    const discountPriceAfterItemDisc = Number((subtotal - calculatedItemDiscountAmount).toFixed(2));
    
    // Calculate sale return bill-level discount per item
    let saleReturnDiscountAmount = 0;
    let saleReturnDiscountPercentage = 0;
    if (totalSaleReturnDiscountPercentage > 0 && discountPriceAfterItemDisc > 0) {
      saleReturnDiscountPercentage = totalSaleReturnDiscountPercentage;
      saleReturnDiscountAmount = Number((discountPriceAfterItemDisc * totalSaleReturnDiscountPercentage / 100).toFixed(2));
    }
    
    // Combined discount
    const totalDiscount = calculatedItemDiscountAmount + saleReturnDiscountAmount;
    
    // Tax on value after all discounts
    const taxableValue = Number((discountPriceAfterItemDisc - saleReturnDiscountAmount).toFixed(2));
    const taxAmount = Number((taxableValue * taxPercentage / 100).toFixed(2));

    group.patchValue({
      price: subtotal,
      discountAmount: calculatedItemDiscountAmount,
      saleReturnDiscountPercentage: saleReturnDiscountPercentage,
      saleReturnDiscountAmount: saleReturnDiscountAmount,
      totalDiscount: totalDiscount,
      discountPrice: discountPriceAfterItemDisc,
      taxAmount: taxAmount
    }, { emitEvent: false });

    this.calculateTotalAmount();
  }

  getTotalAmount(): number {
    return this.productsFormArray.controls
      .reduce((total, group: any) => total + (group.get('price').value || 0), 0);
  }

  getTotalDiscountAmount(): number {
    return this.productsFormArray.controls
      .reduce((total, group: any) => total + (Number(group.get('discountAmount')?.value || 0)), 0);
  }

  getTotalTaxAmount(): number {
    return this.productsFormArray.controls
      .reduce((total, group: any) => total + (group.get('taxAmount').value || 0), 0);
  }

  getTotalFinalPrice(): number {
    return this.productsFormArray.controls
      .reduce((total, group: any) => {
        const discountPrice = Number(group.get('discountPrice')?.value || 0);
        const saleReturnDiscountAmount = Number(group.get('saleReturnDiscountAmount')?.value || 0);
        const taxableValue = discountPrice - saleReturnDiscountAmount;
        const taxAmount = Number(group.get('taxAmount')?.value || 0);
        return total + (taxableValue + taxAmount);
      }, 0);
  }

  getGrandTotal(): number {
    // totalAmount = sum of all items' finalPrice + packagingAndForwadingCharges
    const packagingCharges = Number(this.returnForm.get('packagingAndForwadingCharges')?.value || 0);
    return this.getTotalFinalPrice() + packagingCharges;
  }

  private loadProducts(): void {
    this.isLoadingProducts = true;
    this.productService.getProducts({ status: 'A' }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        if (response?.success && response.data) {
          this.products = toProductOptionsList(response.data);
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

  // Memory optimization: build Map for O(1) product lookups
  private buildProductMap(): void {
    this.productMap.clear();
    for (const product of this.products) {
      this.productMap.set(product.id, product);
    }
  }

  refreshProducts(): void {
    this.isLoadingProducts = true;
    this.productService.refreshProducts().pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        if (response?.success) {
          this.products = transformProductsWithDisplayName(response.data || []);
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
        if (errors['min'] && fieldName === 'quantity') return true;
        if (errors['min'] && fieldName === 'unitPrice') return true;
        if (errors['min'] || errors['max']) return true;
        if (errors['min']) return true;
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
      price: this.getTotalAmount(),
      discountAmount: this.getTotalDiscountAmount(),
      taxAmount: this.getTotalTaxAmount(),
      packagingAndForwadingCharges: Number(formValue.packagingAndForwadingCharges || 0),
      totalSaleReturnDiscountPercentage: Number(formValue.totalSaleReturnDiscountPercentage || 0),
      totalAmount: this.getGrandTotal(),
      products: formValue.products.map((product: ProductForm, index: number) => {
        const itemId = this.productsFormArray.at(index).get('id')?.value;
        const price = this.productsFormArray.at(index).get('price')?.value || 0;
        const discountPercentage = Number(this.productsFormArray.at(index).get('discountPercentage')?.value || 0);
        const discountAmount = Number(this.productsFormArray.at(index).get('discountAmount')?.value || 0);
        const saleReturnDiscountPercentage = Number(this.productsFormArray.at(index).get('saleReturnDiscountPercentage')?.value || 0);
        const saleReturnDiscountAmount = Number(this.productsFormArray.at(index).get('saleReturnDiscountAmount')?.value || 0);
        const totalDiscount = Number(this.productsFormArray.at(index).get('totalDiscount')?.value || 0);
        const discountPrice = Number(this.productsFormArray.at(index).get('discountPrice')?.value || price);
        const taxAmount = this.productsFormArray.at(index).get('taxAmount')?.value || 0;
        const item: any = {
          productId: product.productId,
          quantity: product.quantity,
          batchNumber: product.batchNumber,
          unitPrice: product.unitPrice,
          price: price,
          discountPercentage: discountPercentage,
          discountAmount: discountAmount,
          saleReturnDiscountPercentage: saleReturnDiscountPercentage,
          saleReturnDiscountAmount: saleReturnDiscountAmount,
          totalDiscount: totalDiscount,
          taxPercentage: this.productsFormArray.at(index).get('taxPercentage')?.value,
          taxAmount: taxAmount,
          finalPrice: discountPrice + taxAmount,
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
    this.totalAmount = this.productsFormArray.controls
      .reduce((sum, group: any) => sum + (group.get('price').value || 0), 0);
    
    this.totalDiscountAmount = this.productsFormArray.controls
      .reduce((sum, group: any) => sum + (Number(group.get('discountAmount')?.value || 0)), 0);
    
    this.totalBillDiscountAmount = this.productsFormArray.controls
      .reduce((sum, group: any) => sum + (Number(group.get('saleReturnDiscountAmount')?.value || 0)), 0);
    
    this.totalTaxAmount = this.productsFormArray.controls
      .reduce((sum, group: any) => sum + (group.get('taxAmount').value || 0), 0);
      
    const packagingCharges = Number(this.returnForm.get('packagingAndForwadingCharges')?.value || 0);
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
    this.returnForm.patchValue({
      id: data.id,
      customerId: data.customerId,
      saleReturnDate: formatDate(new Date(data.saleReturnDate), 'yyyy-MM-dd', 'en'),
      invoiceNumber: data.invoiceNumber,
      totalSaleReturnDiscountPercentage: data.totalSaleReturnDiscountPercentage != null ? data.totalSaleReturnDiscountPercentage : (data.total_sale_return_discount_percentage ?? 0),
      packagingAndForwadingCharges: data.packagingAndForwadingCharges || 0
    });

    // Populate products
    if (data.items && data.items.length > 0) {
      data.items.forEach((item: any) => {
        const productGroup = this.createProductFormGroup();
        const subscription = this.setupProductCalculations(productGroup);
        this.productSubscriptions.push(subscription);
        
        const saleReturnDiscountPercentage = item.saleReturnDiscountPercentage != null ? item.saleReturnDiscountPercentage : (item.sale_return_discount_percentage ?? 0);
        const saleReturnDiscountAmount = item.saleReturnDiscountAmount != null ? item.saleReturnDiscountAmount : (item.sale_return_discount_amount ?? 0);
        const totalDiscount = item.totalDiscount != null ? item.totalDiscount : (item.total_discount ?? 0);
        
        productGroup.patchValue({
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          price: item.price || 0,
          saleReturnDiscountPercentage: saleReturnDiscountPercentage,
          saleReturnDiscountAmount: saleReturnDiscountAmount,
          totalDiscount: totalDiscount,
          taxPercentage: item.taxPercentage || 0,
          taxAmount: item.taxAmount || 0,
          batchNumber: item.batchNumber || '',
          remarks: item.remarks || ''
        }, { emitEvent: false });

        this.productsFormArray.push(productGroup);
      });
    } else {
      // If no items, add one empty product
      this.addProduct();
    }
  }
}
