import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PurchaseService } from '../../../services/purchase.service';
import { Purchase } from '../../../models/purchase.model';
import { Router, RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { SaleModalComponent } from '../../sale-modal/sale-modal.component';
import { ModalService } from '../../../services/modal.service';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { Product } from '../../../models/product.model';
import { ProductService } from '../../../services/product.service';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { DateUtils } from '../../../shared/utils/date-utils';
import { CacheService } from '../../../shared/services/cache.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { CustomerService } from '../../../services/customer.service';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { AuthService, UserRole } from '../../../services/auth.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-purchase',
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
    PaginationComponent
  ],
  templateUrl: './purchase.component.html',
  styleUrls: ['./purchase.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PurchaseComponent implements OnInit, OnDestroy {
  purchases: Purchase[] = [];
  searchForm!: FormGroup;
  isLoading = false;

  // Pagination properties
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50, 100];
  totalPages = 0;
  totalElements = 0;
  totalPurchaseAmountSum: number | null = null;
  startIndex = 0;
  endIndex = 0;
  selectedPurchase: Purchase | null = null;
  products: Product[] = [];
  isLoadingProducts = false;
  customers: any[] = [];
  isLoadingCustomers = false;
  canManagePurchases = false;
  private destroy$ = new Subject<void>();

  constructor(
    private purchaseService: PurchaseService,
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
    this.canManagePurchases = this.authService.isAdmin() || this.authService.isStaffAdmin();
    this.loadPurchases();
    if (this.canManagePurchases) {
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

  private calculateTotalPurchaseAmount(rows: Purchase[]): number {
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

  loadPurchases(): void {
    this.isLoading = true;
    this.totalPurchaseAmountSum = null;
    const params = {
      currentPage: this.currentPage,
      perPageRecord: this.pageSize,
      startDate: this.searchForm.value.startDate ? this.dateUtils.formatDate(this.searchForm.value.startDate) : '',
      endDate: this.searchForm.value.endDate ? this.dateUtils.formatDate(this.searchForm.value.endDate) : '',
      ...this.searchForm.value,
    };

    this.purchaseService.searchPurchases(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.purchases = response.content;
          this.totalPurchaseAmountSum = this.calculateTotalPurchaseAmount(this.purchases);
          this.totalPages = response.totalPages;
          this.totalElements = response.totalElements;
          this.startIndex = this.currentPage * this.pageSize;
          this.endIndex = Math.min((this.currentPage + 1) * this.pageSize, this.totalElements);
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.snackbar.error(error.message || 'Failed to load purchases');
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  onSearch(): void {
    this.currentPage = 0;
    this.loadPurchases();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadPurchases();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize = newSize;
    this.currentPage = 0;
    this.loadPurchases();
  }

  openSaleModal(purchase: Purchase) {
    this.selectedPurchase = purchase;
    this.modalService.open('sale');
  }

  deletePurchase(id: number): void {
    if (confirm('Are you sure you want to delete this purchase? This action cannot be undone.')) {
      this.isLoading = true;
      this.purchaseService.deletePurchase(id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.snackbar.success('Purchase deleted successfully');
            this.loadPurchases();
          },
          error: (error) => {
            this.snackbar.error(error?.error?.message || 'Failed to delete purchase');
            this.isLoading = false;
            this.cdr.markForCheck();
          }
        });
    }
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
    if (!this.canManagePurchases) {
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

  resetForm(): void {
    this.searchForm.reset();
    this.currentPage = 0;
    this.loadPurchases();
  }


  editPurchase(id: number): void {
    localStorage.setItem('purchaseId', this.encryptionService.encrypt(id.toString())); // Save the ID to local storage
    this.router.navigate(['/purchase/create']);
  }

  clearLocalStorage(): void {
    localStorage.removeItem('purchaseId');
    this.router.navigate(['/purchase/create']);
  }

  openReturn(id: number): void {
    const encryptedId = this.encryptionService.encrypt(id.toString());
    this.router.navigate(['/purchase/return', encryptedId]);
  }

  openQc(id: number): void {
    const encryptedId = this.encryptionService.encrypt(id.toString());
    this.router.navigate(['/purchase/qc', encryptedId]);
  }

  generatePdf(id: number, invoiceNumber?: string): void {
    this.purchaseService.generatePdf(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ blob, filename }) => {
          // Use invoiceNumber if available, otherwise use the filename from response
          const pdfFilename = 'purchase-' + (invoiceNumber ? `${invoiceNumber}.pdf` : filename);
          
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
    this.purchaseService.exportExcel({
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
          link.download = filename || `purchase_export_${formattedStartDate}_${formattedEndDate}.xlsx`;
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}