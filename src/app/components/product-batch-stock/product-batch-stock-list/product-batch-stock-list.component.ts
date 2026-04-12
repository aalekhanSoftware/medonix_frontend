import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { ProductBatchStockService } from '../../../services/product-batch-stock.service';
import { ProductService } from '../../../services/product.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { AuthService } from '../../../services/auth.service';
import { ProductBatchStock, ProductBatchStockSearchRequest, ProductBatchStockResponse } from '../../../models/product-batch-stock.model';

@Component({
  selector: 'app-product-batch-stock-list',
  standalone: false,
  templateUrl: './product-batch-stock-list.component.html',
  styleUrls: ['./product-batch-stock-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductBatchStockListComponent implements OnInit, OnDestroy {
  batchStocks: ProductBatchStock[] = [];
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
  products: any[] = [];
  isLoadingProducts = false;
  canManageStock = false;

  // Sorting
  sortBy = 'id';
  sortDir: 'asc' | 'desc' = 'desc';

  private destroy$ = new Subject<void>();
  private productMap: Map<number, any> = new Map();

  constructor(
    private productBatchStockService: ProductBatchStockService,
    private productService: ProductService,
    private fb: FormBuilder,
    private snackbar: SnackbarService,
    private encryptionService: EncryptionService,
    private router: Router,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.canManageStock = this.authService.isAdmin() || this.authService.isStaffAdmin();
    this.loadProducts();
    this.setupSearchDebounce();
    this.loadBatchStocks();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.productMap.clear();
  }

  private initializeForm(): void {
    this.searchForm = this.fb.group({
      search: [''],
      productId: ['']
    });
  }

  private setupSearchDebounce(): void {
    // Debounce search input for better performance
    this.searchForm.get('search')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(500),
        distinctUntilChanged()
      )
      .subscribe(() => {
        this.currentPage = 0;
        this.loadBatchStocks();
      });

    // Reload when product filter changes
    this.searchForm.get('productId')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged()
      )
      .subscribe(() => {
        this.currentPage = 0;
        this.loadBatchStocks();
      });
  }

  loadBatchStocks(): void {
    this.isLoading = true;
    const formValues = this.searchForm.value;

    const params: ProductBatchStockSearchRequest = {
      page: this.currentPage,
      size: this.pageSize,
      sortBy: this.sortBy,
      sortDir: this.sortDir,
      search: formValues.search?.trim() || undefined,
      productId: formValues.productId ? Number(formValues.productId) : undefined
    };

    // Remove undefined values
    Object.keys(params).forEach(key => {
      if (params[key as keyof ProductBatchStockSearchRequest] === undefined) {
        delete params[key as keyof ProductBatchStockSearchRequest];
      }
    });

    this.productBatchStockService.searchProductBatchStock(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: ProductBatchStockResponse) => {
          this.batchStocks = response.content || [];
          this.totalPages = response.totalPages || 0;
          this.totalElements = response.totalElements || 0;
          this.updatePaginationIndexes();
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error: any) => {
          this.snackbar.error(error?.error?.message || 'Failed to load batch stock data');
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  updatePaginationIndexes(): void {
    this.startIndex = this.currentPage * this.pageSize;
    this.endIndex = Math.min((this.currentPage + 1) * this.pageSize, this.totalElements);
  }

  onSearch(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.currentPage = 0;
    this.loadBatchStocks();
  }

  resetForm(): void {
    this.searchForm.reset();
    this.currentPage = 0;
    this.sortBy = 'id';
    this.sortDir = 'desc';
    this.loadBatchStocks();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadBatchStocks();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize = newSize;
    this.currentPage = 0;
    this.loadBatchStocks();
  }

  onSort(column: string): void {
    if (this.sortBy === column) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = column;
      this.sortDir = 'asc';
    }
    this.currentPage = 0;
    this.loadBatchStocks();
  }

  getSortIcon(column: string): string {
    if (this.sortBy !== column) {
      return 'fa-sort';
    }
    return this.sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
  }

  private loadProducts(): void {
    this.isLoadingProducts = true;
    this.productService.getProducts({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response?.success && response.data) {
            this.products = response.data;
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

  private buildProductMap(): void {
    this.productMap.clear();
    for (const product of this.products) {
      this.productMap.set(product.id, product);
    }
  }

  getProductName(productId: number): string {
    const product = this.productMap.get(productId);
    return product?.name || 'N/A';
  }

  refreshProducts(): void {
    this.isLoadingProducts = true;
    this.productService.refreshProducts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response?.success && response.data) {
            this.products = response.data;
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

  addBatchStock(): void {
    this.router.navigate(['/product-batch-stock/create']);
  }

  editBatchStock(id: number): void {
    const encryptedId = this.encryptionService.encrypt(id.toString());
    this.router.navigate(['/product-batch-stock/edit', encryptedId]);
  }

  deleteBatchStock(id: number): void {
    if (confirm('Are you sure you want to delete this batch stock entry? This action cannot be undone.')) {
      this.isLoading = true;
      this.productBatchStockService.deleteProductBatchStock(id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (response?.success) {
              this.snackbar.success(response.message || 'Batch stock deleted successfully');
              this.loadBatchStocks();
            } else {
              this.snackbar.error(response?.message || 'Failed to delete batch stock');
              this.isLoading = false;
              this.cdr.markForCheck();
            }
          },
          error: (error) => {
            this.snackbar.error(error?.error?.message || 'Failed to delete batch stock');
            this.isLoading = false;
            this.cdr.markForCheck();
          }
        });
    }
  }

  formatNumber(value: number | undefined): string {
    if (value === undefined || value === null) {
      return '0.00';
    }
    return Number(value).toFixed(2);
  }
}
