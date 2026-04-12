import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, FormsModule, AbstractControl } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil, Subscription, debounceTime, filter, distinctUntilChanged, fromEvent } from 'rxjs';
import { formatDate } from '@angular/common';
import { ProductService } from '../../../services/product.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { QuotationService } from '../../../services/quotation.service';
import { PriceService } from '../../../services/price.service';
import { AuthService } from '../../../services/auth.service';
import { UserService } from '../../../services/user.service';
import { CustomerService } from '../../../services/customer.service';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { SearchableSelectComponent } from "../../../shared/components/searchable-select/searchable-select.component";
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';

@Component({
  standalone: true,
  selector: 'app-add-customer-price',
  templateUrl: './add-customer-price.component.html',
  styleUrl: './add-customer-price.component.scss',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    SearchableSelectComponent,
    LoaderComponent,
    PaginationComponent
  ]
})
export class AddCustomerPriceComponent implements OnInit, OnDestroy {
  quotationForm!: FormGroup;
  products: any[] = [];
  loading = false;
  isLoadingProducts = false;
  private destroy$ = new Subject<void>();
  isLoading = false;
  isLoadingPrices: { [key: number]: boolean } = {};
  currentUser: any = null;
  customerId: number | null = null;
  
  // Customer selection
  customers: any[] = [];
  selectedCustomerId: number | null = null;
  isLoadingCustomers = false;
  
  // Products with prices
  productsWithPrices: any[] = [];
  isLoadingProductsWithPrices = false;
  currentPage = 0;
  pageSize = 10;
  totalElements = 0;
  totalPages = 0;
  searchTerm = '';
  sortBy = '';
  sortDir = 'ASC';
  
  // Price update
  updatingPrices: { [key: number]: boolean } = {};
  
  // Price delete
  deletingPrices: { [key: number]: boolean } = {};
  
  // Search debounce
  private searchSubject = new Subject<string>();

  totals: { price: number; tax: number; finalPrice: number; taxPercentage: number } = {
    price: 0,
    tax: 0,
    finalPrice: 0,
    taxPercentage: 0
  };

  private itemSubscriptions: Subscription[] = [];

  get itemsFormArray() {
    return this.quotationForm.get('items') as FormArray;
  }

  constructor(
    private fb: FormBuilder,
    private quotationService: QuotationService,
    private productService: ProductService,
    private priceService: PriceService,
    private customerService: CustomerService,
    private authService: AuthService,
    private userService: UserService,
    private encryptionService: EncryptionService,
    private snackbar: SnackbarService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.initForm();
  }

  ngOnInit() {
    this.loadCurrentUser();
    this.loadCustomers();
    this.loadProducts();
    this.setupItemSubscriptions();
    this.setupSearchDebounce();
  }

  private setupSearchDebounce(): void {
    this.searchSubject.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(searchTerm => {
      this.searchTerm = searchTerm;
      this.currentPage = 0;
      this.loadProductsWithPrices();
    });
  }

