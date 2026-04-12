import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SaleService } from '../../services/sale.service';
import { Sale, SaleSearchRequest } from '../../models/sale.model';
import { ToastrService } from 'ngx-toastr';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { DateUtils } from '../../shared/utils/date-utils';
import { Router, RouterModule } from '@angular/router';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';
import { RoundPipe } from '../../round.pipe';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { SaleModalComponent } from '../sale-modal/sale-modal.component';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../shared/components/searchable-select/searchable-select.component';
import { CustomerService } from '../../services/customer.service';
import { ModalService } from '../../services/modal.service';
import { CacheService } from '../../shared/services/cache.service';
import { EncryptionService } from '../../shared/services/encryption.service';
import { AuthService, UserRole } from '../../services/auth.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-sale',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    MatDialogModule,
    SaleModalComponent,
    LoaderComponent,
    SearchableSelectComponent,
    PaginationComponent,
    RoundPipe
  ],
  templateUrl: './sale.component.html',
  styleUrl: './sale.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SaleComponent implements OnInit, OnDestroy {
  sales: Sale[] = [];
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
  selectedSales: Sale | null = null;
  products: Sale[] = [];
  isLoadingProducts = false;
  customers: any[] = [];
  isLoadingCustomers = false;
  canManageSales = false;
  private destroy$ = new Subject<void>();

  constructor(
    private saleService: SaleService,
    private customerService: CustomerService,
    private fb: FormBuilder,
    private snackbar: SnackbarService,
    private dialog: MatDialog,
    private modalService: ModalService,
    private dateUtils: DateUtils,
    private cacheService: CacheService,
    private encryptionService: EncryptionService,
    private router: Router,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.canManageSales = this.authService.isAdmin() || this.authService.isStaffAdmin();
    this.loadSales();
    if (this.canManageSales) {
      this.loadCustomers();
    }
  }

  private initializeForm(): void {
    this.searchForm = this.fb.group({
      search: [''],
      customerId: [''],
      startDate: [''],
      endDate: [''],
      batchNumber: ['']
    });
  }

  onSearch(): void {
    this.currentPage = 0;
    this.loadSales();
  }

  private formatDateForApi(dateStr: string, isStartDate: boolean): string {
    if (!dateStr) return '';

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';

    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const time = isStartDate ? '00:00:00' : '23:59:59';

    return `${day}-${month}-${year} ${time}`;
  }

  loadSalesRecord(): void {
    this.isLoading = true;
    const formValues = this.searchForm.value;

    const startDate = formValues.startDate ? this.formatDateForApi(formValues.startDate, true) : '';
    const endDate = formValues.endDate ? this.formatDateForApi(formValues.endDate, false) : '';

    const params: SaleSearchRequest = {
      currentPage: this.currentPage,
      perPageRecord: this.pageSize,
      search: formValues.search || ''
    };

    // Only add dates if they are not empty
    if (startDate) {
      params.startDate = startDate;
    }
    if (endDate) {
      params.endDate = endDate;
    }

    this.saleService.searchSales(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.sales = response.data.content;
          this.totalPages = response.data.totalPages;
          this.totalElements = response.data.totalElements;
          this.startIndex = this.currentPage * this.pageSize;
          this.endIndex = Math.min((this.currentPage + 1) * this.pageSize, this.totalElements);
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.snackbar.error('Failed to load sales');
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
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

  deleteSale(id: number): void {
    if (confirm('Are you sure you want to delete this sale? This action cannot be undone.')) {
      this.isLoading = true;
      this.saleService.deleteSale(id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (response.success) {
              this.snackbar.success('Sale deleted successfully');
              this.loadSales();
            } else {
              this.snackbar.error(response.message || 'Failed to delete sale');
              this.isLoading = false;
              this.cdr.markForCheck();
            }
          },
          error: (error) => {
            this.snackbar.error(error?.error?.message || 'Failed to delete sale');
            this.isLoading = false;
            this.cdr.markForCheck();
          }
        });
    }
  }

  formatDate(date: string): string {
    return this.dateUtils.formatDate(date);
  }

  resetForm(): void {
    this.searchForm.reset();
    this.currentPage = 0;
    this.loadSales();
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
        error: (error) => {
          this.snackbar.error('Failed to load customers');
          this.isLoadingCustomers = false;
          this.cdr.markForCheck();
        }
      });
  }

  refreshCustomers(): void {
    if (!this.canManageSales) {
      return;
    }
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
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.snackbar.error('Failed to refresh customers');
          this.isLoadingCustomers = false;
          this.cdr.markForCheck();
        }
      });
  }

  editSales(id: number): void {
    localStorage.setItem('saleId', this.encryptionService.encrypt(id.toString())); // Save the ID to local storage
    this.router.navigate(['/sale/create']);
  }

  addSaleReturn(id: number): void {
    const encryptedId = this.encryptionService.encrypt(id.toString());
    this.router.navigate(['/sale/return', encryptedId]);
  }

  generatePdf(id: number, invoiceNumber?: string): void {
    this.saleService.generatePdf(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ blob, filename }) => {
          // Use invoiceNumber if available, otherwise use the filename from response
          const pdfFilename = 'sale-' + (invoiceNumber ? `${invoiceNumber}.pdf` : filename);
          
          // Create a download link
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = pdfFilename;
          document.body.appendChild(link);
          link.click();
          
          // Clean up
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          
          this.snackbar.success('PDF downloaded successfully');
        },
        error: (error) => {
          this.snackbar.error(error?.error?.message || 'Failed to generate PDF');
        }
      });
  }

  isExportButtonDisabled(): boolean {
    const startDate = this.searchForm.get('startDate')?.value;
    const endDate = this.searchForm.get('endDate')?.value;
    return !startDate || !endDate;
  }

  exportExcel(): void {
    const startDate = this.searchForm.get('startDate')?.value;
    const endDate = this.searchForm.get('endDate')?.value;

    if (!startDate || !endDate) {
      this.snackbar.error('Please select both start date and end date to export');
      return;
    }

    const formattedStartDate = this.dateUtils.formatDateDDMMYYYY(startDate);
    const formattedEndDate = this.dateUtils.formatDateDDMMYYYY(endDate);

    this.isLoading = true;
    this.saleService.exportExcel({
      startDate: formattedStartDate,
      endDate: formattedEndDate
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ blob, filename }) => {
          // Create a download link
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename || `sale_export_${formattedStartDate}_${formattedEndDate}.xlsx`;
          document.body.appendChild(link);
          link.click();
          
          // Clean up
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          
          this.snackbar.success('Excel file downloaded successfully');
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.snackbar.error(error?.error?.message || 'Failed to export Excel file');
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  loadSales(): void {
    this.isLoading = true;
    const params = {
      currentPage: this.currentPage,
      perPageRecord: this.pageSize,
      startDate: this.searchForm.value.startDate ? this.dateUtils.formatDate(this.searchForm.value.startDate) : '',
      endDate: this.searchForm.value.endDate ? this.dateUtils.formatDate(this.searchForm.value.endDate) : '',
      ...this.searchForm.value,
    };

    this.saleService.searchSales(params)
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
          this.snackbar.error(error.message || 'Failed to load sales');
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  clearLocalStorage(): void {
    localStorage.removeItem('saleId');
    this.router.navigate(['/sale/create']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}