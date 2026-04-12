import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PurchaseChallanService } from '../../../services/purchase-challan.service';
import { PurchaseChallan } from '../../../models/purchase-challan.model';
import { Router, RouterModule } from '@angular/router';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { Product } from '../../../models/product.model';
import { ProductService } from '../../../services/product.service';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { DateUtils } from '../../../shared/utils/date-utils';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { CustomerService } from '../../../services/customer.service';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { AuthService, UserRole } from '../../../services/auth.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-purchase-challan',
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
  templateUrl: './purchase-challan.component.html',
  styleUrls: ['./purchase-challan.component.scss']
})
export class PurchaseChallanComponent implements OnInit, OnDestroy {
  purchaseChallans: PurchaseChallan[] = [];
  searchForm!: FormGroup;
  isLoading = false;

  // Pagination properties
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50, 100];
  totalPages = 0;
  totalElements = 0;
  totalChallanAmountSum: number | null = null;
  startIndex = 0;
  endIndex = 0;
  products: Product[] = [];
  isLoadingProducts = false;
  customers: any[] = [];
  isLoadingCustomers = false;
  canManagePurchaseChallans = false;
  private destroy$ = new Subject<void>();

  constructor(
    private purchaseChallanService: PurchaseChallanService,
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
    this.canManagePurchaseChallans = this.authService.isAdmin() || this.authService.isStaffAdmin();
    this.loadPurchaseChallans();
    if (this.canManagePurchaseChallans) {
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

  private calculateTotalChallanAmount(rows: PurchaseChallan[]): number {
    let sum = 0;
    for (const row of rows ?? []) {
      const value = row?.totalChallanAmount as unknown;
      if (typeof value === 'number') {
        sum += isFinite(value) ? value : 0;
      } else if (value !== null && value !== undefined) {
        const n = Number(value);
        sum += isFinite(n) ? n : 0;
      }
    }
    return sum;
  }

  loadPurchaseChallans(): void {
    this.isLoading = true;
    this.totalChallanAmountSum = null;
    const params = {
      currentPage: this.currentPage,
      perPageRecord: this.pageSize,
      startDate: this.searchForm.value.startDate ? this.dateUtils.formatDate(this.searchForm.value.startDate) : '',
      endDate: this.searchForm.value.endDate ? this.dateUtils.formatDate(this.searchForm.value.endDate) : '',
      ...this.searchForm.value,
    };

    this.purchaseChallanService.searchPurchaseChallans(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.purchaseChallans = response.content;
          this.totalChallanAmountSum = this.calculateTotalChallanAmount(this.purchaseChallans);
          this.totalPages = response.totalPages;
          this.totalElements = response.totalElements;
          this.startIndex = this.currentPage * this.pageSize;
          this.endIndex = Math.min((this.currentPage + 1) * this.pageSize, this.totalElements);
          this.isLoading = false;
        },
        error: (error) => {
          this.snackbar.error(error.message || 'Failed to load purchase challans');
          this.isLoading = false;
        }
      });
  }

  onSearch(): void {
    this.currentPage = 0;
    this.loadPurchaseChallans();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadPurchaseChallans();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize = newSize;
    this.currentPage = 0;
    this.loadPurchaseChallans();
  }

  deletePurchaseChallan(id: number): void {
    if (confirm('Are you sure you want to delete this purchase challan? This action cannot be undone.')) {
      this.isLoading = true;
      this.purchaseChallanService.deletePurchaseChallan(id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.snackbar.success('Purchase Challan deleted successfully');
            this.loadPurchaseChallans();
          },
          error: (error) => {
            this.snackbar.error(error?.error?.message || 'Failed to delete purchase challan');
            this.isLoading = false;
          }
        });
    }
  }

  private loadCustomers(): void {
    if (!this.canManagePurchaseChallans) {
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
        },
        error: (error) => {
          this.snackbar.error('Failed to load customers');
          this.isLoadingCustomers = false;
        }
      });
  }

  refreshCustomers(): void {
    if (!this.canManagePurchaseChallans) {
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
        },
        error: (error) => {
          this.snackbar.error('Failed to refresh customers');
          this.isLoadingCustomers = false;
        }
      });
  }

  resetForm(): void {
    this.searchForm.reset();
    this.currentPage = 0;
    this.loadPurchaseChallans();
  }

  editPurchaseChallan(id: number): void {
    localStorage.setItem('purchaseChallanId', this.encryptionService.encrypt(id.toString()));
    this.router.navigate(['/purchase-challan/create']);
  }

  clearLocalStorage(): void {
    localStorage.removeItem('purchaseChallanId');
    this.router.navigate(['/purchase-challan/create']);
  }

  openQc(id: number): void {
    const encryptedId = this.encryptionService.encrypt(id.toString());
    this.router.navigate(['/purchase-challan/qc', encryptedId]);
  }

  generatePdf(id: number, invoiceNumber?: string): void {
    this.purchaseChallanService.generatePdf(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ blob, filename }) => {
          const pdfFilename = 'purchase-challan-' + (invoiceNumber ? `${invoiceNumber}.pdf` : filename);
          
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = pdfFilename;
          document.body.appendChild(link);
          link.click();
          
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          
          this.snackbar.success('PDF downloaded successfully');
        },
        error: (error) => {
          this.snackbar.error(error?.error?.message || 'Failed to generate PDF');
        }
      });
  }

  convertToPurchase(id: number, invoiceNumber?: string): void {
    if (confirm(`Are you sure you want to convert Purchase Challan ${invoiceNumber || id} to Purchase? This action cannot be undone.`)) {
      this.isLoading = true;
      this.purchaseChallanService.convertToPurchase(id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response: any) => {
            if (response?.success) {
              this.snackbar.success(response.message || 'Purchase Challan converted to Purchase successfully');
              this.loadPurchaseChallans();
              // Optionally navigate to the created purchase
              if (response?.data?.purchaseId) {
                localStorage.setItem('purchaseId', this.encryptionService.encrypt(response.data.purchaseId.toString()));
                this.router.navigate(['/purchase/create']);
              }
            } else {
              this.snackbar.error(response?.message || 'Failed to convert purchase challan');
              this.isLoading = false;
            }
          },
          error: (error) => {
            this.snackbar.error(error?.error?.message || 'Failed to convert purchase challan to purchase');
            this.isLoading = false;
          }
        });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