  private loadCurrentUser(): void {
    // Check if we already have encrypted user data in localStorage
    const encryptedUserData = localStorage.getItem('encryptedUserData');
    if (encryptedUserData) {
      try {
        const decrypted: any = this.encryptionService.decrypt(encryptedUserData);
        if (decrypted) {
          let userData: any = null;
          
          if (typeof decrypted === 'object' && decrypted !== null) {
            userData = decrypted;
          } else if (typeof decrypted === 'string') {
            userData = JSON.parse(decrypted);
          }
          
          if (userData && userData.data) {
            this.currentUser = userData.data;
            // Get customerId from user data if available (for non-DEALER roles)
            if (!this.authService.hasRole('DEALER') && userData.data.client?.id) {
              this.customerId = userData.data.client.id;
            }
          }
        }
      } catch (error) {
        // Silently handle decryption error
      }
    }

    // If not found in localStorage, fetch from API
    if (!this.currentUser) {
      this.userService.getCurrentUser()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (response.success && response.data) {
              this.currentUser = response.data;
              // Get customerId from user data if available (for non-DEALER roles)
              if (!this.authService.hasRole('DEALER') && response.data.client?.id) {
                this.customerId = response.data.client.id;
              }
            }
          },
          error: (error) => {
            // Silently handle error - user data not critical for this component
          }
        });
    }
  }

  ngOnDestroy() {
    // Unsubscribe from all item subscriptions
    this.itemSubscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    this.itemSubscriptions = [];

    // Complete search subject
    this.searchSubject.complete();

    // Complete destroy subject to clean up all takeUntil subscriptions
    this.destroy$.next();
    this.destroy$.complete();

    // Clear arrays and objects to release memory
    this.products = [];
    this.customers = [];
    this.productsWithPrices = [];
    this.currentUser = null;
    this.updatingPrices = {};
    this.deletingPrices = {};
    this.isLoadingPrices = {};

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
  }

  addItem(isInitializing = false): void {
    const itemGroup = this.fb.group({
      id: [null],
      productId: ['', Validators.required],
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

    this.itemsFormArray.push(itemGroup);
    const newIndex = this.itemsFormArray.length - 1;

    this.setupItemCalculations(itemGroup, newIndex);
    this.subscribeToItemChanges(this.itemsFormArray.at(newIndex), newIndex);

    this.calculateItemPrice(newIndex, isInitializing);
    this.calculateTotalAmount();
  }

  removeItem(index: number): void {
    if (this.itemSubscriptions[index]) {
      this.itemSubscriptions[index].unsubscribe();
      this.itemSubscriptions.splice(index, 1);
    }

    // Clean up loading state
    if (this.isLoadingPrices[index]) {
      delete this.isLoadingPrices[index];
    }

    this.itemsFormArray.removeAt(index);

    // Rebuild loading states map with new indices
    const newLoadingPrices: { [key: number]: boolean } = {};
    Object.keys(this.isLoadingPrices).forEach(key => {
      const oldIndex = Number(key);
      if (oldIndex > index) {
        newLoadingPrices[oldIndex - 1] = this.isLoadingPrices[oldIndex];
      } else if (oldIndex < index) {
        newLoadingPrices[oldIndex] = this.isLoadingPrices[oldIndex];
      }
    });
    this.isLoadingPrices = newLoadingPrices;

    this.itemsFormArray.controls.forEach((control, newIndex) => {
      if (this.itemSubscriptions[newIndex]) {
        this.itemSubscriptions[newIndex].unsubscribe();
      }
      this.subscribeToItemChanges(control, newIndex);
    });

    this.calculateTotalAmount();
    this.cdr.detectChanges();
  }

  private setupItemCalculations(group: FormGroup, index: number) {
    group.get('productId')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        filter(productId => !!productId),
        debounceTime(100),
        distinctUntilChanged()
      )
      .subscribe(productId => {
        const selectedProduct = this.products.find(p => p.id === productId);
        if (selectedProduct) {
          this.setProductPrice(index, selectedProduct);
        }
      });

    group.get('quantity')?.valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(50))
      .subscribe(() => this.calculateItemPrice(index));

    group.get('taxPercentage')?.valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(50))
      .subscribe(() => this.calculateItemPrice(index));
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

    // Fetch customer price from API
    this.fetchCustomerPrice(index, selectedProduct.id);
  }

  private fetchCustomerPrice(index: number, productId: number): void {
    this.isLoadingPrices[index] = true;
    
    const requestData: any = {
      productId: productId
    };

    // Add customerId only if not DEALER role and customerId is available
    if (!this.authService.hasRole('DEALER') && this.customerId) {
      requestData.customerId = this.customerId;
    }

    this.priceService.getCustomerPrice(requestData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isLoadingPrices[index] = false;
          
          if (response.success && response.data) {
            const price = response.data.price || 0;
            const itemGroup = this.itemsFormArray.at(index);
            
            itemGroup.patchValue({
              unitPrice: price
            }, { emitEvent: false });

            this.calculateItemPrice(index);
            this.cdr.detectChanges();
          } else {
            // Fallback to product saleAmount if API fails
            this.setFallbackPrice(index);
          }
        },
        error: (error) => {
          this.isLoadingPrices[index] = false;
          // Fallback to product saleAmount if API fails
          this.setFallbackPrice(index);
        }
      });
  }

  private setFallbackPrice(index: number): void {
    const itemGroup = this.itemsFormArray.at(index);
    const productId = itemGroup.get('productId')?.value;
    const selectedProduct = this.products.find(p => p.id === productId);
    
    if (selectedProduct) {
      const unitPrice = selectedProduct.saleAmount ?? selectedProduct.sale_amount ?? 0;
      itemGroup.patchValue({
        unitPrice: unitPrice
      }, { emitEvent: false });

      this.calculateItemPrice(index);
      this.cdr.detectChanges();
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
      this.cdr.detectChanges();
    }
  }

  getTotalAmount(): number {
    const itemsTotal = this.itemsFormArray.controls
      .reduce((total, group: any) => total + (Number(group.get('finalPrice').value) || 0), 0);
    return Math.round(itemsTotal);
  }

  private loadProducts(): void {
    this.isLoadingProducts = true;
    this.productService.getProducts({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.products = response.data;
          }
          this.isLoadingProducts = false;
        },
        error: () => {
          this.snackbar.error('Failed to load products');
          this.isLoadingProducts = false;
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
            this.snackbar.success('Products refreshed successfully');
          }
          this.isLoadingProducts = false;
        },
        error: () => {
          this.snackbar.error('Failed to refresh products');
          this.isLoadingProducts = false;
        }
      });
  }

  private calculateTotalAmount(): void {
    const totals = {
      price: 0,
      tax: 0,
      finalPrice: 0,
      taxPercentage: 0
    };

    this.itemsFormArray.controls.forEach((group: AbstractControl) => {
      const price = Number(Number(group.get('price')?.value || 0).toFixed(2));
      const finalPrice = Number(Number(group.get('finalPrice')?.value || 0).toFixed(2));
      const taxAmount = Number(Number(group.get('taxAmount')?.value || 0).toFixed(2));
      const taxPercentage = Number(group.get('taxPercentage')?.value || 5);

      totals.price = Number((totals.price + price).toFixed(2));
      totals.tax = Number((totals.tax + taxAmount).toFixed(2));
      totals.finalPrice = Number((totals.finalPrice + finalPrice).toFixed(2));
      totals.taxPercentage = Number(taxPercentage);
    });

    this.totals = totals;
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

    while (this.itemsFormArray.length) {
      this.itemsFormArray.removeAt(0);
    }
    this.addItem();

    this.calculateTotalAmount();
    this.cdr.detectChanges();
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
    const selectedProduct = this.products.find(p => p.id === event.value);
    if (!selectedProduct) {
      return;
    }

    const itemGroup = this.itemsFormArray.at(index);

    const oldSub = this.itemSubscriptions[index];
    if (oldSub) {
      oldSub.unsubscribe();
      this.itemSubscriptions[index] = new Subscription();
    }

    itemGroup.patchValue({
      productId: selectedProduct.id
    }, { emitEvent: true });

    if (!this.itemSubscriptions[index]) {
      this.subscribeToItemChanges(itemGroup, index);
    }
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

    const items = this.itemsFormArray.controls.map((control) => {
      return {
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
      };
    });

    return {
      quoteDate: formatDate(formValue.quoteDate, 'yyyy-MM-dd', 'en'),
      validUntil: formatDate(formValue.validUntil, 'yyyy-MM-dd', 'en'),
      remarks: formValue.remarks,
      termsConditions: '',
      quotationDiscountPercentage: 0,
      packagingAndForwadingCharges: 0,
      items: items
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
  }

  // Customer selection methods
  loadCustomers(): void {
    this.isLoadingCustomers = true;
    this.customerService.getCustomers({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.customers = response.data || [];
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
            this.customers = response.data || [];
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

  onCustomerSelect(event: any): void {
    const customerId = event.value;
    if (customerId) {
      this.selectedCustomerId = customerId;
      this.customerId = customerId;
      this.currentPage = 0;
      this.loadProductsWithPrices();
    } else {
      this.selectedCustomerId = null;
      this.customerId = null;
      this.productsWithPrices = [];
    }
  }

  // Products with prices methods
  loadProductsWithPrices(): void {
    if (!this.selectedCustomerId) {
      return;
    }

    this.isLoadingProductsWithPrices = true;
    const requestData: any = {
      customerId: this.selectedCustomerId,
      page: this.currentPage,
      size: this.pageSize,
      sortBy: this.sortBy,
      sortDir: this.sortDir
    };

    if (this.searchTerm) {
      requestData.search = this.searchTerm;
    }

    this.priceService.getProductsWithPrices(requestData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.productsWithPrices = response.data.content || [];
            this.totalElements = response.data.totalElements || 0;
            this.totalPages = response.data.totalPages || 0;
            this.currentPage = response.data.currentPage || 0;
          } else {
            this.productsWithPrices = [];
            this.totalElements = 0;
            this.totalPages = 0;
          }
          this.isLoadingProductsWithPrices = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          this.snackbar.error(error?.error?.message || 'Failed to load products with prices');
          this.productsWithPrices = [];
          this.isLoadingProductsWithPrices = false;
          this.cdr.detectChanges();
        }
      });
  }

  onSearchChange(searchTerm: string): void {
    this.searchSubject.next(searchTerm);
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadProductsWithPrices();
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.currentPage = 0;
    this.loadProductsWithPrices();
  }

  onSortChange(sortBy: string, sortDir: string): void {
    this.sortBy = sortBy;
    this.sortDir = sortDir;
    this.currentPage = 0;
    this.loadProductsWithPrices();
  }

  updateEffectivePrice(product: any, newPrice: any): void {
    if (!product || !this.selectedCustomerId) {
      return;
    }

    const productId = product.productId;
    if (this.updatingPrices[productId]) {
      return;
    }

    // Convert to number and validate
    const priceValue = parseFloat(newPrice);
    if (isNaN(priceValue) || priceValue < 0) {
      this.snackbar.error('Please enter a valid price (must be a positive number)');
      // Reset to original value
      product.effectivePrice = product.effectivePrice;
      this.cdr.detectChanges();
      return;
    }

    // Check if price actually changed
    if (product.effectivePrice === priceValue) {
      return;
    }

    this.updatingPrices[productId] = true;
    const oldPrice = product.effectivePrice;

    // Call API to save/update customer price
    const requestData = {
      id: null,
      customerId: this.selectedCustomerId,
      productId: productId,
      price: priceValue
    };

    this.priceService.saveCustomerPrice(requestData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            product.effectivePrice = priceValue;
            product.priceSource = 'customer_price';
            // Update customerPriceId if returned in response
            if (response.data?.id) {
              product.customerPriceId = response.data.id;
            }
            this.snackbar.success(response.message || `Price updated from ₹${oldPrice.toFixed(2)} to ₹${priceValue.toFixed(2)}`);
          } else {
            // Revert to old price on failure
            product.effectivePrice = oldPrice;
            this.snackbar.error(response.message || 'Failed to update price');
          }
          this.updatingPrices[productId] = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          // Revert to old price on error
          product.effectivePrice = oldPrice;
          this.snackbar.error(error?.error?.message || 'Failed to update price');
          this.updatingPrices[productId] = false;
          this.cdr.detectChanges();
        }
      });
  }

  getPriceSourceColor(priceSource: string): string {
    if (priceSource === 'customer_price') {
      return 'customer-price';
    } else if (priceSource === 'product_sale_amount') {
      return 'product-sale-price';
    }
    return '';
  }

  getPriceSourceLabel(priceSource: string): string {
    if (priceSource === 'customer_price') {
      return 'Customer Price';
    } else if (priceSource === 'product_sale_amount') {
      return 'Product Sale Price';
    }
    return 'Default Price';
  }

  deleteCustomerPrice(product: any): void {
    if (!product || !product.customerPriceId) {
      this.snackbar.error('No customer price found to delete');
      return;
    }

    const productId = product.productId;
    if (this.deletingPrices[productId]) {
      return;
    }

    // Confirm deletion
    if (!confirm('Are you sure you want to delete this customer price? The price will revert to the product sale amount.')) {
      return;
    }

    this.deletingPrices[productId] = true;

    this.priceService.deleteCustomerPrice(product.customerPriceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            // Update product to use sale amount
            product.effectivePrice = product.saleAmount;
            product.priceSource = 'product_sale_amount';
            product.customerPriceId = null;
            this.snackbar.success(response.message || 'Customer price deleted successfully');
            // Reload products to refresh the list
            this.loadProductsWithPrices();
          } else {
            this.snackbar.error(response.message || 'Failed to delete customer price');
          }
          this.deletingPrices[productId] = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          this.snackbar.error(error?.error?.message || 'Failed to delete customer price');
          this.deletingPrices[productId] = false;
          this.cdr.detectChanges();
        }
      });
  }

  // Expose Math to template
  Math = Math;

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
