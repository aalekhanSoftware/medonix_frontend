import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../shared/components/searchable-select/searchable-select.component';
import { ProductService } from '../../services/product.service';
import { CombinedPurchaseSaleService } from '../../services/combined-purchase-sale.service';

interface DiscountCalculation {
  quantity: number;
  unitPrice: number;
  discountPercentage: number;
  discountAmount: number;
  finalPrice: number;
}

@Component({
 selector: 'app-add-combined-purchase-sale',
 standalone: true,
 imports: [
   CommonModule,
   ReactiveFormsModule,
   RouterModule,
   LoaderComponent,
   SearchableSelectComponent
 ],
 templateUrl: './add-combined-purchase-sale.component.html',
 styleUrls: ['./add-combined-purchase-sale.component.scss'],
 changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddCombinedPurchaseSaleComponent implements OnInit, OnDestroy {
 combinedForm!: FormGroup;
 products: any[] = [];
 loading = false;
 isLoadingProducts = false;
 private destroy$ = new Subject<void>();

 private formSubscriptions: Subscription[] = [];
 
 // Memory optimization: Map for O(1) product lookups
 private productMap: Map<any, any> = new Map();

   constructor(
    private fb: FormBuilder,
    private productService: ProductService,
    private combinedService: CombinedPurchaseSaleService,
    private snackbar: SnackbarService,
    private cdr: ChangeDetectorRef
 ) {
   this.initForm();
   this.setupProductChangeListener();
 }
  ngOnInit() {
   this.loadProducts();
 }
  private initForm() {
   const now = new Date();
   const localISOString = new Date(now.getTime() - (now.getTimezoneOffset() * 60000))
     .toISOString()
     .slice(0, 16);
    this.combinedForm = this.fb.group({
     productId: ['', Validators.required],
     purchaseUnitPrice: ['', [Validators.required, Validators.min(0.01)]],
     purchaseDate: [localISOString, Validators.required],
     purchaseInvoiceNumber: [null],
     purchaseOtherExpenses: [0, [Validators.required, Validators.min(0)]],
     quantity: ['', [Validators.required, Validators.min(1)]],
     saleUnitPrice: ['', [Validators.required, Validators.min(0.01)]],
     saleDate: [localISOString, Validators.required],
     saleInvoiceNumber: [null],
     saleOtherExpenses: [0, [Validators.required, Validators.min(0)]],
     purchaseDiscount: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
     purchaseDiscountAmount: [0, [Validators.required, Validators.min(0)]],
     purchaseDiscountedPrice: [{ value: 0, disabled: true }],
     
     saleDiscount: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
     saleDiscountAmount: [0, [Validators.required, Validators.min(0)]],
     saleDiscountedPrice: [{ value: 0, disabled: true }]
   });

   // Setup value change subscriptions
   this.setupPurchaseDiscountCalculation();
   this.setupSaleDiscountCalculation();
 }
  ngOnDestroy(): void {
    // Unsubscribe from all form subscriptions
    this.formSubscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    this.formSubscriptions = [];

    // Complete destroy subject to clean up all takeUntil subscriptions
    this.destroy$.next();
    this.destroy$.complete();

    // Clear arrays to release memory
    this.products = [];
    this.productMap.clear();

    // Reset form to release form subscriptions
    if (this.combinedForm) {
      this.combinedForm.reset();
    }
  }

  private loadProducts(): void {
    this.isLoadingProducts = true;
    this.productService.getProducts({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.products = response.data;
            this.buildProductMap();
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

  // Memory optimization: build Map for O(1) product lookups
  private buildProductMap(): void {
    this.productMap.clear();
    for (const product of this.products) {
      this.productMap.set(product.id, product);
    }
  }
  refreshProducts(): void {
    this.isLoadingProducts = true;
    this.productService.refreshProducts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.products = response.data;
            this.buildProductMap();
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
  onSubmit() {
    if (this.combinedForm.valid) {
      this.loading = true;
      const formData = {...this.combinedForm.value};
      
      // Format dates
      ['purchaseDate', 'saleDate'].forEach(dateField => {
        if (formData[dateField]) {
          try {
            const date = new Date(formData[dateField]);
            if (!isNaN(date.getTime())) { // Check if date is valid
              formData[dateField] = date.toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              }).replace(/\//g, '-').replace(',', '');
            } else {
              this.snackbar.error(`Invalid ${dateField} format`);
              this.loading = false;
              this.cdr.markForCheck();
              return;
            }
          } catch (error) {
            this.snackbar.error(`Invalid ${dateField} format`);
            this.loading = false;
            this.cdr.markForCheck();
            return;
          }
        }
      });

      if (!this.loading) return; // Stop if date validation failed
      
      this.combinedService.createCombinedPurchaseSale(formData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response:any) => {
            this.snackbar.success('Combined purchase and sale created successfully');
            this.resetForm();
            this.loading = false;
            this.cdr.markForCheck();
          },
          error: (error:any) => {
            this.snackbar.error(error?.error?.message || 'Failed to create combined purchase and sale');
            this.loading = false;
            this.cdr.markForCheck();
          }
        });
    }
  }
  resetForm(): void {
    const now = new Date();
    const localISOString = new Date(now.getTime() - (now.getTimezoneOffset() * 60000))
      .toISOString()
      .slice(0, 16);

    this.combinedForm.reset({
      purchaseDate: localISOString,
      saleDate: localISOString,
      purchaseOtherExpenses: 0,
      saleOtherExpenses: 0,
      purchaseDiscount: 0,
      purchaseDiscountAmount: 0,
      purchaseDiscountedPrice: 0,
      saleDiscount: 0,
      saleDiscountAmount: 0,
      saleDiscountedPrice: 0
    });
    this.cdr.markForCheck();
  }
  isFieldInvalid(fieldName: string): boolean {
   const field = this.combinedForm.get(fieldName);
   return field ? field.invalid && (field.dirty || field.touched) : false;
 }
  getFieldError(fieldName: string): string {
   const control = this.combinedForm.get(fieldName);
   if (control?.errors) {
     if (control.errors['required']) return `${fieldName} is required`;
     if (control.errors['min']) return `${fieldName} must be greater than ${control.errors['min'].min}`;
   }
   return '';
 }
 
  private setupProductChangeListener() {
    const sub = this.combinedForm.get('productId')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged()
      )
      .subscribe(selectedProductId => {
        if (selectedProductId) {
          const selectedProduct = this.productMap.get(selectedProductId);
          if (selectedProduct) {
            this.combinedForm.patchValue({
              purchaseUnitPrice: selectedProduct.purchase_amount,
              saleUnitPrice: selectedProduct.sale_amount
            }, { emitEvent: false });
            this.cdr.markForCheck();
          }
        }
      });
    if (sub) {
      this.formSubscriptions.push(sub);
    }
  }

  private setupPurchaseDiscountCalculation() {
    const purchaseFields = ['quantity', 'purchaseUnitPrice', 'purchaseDiscount', 'purchaseDiscountAmount'];
    purchaseFields.forEach(field => {
      const sub = this.combinedForm.get(field)?.valueChanges
        .pipe(
          takeUntil(this.destroy$),
          debounceTime(150),
          distinctUntilChanged()
        )
        .subscribe(() => {
          this.calculatePurchaseDiscount();
          this.cdr.markForCheck();
        });
      if (sub) {
        this.formSubscriptions.push(sub);
      }
    });
  }

  private setupSaleDiscountCalculation() {
    const saleFields = ['quantity', 'saleUnitPrice', 'saleDiscount', 'saleDiscountAmount'];
    saleFields.forEach(field => {
      const sub = this.combinedForm.get(field)?.valueChanges
        .pipe(
          takeUntil(this.destroy$),
          debounceTime(150),
          distinctUntilChanged()
        )
        .subscribe(() => {
          this.calculateSaleDiscount();
          this.cdr.markForCheck();
        });
      if (sub) {
        this.formSubscriptions.push(sub);
      }
    });
  }

  private calculateDiscount(values: DiscountCalculation): DiscountCalculation {
    const totalPrice = values.quantity * values.unitPrice;
    
    // If discount amount is manually changed, use it directly
    if (values.discountAmount > 0) {
      values.finalPrice = totalPrice - values.discountAmount;
      values.discountPercentage = (values.discountAmount / totalPrice) * 100;
    } else if (values.discountPercentage > 0) {
      // Calculate discount amount from percentage
      values.discountAmount = (totalPrice * values.discountPercentage) / 100;
      values.finalPrice = totalPrice - values.discountAmount;
    } else {
      values.finalPrice = totalPrice;
    }
    
    return values;
  }

  private calculatePurchaseDiscount(): void {
    const values = {
      quantity: this.combinedForm.get('quantity')?.value || 0,
      unitPrice: this.combinedForm.get('purchaseUnitPrice')?.value || 0,
      discountPercentage: this.combinedForm.get('purchaseDiscount')?.value || 0,
      discountAmount: this.combinedForm.get('purchaseDiscountAmount')?.value || 0,
      finalPrice: 0
    };

    const result = this.calculateDiscount(values);
    this.combinedForm.patchValue({
      purchaseDiscountAmount: result.discountAmount,
      purchaseDiscount: result.discountPercentage,
      purchaseDiscountedPrice: result.finalPrice
    }, { emitEvent: false });
  }

  private calculateSaleDiscount(): void {
    const values = {
      quantity: this.combinedForm.get('quantity')?.value || 0,
      unitPrice: this.combinedForm.get('saleUnitPrice')?.value || 0,
      discountPercentage: this.combinedForm.get('saleDiscount')?.value || 0,
      discountAmount: this.combinedForm.get('saleDiscountAmount')?.value || 0,
      finalPrice: 0
    };

    const result = this.calculateDiscount(values);
    this.combinedForm.patchValue({
      saleDiscountAmount: result.discountAmount,
      saleDiscount: result.discountPercentage,
      saleDiscountedPrice: result.finalPrice
    }, { emitEvent: false });
  }
}