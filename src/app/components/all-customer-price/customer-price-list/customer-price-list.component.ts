import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { PriceService } from '../../../services/price.service';
import { CustomerService } from '../../../services/customer.service';
import { ProductService } from '../../../services/product.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';

interface CustomerPrice {
  id: number;
  customerId: number;
  customerName: string;
  productId: number;
  productName: string;
  price: number;
  createdAt: string;
  updatedAt: string;
}

@Component({
  selector: 'app-customer-price-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    LoaderComponent,
    SearchableSelectComponent,
    PaginationComponent
  ],
  templateUrl: './customer-price-list.component.html',
  styleUrls: ['./customer-price-list.component.scss']
})
export class CustomerPriceListComponent implements OnInit, OnDestroy {
  customerPrices: CustomerPrice[] = [];
  searchForm!: FormGroup;
  isLoading = false;

  // Pagination properties
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50, 100];
  totalPages = 0;
  totalElements = 0;
  startIndex = 0;
  endIndex = 0;

  // Dropdown data
  customers: any[] = [];
  products: any[] = [];
  isLoadingCustomers = false;
  isLoadingProducts = false;

  // Delete state
  deletingPrices: { [key: number]: boolean } = {};

  private destroy$ = new Subject<void>();

  constructor(
    private priceService: PriceService,
    private customerService: CustomerService,
    private productService: ProductService,
    private fb: FormBuilder,
    private snackbar: SnackbarService,
    private router: Router
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.loadCustomerPrices();
    this.loadCustomers();
    this.loadProducts();
  }

  private initializeForm(): void {
    this.searchForm = this.fb.group({
      search: [''],
      customerId: [''],
      productId: ['']
    });
  }

  loadCustomerPrices(): void {
    this.isLoading = true;
    const formValues = this.searchForm.value;
    
    const params: any = {
      page: this.currentPage,
      size: this.pageSize
    };

    if (formValues.customerId) {
      params.customerId = formValues.customerId;
    }

    if (formValues.productId) {
      params.productId = formValues.productId;
    }

    if (formValues.search) {
      params.search = formValues.search;
    }

    this.priceService.searchCustomerPrices(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.customerPrices = response.data.content || [];
            this.totalPages = response.data.totalPages || 0;
            this.totalElements = response.data.totalElements || 0;
            this.startIndex = this.currentPage * this.pageSize;
            this.endIndex = Math.min((this.currentPage + 1) * this.pageSize, this.totalElements);
          } else {
            this.snackbar.error(response.message || 'Failed to load customer prices');
            this.customerPrices = [];
            this.totalPages = 0;
            this.totalElements = 0;
          }
          this.isLoading = false;
        },
        error: (error) => {
          this.snackbar.error(error?.error?.message || 'Failed to load customer prices');
          this.customerPrices = [];
          this.totalPages = 0;
          this.totalElements = 0;
          this.isLoading = false;
        }
      });
  }

  onSearch(): void {
    this.currentPage = 0;
    this.loadCustomerPrices();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadCustomerPrices();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize = newSize;
    this.currentPage = 0;
    this.loadCustomerPrices();
  }

  resetForm(): void {
    this.searchForm.reset();
    this.currentPage = 0;
    this.loadCustomerPrices();
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
        error: (error) => {
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
        error: (error) => {
          this.snackbar.error('Failed to refresh customers');
          this.isLoadingCustomers = false;
        }
      });
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
        error: (error) => {
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
        error: (error) => {
          this.snackbar.error('Failed to refresh products');
          this.isLoadingProducts = false;
        }
      });
  }

  navigateToAdd(): void {
    this.router.navigate(['/customer-price/add']);
  }

  deleteCustomerPrice(customerPrice: CustomerPrice): void {
    if (!customerPrice || !customerPrice.id) {
      this.snackbar.error('No customer price found to delete');
      return;
    }

    if (this.deletingPrices[customerPrice.id]) {
      return;
    }

    // Confirm deletion
    if (!confirm(`Are you sure you want to delete the customer price for ${customerPrice.customerName} - ${customerPrice.productName}?`)) {
      return;
    }

    this.deletingPrices[customerPrice.id] = true;

    this.priceService.deleteCustomerPrice(customerPrice.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.snackbar.success(response.message || 'Customer price deleted successfully');
            // Reload the list
            this.loadCustomerPrices();
          } else {
            this.snackbar.error(response.message || 'Failed to delete customer price');
          }
          this.deletingPrices[customerPrice.id] = false;
        },
        error: (error) => {
          this.snackbar.error(error?.error?.message || 'Failed to delete customer price');
          this.deletingPrices[customerPrice.id] = false;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
