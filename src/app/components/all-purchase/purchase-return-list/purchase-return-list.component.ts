import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { PurchaseService } from '../../../services/purchase.service';
import { CustomerService } from '../../../services/customer.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { DateUtils } from '../../../shared/utils/date-utils';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { AuthService } from '../../../services/auth.service';

interface PurchaseReturn {
  id: number;
  totalPurchaseAmount: number;
  discountAmount?: number;
  purchaseReturnDate: string;
  invoiceNumber: string;
  customerName: string;
  purchaseId?: number | null;
}

interface PurchaseReturnSearchRequest {
  currentPage: number;
  perPageRecord: number;
  search?: string;
  customerId?: number;
  purchaseId?: number;
  startDate?: string;
  endDate?: string;
  clientId: number;
}

interface PurchaseReturnResponse {
  content: PurchaseReturn[];
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
  selector: 'app-purchase-return-list',
  templateUrl: './purchase-return-list.component.html',
  styleUrls: ['./purchase-return-list.component.scss']
})
export class PurchaseReturnListComponent implements OnInit, OnDestroy {
  purchaseReturns: PurchaseReturn[] = [];
  searchForm!: FormGroup;
  isLoading = false;

  // Pagination properties
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50, 100];
  totalPages = 0;
  totalElements = 0;
  totalPurchaseReturnAmountSum: number | null = null;
  startIndex = 0;
  endIndex = 0;

  // Dropdown data
  customers: any[] = [];
  isLoadingCustomers = false;
  canManagePurchases = false;

  // Client ID - can be made configurable
  clientId = 1;

  private destroy$ = new Subject<void>();

  constructor(
    private purchaseService: PurchaseService,
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
    this.loadPurchaseReturns();
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

  private calculateTotalPurchaseReturnAmount(rows: PurchaseReturn[]): number {
    let sum = 0;
    for (const row of rows ?? []) {
      const value = row?.totalPurchaseAmount as unknown;
      if (typeof value === 'number') {
        sum += isFinite(value) ? value : 0;
      } else if (value !== null && value !== undefined) {
        const n = Number(value);
        sum += isFinite(n) ? n : 0;
      }
    }
    return sum;
  }

  loadPurchaseReturns(): void {
    this.isLoading = true;
    this.totalPurchaseReturnAmountSum = null;
    const formValues = this.searchForm.value;

    const params: PurchaseReturnSearchRequest = {
      currentPage: this.currentPage,
      perPageRecord: this.pageSize,
      clientId: this.clientId,
      search: formValues.search?.trim() || undefined,
      customerId: this.canManagePurchases && formValues.customerId ? Number(formValues.customerId) : undefined,
      startDate: formValues.startDate ? this.dateUtils.formatDate(formValues.startDate) : undefined,
      endDate: formValues.endDate ? this.dateUtils.formatDate(formValues.endDate) : undefined
    };

    // Remove undefined values
    Object.keys(params).forEach(key => {
      if (params[key as keyof PurchaseReturnSearchRequest] === undefined) {
        delete params[key as keyof PurchaseReturnSearchRequest];
      }
    });

    this.purchaseService.searchPurchaseReturn(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: PurchaseReturnResponse) => {
          this.purchaseReturns = response.content || [];
          this.totalPurchaseReturnAmountSum = this.calculateTotalPurchaseReturnAmount(this.purchaseReturns);
          this.totalPages = response.totalPages || 0;
          this.totalElements = response.totalElements || 0;
          this.updatePaginationIndexes();
          this.isLoading = false;
        },
        error: (error: any) => {
          this.snackbar.error(error?.error?.message || 'Failed to load purchase returns');
          this.isLoading = false;
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
    this.loadPurchaseReturns();
  }

  resetForm(): void {
    this.searchForm.reset();
    this.currentPage = 0;
    this.loadPurchaseReturns();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadPurchaseReturns();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize = newSize;
    this.currentPage = 0;
    this.loadPurchaseReturns();
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

  viewDetails(id: number): void {
    const encryptedId = this.encryptionService.encrypt(id.toString());
    this.router.navigate(['/purchase/return', encryptedId]);
  }

  /** Open standalone purchase return for view/edit by return id */
  viewStandaloneDetails(id: number): void {
    if (!id) {
      this.snackbar.error('Purchase return ID is not available');
      return;
    }
    const encryptedId = this.encryptionService.encrypt(id.toString());
    this.router.navigate(['/purchase/standalone-purchase-return', encryptedId]);
  }


  deletePurchaseReturn(id: number): void {
    if (confirm('Are you sure you want to delete this purchase return? This action cannot be undone.')) {
      this.isLoading = true;
      this.purchaseService.deletePurchaseReturn(id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (response?.success) {
              this.snackbar.success(response.message || 'Purchase return deleted successfully');
              this.loadPurchaseReturns();
            } else {
              this.snackbar.error(response?.message || 'Failed to delete purchase return');
              this.isLoading = false;
            }
          },
          error: (error) => {
            this.snackbar.error(error?.error?.message || 'Failed to delete purchase return');
            this.isLoading = false;
          }
        });
    }
  }

  generatePdf(id: number, invoiceNumber?: string): void {
    this.purchaseService.generatePurchaseReturnPdf(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ blob, filename }) => {
          // Use invoiceNumber if available, otherwise use the filename from response
          const pdfFilename = 'purchase-return-' + (invoiceNumber ? `${invoiceNumber}.pdf` : filename);
          
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
    this.purchaseService.exportPurchaseReturnExcel({
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
          link.download = filename || `purchase_return_export_${formattedStartDate}_${formattedEndDate}.xlsx`;
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
