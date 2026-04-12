import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { SaleService } from '../../services/sale.service';
import { CustomerService } from '../../services/customer.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../shared/components/searchable-select/searchable-select.component';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';
import { DateUtils } from '../../shared/utils/date-utils';
import { EncryptionService } from '../../shared/services/encryption.service';
import { AuthService, UserRole } from '../../services/auth.service';

interface SaleReturn {
  id: number;
  totalSaleAmount: number;
  saleReturnDate: string;
  invoiceNumber: string;
  customerName: string;
  saleId?: number; // Optional since API may not always return it
}

interface SaleReturnSearchRequest {
  currentPage: number;
  perPageRecord: number;
  search?: string;
  customerId?: number;
  saleId?: number;
  startDate?: string;
  endDate?: string;
}

interface SaleReturnResponse {
  content: SaleReturn[];
  pageable: {
    pageNumber: number;
    pageSize: number;
    sort: {
      empty: boolean;
      sorted: boolean;
      unsorted: boolean;
    };
  };
  totalElements: number;
  totalPages: number;
  last: boolean;
  size: number;
  number: number;
  sort: {
    empty: boolean;
    sorted: boolean;
    unsorted: boolean;
  };
  numberOfElements: number;
  first: boolean;
  empty: boolean;
}

@Component({
  selector: 'app-sale-return-list',
  templateUrl: './sale-return-list.component.html',
  styleUrls: ['./sale-return-list.component.scss']
})
export class SaleReturnListComponent implements OnInit, OnDestroy {
  saleReturns: SaleReturn[] = [];
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
  isLoadingCustomers = false;
  canManagePurchases = false;

  private destroy$ = new Subject<void>();

  constructor(
    private saleService: SaleService,
    private customerService: CustomerService,
    private fb: FormBuilder,
    private snackbar: SnackbarService,
    private dateUtils: DateUtils,
    private encryptionService: EncryptionService,
    private router: Router,
    private authService: AuthService
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.canManagePurchases = this.authService.isAdmin() || this.authService.isStaffAdmin();
    this.loadSaleReturns();
    if (this.canManagePurchases) {
      this.loadCustomers();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForm(): void {
    this.searchForm = this.fb.group({
      search: [''],
      batchNumber: [''],
      customerId: [''],
      startDate: [''],
      endDate: ['']
    });
  }

  loadSaleReturns(): void {
    this.isLoading = true;
    const formValues = this.searchForm.value;

    const params: SaleReturnSearchRequest = {
      currentPage: this.currentPage,
      perPageRecord: this.pageSize,
      search: formValues.search?.trim() || undefined,
      customerId: this.canManagePurchases && formValues.customerId ? Number(formValues.customerId) : undefined,
      startDate: formValues.startDate ? this.formatDateForApi(formValues.startDate) : undefined,
      endDate: formValues.endDate ? this.formatDateForApi(formValues.endDate) : undefined
    };

    // Remove undefined values
    Object.keys(params).forEach(key => {
      if (params[key as keyof SaleReturnSearchRequest] === undefined) {
        delete params[key as keyof SaleReturnSearchRequest];
      }
    });

    this.saleService.searchSaleReturn(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: SaleReturnResponse) => {
          this.saleReturns = response.content || [];
          this.totalPages = response.totalPages || 0;
          this.totalElements = response.totalElements || 0;
          this.updatePaginationIndexes();
          this.isLoading = false;
        },
        error: (error: any) => {
          this.snackbar.error(error?.error?.message || 'Failed to load sale returns');
          this.isLoading = false;
        }
      });
  }

  private formatDateForApi(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
    this.loadSaleReturns();
  }

  resetForm(): void {
    this.searchForm.reset();
    this.currentPage = 0;
    this.loadSaleReturns();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadSaleReturns();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize = newSize;
    this.currentPage = 0;
    this.loadSaleReturns();
  }

  private loadCustomers(): void {
    if (!this.canManagePurchases) {
      return;
    }
    this.isLoadingCustomers = true;
    this.customerService.getCustomers({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response?.success && response.data) {
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
    if (!this.canManagePurchases) {
      return;
    }
    this.isLoadingCustomers = true;
    this.customerService.refreshCustomers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response?.success && response.data) {
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


  viewDetails(id: number | undefined): void {
    if (!id) {
      this.snackbar.error('Sale return ID is not available');
      return;
    }
    const encryptedId = this.encryptionService.encrypt(id.toString());
    this.router.navigate(['/sale/return', encryptedId]);
  }


  deleteSaleReturn(id: number): void {
    if (confirm('Are you sure you want to delete this sale return? This action cannot be undone.')) {
      this.isLoading = true;
      this.saleService.deleteSaleReturn(id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (response?.success) {
              this.snackbar.success(response.message || 'Sale return deleted successfully');
              this.loadSaleReturns();
            } else {
              this.snackbar.error(response?.message || 'Failed to delete sale return');
              this.isLoading = false;
            }
          },
          error: (error) => {
            this.snackbar.error(error?.error?.message || 'Failed to delete sale return');
            this.isLoading = false;
          }
        });
    }
  }

  generatePdf(id: number, invoiceNumber?: string): void {
    this.saleService.generateSaleReturnPdf(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ blob, filename }) => {
          // Use invoiceNumber if available, otherwise use the filename from response
          const pdfFilename = 'sale-return-' + (invoiceNumber ? `${invoiceNumber}.pdf` : filename);
          
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
    this.saleService.exportSaleReturnExcel({
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
          link.download = filename || `sale_return_export_${formattedStartDate}_${formattedEndDate}.xlsx`;
          document.body.appendChild(link);
          link.click();
          
          // Clean up
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          
          this.snackbar.success('Excel file downloaded successfully');
          this.isLoading = false;
        },
        error: (error) => {
          this.snackbar.error(error?.error?.message || 'Failed to export Excel file');
          this.isLoading = false;
        }
      });
  }
}
