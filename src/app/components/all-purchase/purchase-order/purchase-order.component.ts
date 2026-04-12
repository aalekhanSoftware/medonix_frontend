import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PurchaseOrderService } from '../../../services/purchase-order.service';
import { PurchaseOrder } from '../../../models/purchase-order.model';
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
  selector: 'app-purchase-order',
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
  templateUrl: './purchase-order.component.html',
  styleUrls: ['./purchase-order.component.scss']
})
export class PurchaseOrderComponent implements OnInit, OnDestroy {
  purchaseOrders: PurchaseOrder[] = [];
  searchForm!: FormGroup;
  isLoading = false;

  // Pagination properties
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50, 100];
  totalPages = 0;
  totalElements = 0;
  totalOrderAmountSum: number | null = null;
  startIndex = 0;
  endIndex = 0;
  products: Product[] = [];
  isLoadingProducts = false;
  customers: any[] = [];
  isLoadingCustomers = false;
  canManagePurchaseOrders = false;
  private destroy$ = new Subject<void>();

  constructor(
    private purchaseOrderService: PurchaseOrderService,
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
    this.canManagePurchaseOrders = this.authService.isAdmin() || this.authService.isStaffAdmin();
    this.loadPurchaseOrders();
    if (this.canManagePurchaseOrders) {
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

  private calculateTotalOrderAmount(rows: PurchaseOrder[]): number {
    let sum = 0;
    for (const row of rows ?? []) {
      const value = row?.totalOrderAmount as unknown;
      if (typeof value === 'number') {
        sum += isFinite(value) ? value : 0;
      } else if (value !== null && value !== undefined) {
        const n = Number(value);
        sum += isFinite(n) ? n : 0;
      }
    }
    return sum;
  }

  loadPurchaseOrders(): void {
    this.isLoading = true;
    this.totalOrderAmountSum = null;
    const params = {
      currentPage: this.currentPage,
      perPageRecord: this.pageSize,
      startDate: this.searchForm.value.startDate ? this.dateUtils.formatDate(this.searchForm.value.startDate) : '',
      endDate: this.searchForm.value.endDate ? this.dateUtils.formatDate(this.searchForm.value.endDate) : '',
      ...this.searchForm.value,
    };

    this.purchaseOrderService.searchPurchaseOrders(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.purchaseOrders = response.content;
          this.totalOrderAmountSum = this.calculateTotalOrderAmount(this.purchaseOrders);
          this.totalPages = response.totalPages;
          this.totalElements = response.totalElements;
          this.startIndex = this.currentPage * this.pageSize;
          this.endIndex = Math.min((this.currentPage + 1) * this.pageSize, this.totalElements);
          this.isLoading = false;
        },
        error: (error) => {
          this.snackbar.error(error.message || 'Failed to load purchase orders');
          this.isLoading = false;
        }
      });
  }

  onSearch(): void {
    this.currentPage = 0;
    this.loadPurchaseOrders();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadPurchaseOrders();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize = newSize;
    this.currentPage = 0;
    this.loadPurchaseOrders();
  }

  deletePurchaseOrder(id: number): void {
    if (confirm('Are you sure you want to delete this purchase order? This action cannot be undone.')) {
      this.isLoading = true;
      this.purchaseOrderService.deletePurchaseOrder(id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.snackbar.success('Purchase Order deleted successfully');
            this.loadPurchaseOrders();
          },
          error: (error) => {
            this.snackbar.error(error?.error?.message || 'Failed to delete purchase order');
            this.isLoading = false;
          }
        });
    }
  }

  private loadCustomers(): void {
    if (!this.canManagePurchaseOrders) {
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
    if (!this.canManagePurchaseOrders) {
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
    this.loadPurchaseOrders();
  }

  editPurchaseOrder(id: number): void {
    localStorage.setItem('purchaseOrderId', this.encryptionService.encrypt(id.toString()));
    this.router.navigate(['/purchase-order/create']);
  }

  clearLocalStorage(): void {
    localStorage.removeItem('purchaseOrderId');
    this.router.navigate(['/purchase-order/create']);
  }

  generatePdf(id: number, invoiceNumber?: string): void {
    this.purchaseOrderService.generatePdf(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ blob, filename }) => {
          const pdfFilename = 'purchase-order-' + (invoiceNumber ? `${invoiceNumber}.pdf` : filename);
          
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

  /*convertToPurchase(id: number, invoiceNumber?: string): void {
    if (confirm(`Are you sure you want to convert Purchase Order ${invoiceNumber || id} to Purchase? This action cannot be undone.`)) {
      this.isLoading = true;
      this.purchaseOrderService.convertToPurchase(id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response: any) => {
            if (response?.success) {
              this.snackbar.success(response.message || 'Purchase Order converted to Purchase successfully');
              this.loadPurchaseOrders();
              // Optionally navigate to the created purchase
              if (response?.data?.purchaseId) {
                localStorage.setItem('purchaseId', this.encryptionService.encrypt(response.data.purchaseId.toString()));
                this.router.navigate(['/purchase/create']);
              }
            } else {
              this.snackbar.error(response?.message || 'Failed to convert purchase order');
              this.isLoading = false;
            }
          },
          error: (error) => {
            this.snackbar.error(error?.error?.message || 'Failed to convert purchase order to purchase');
            this.isLoading = false;
          }
        });
    }
  }*/

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

