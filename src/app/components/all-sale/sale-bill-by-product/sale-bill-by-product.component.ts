import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { SaleService } from '../../../services/sale.service';
import { Sale } from '../../../models/sale.model';
import { ProductService } from '../../../services/product.service';
import { CustomerService } from '../../../services/customer.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { DateUtils } from '../../../shared/utils/date-utils';
import { AuthService, UserRole } from '../../../services/auth.service';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-sale-bill-by-product',
  standalone: false,
  templateUrl: './sale-bill-by-product.component.html',
  styleUrl: './sale-bill-by-product.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SaleBillByProductComponent implements OnInit, OnDestroy {
  sales: Sale[] = [];
  searchForm!: FormGroup;
  isLoading = false;

  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50, 100];
  totalPages = 0;
  totalElements = 0;
  startIndex = 0;
  endIndex = 0;

  products: any[] = [];
  isLoadingProducts = false;
  customers: any[] = [];
  isLoadingCustomers = false;
  canManageSales = false;
  isDealerUser = false;
  exportingPdfId: number | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private saleService: SaleService,
    private productService: ProductService,
    private customerService: CustomerService,
    private fb: FormBuilder,
    private snackbar: SnackbarService,
    private dateUtils: DateUtils,
    private encryptionService: EncryptionService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.canManageSales = this.authService.isAdmin() || this.authService.isStaffAdmin();
    this.isDealerUser = this.authService.hasRole(UserRole.DEALER);
    this.loadProducts();
    if (this.canManageSales) {
      this.loadCustomers();
    }
  }

  private initializeForm(): void {
    this.searchForm = this.fb.group({
      productId: [''],
      customerId: [''],
      search: [''],
      startDate: [''],
      endDate: ['']
    });
  }

  onSearch(): void {
    if (!this.searchForm.value.productId) {
      this.snackbar.error('Please select a product first');
      return;
    }
    this.currentPage = 0;
    this.loadSales();
  }

  resetForm(): void {
    this.searchForm.reset();
    this.currentPage = 0;
    this.sales = [];
    this.totalPages = 0;
    this.totalElements = 0;
    this.cdr.markForCheck();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadSales();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize = newSize;
    this.currentPage = 0;
    this.loadSales();
  }

  private mapProducts(products: any[]): any[] {
    return (products || []).map(p => ({
      ...p,
      displayLabel: p.name + (p.materialName ? ' (' + p.materialName + ')' : '') + (p.productCode ? ' (' + p.productCode + ')' : '')
    }));
  }

  private loadProducts(): void {
    this.isLoadingProducts = true;
    this.productService.getProducts({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.products = this.mapProducts(response.data);
          }
          this.isLoadingProducts = false;
          this.cdr.markForCheck();
        },
        error: () => {
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
            this.products = this.mapProducts(response.data);
            this.snackbar.success('Products refreshed successfully');
          }
          this.isLoadingProducts = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingProducts = false;
          this.cdr.markForCheck();
        }
      });
  }

  private loadCustomers(): void {
    if (!this.canManageSales) {
      return;
    }
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
        error: () => {
          this.isLoadingCustomers = false;
          this.cdr.markForCheck();
        }
      });
  }

  loadSales(): void {
    const productId = this.searchForm.value.productId;
    if (!productId) {
      return;
    }

    this.isLoading = true;
    const params: any = {
      productId: Number(productId),
      currentPage: this.currentPage,
      perPageRecord: this.pageSize
    };

    const formValue = this.searchForm.value;
    if (formValue.customerId) {
      params.customerId = Number(formValue.customerId);
    }
    if (formValue.search) {
      params.search = formValue.search;
    }
    if (formValue.startDate) {
      params.startDate = this.dateUtils.formatDate(formValue.startDate);
    }
    if (formValue.endDate) {
      params.endDate = this.dateUtils.formatDate(formValue.endDate);
    }

    this.saleService.searchSaleBillsByProduct(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          this.sales = response.content;
          this.totalPages = response.totalPages;
          this.totalElements = response.totalElements;
          this.startIndex = this.currentPage * this.pageSize;
          this.endIndex = Math.min((this.currentPage + 1) * this.pageSize, this.totalElements);
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.snackbar.error(error.error?.message || 'Failed to load sale bills');
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  generatePdf(id: number, invoiceNumber?: string): void {
    if (this.exportingPdfId !== null) {
      return;
    }
    this.exportingPdfId = id;
    this.cdr.markForCheck();
    this.saleService.generatePdf(id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.exportingPdfId = null;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: ({ blob, filename }) => {
          const pdfFilename = invoiceNumber ? `sale-${invoiceNumber}.pdf` : filename;
          this.downloadFile(blob, pdfFilename);
          this.snackbar.success('PDF downloaded successfully');
        },
        error: (error) => {
          this.snackbar.error(error?.error?.message || 'Failed to generate PDF');
        }
      });
  }

  private downloadFile(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  getEditRoute(id: number): string[] {
    return ['/sale/edit', this.encryptionService.encrypt(id.toString())];
  }

  formatDate(date: string): string {
    return this.dateUtils.formatDate(date);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
