import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { QuotationService } from '../../../services/quotation.service';
import { CustomerService } from '../../../services/customer.service';
import { ProductService } from '../../../services/product.service';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService, UserRole } from '../../../services/auth.service';

export interface PendingItemSearchRequest {
  customerId?: number;
  productId?: number;
  page: number;
  size: number;
  sortBy: string;
  sortDir: string;
}

export interface PendingItem {
  id: number;
  quotationId: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  discountPrice: number;
  quotationDiscountPercentage: number;
  quotationDiscountAmount: number;
  quotationDiscountPrice: number;
  taxPercentage: number;
  taxAmount: number;
  finalPrice: number;
  clientId: number;
  createdRoll: number;
  remarks: string;
  isDispatch: boolean;
  quotationItemStatus: string;
  productName: string;
  quoteNumber: string;
  quoteDate: string;
  customerId: number;
  customerName: string;
  pendingQuantity: number;
  contactNumber?: string | number | null;
}

export interface PendingItemSearchResponse {
  success: boolean;
  message: string;
  data: {
    content: PendingItem[];
    totalElements: number;
    totalPages: number;
    page: number;
    size: number;
  };
}

@Component({
  selector: 'app-pending-item',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    SearchableSelectComponent
  ],
  templateUrl: './pending-item.component.html',
  styleUrls: ['./pending-item.component.scss']
})
export class PendingItemComponent implements OnInit, OnDestroy {
  searchForm: FormGroup;
  pendingItems: PendingItem[] = [];
  currentPage = 0;
  totalPages = 0;
  totalItems = 0;
  perPageRecord = 10;
  loading = false;
  customers: any[] = [];
  isLoadingCustomers = false;
  products: any[] = [];
  isLoadingProducts = false;
  isDealerUser = false;
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private quotationService: QuotationService,
    private customerService: CustomerService,
    private productService: ProductService,
    private encryptionService: EncryptionService,
    private snackbar: SnackbarService,
    private router: Router,
    private sanitizer: DomSanitizer,
    private authService: AuthService
  ) {
    this.searchForm = this.fb.group({
      productId: [''],
      customerId: ['']
    });
  }

  ngOnInit(): void {
    this.isDealerUser = this.authService.hasRole(UserRole.DEALER);
    this.loadPendingItems();
    this.loadProducts();
    if (!this.isDealerUser) {
      this.loadCustomers();
    }
  }

  loadPendingItems(page: number = 0): void {
    this.loading = true;
    this.currentPage = page;

    const formValue = this.searchForm.value;
    const request: PendingItemSearchRequest = {
      customerId: formValue.customerId ? Number(formValue.customerId) : undefined,
      productId: formValue.productId ? Number(formValue.productId) : undefined,
      page: page,
      size: this.perPageRecord,
      sortBy: 'id',
      sortDir: 'desc'
    };

    this.quotationService.searchPendingItems(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.pendingItems = response.data.content;
            this.totalPages = response.data.totalPages;
            this.totalItems = response.data.totalElements;
          } else {
            this.snackbar.error(response.message || 'Failed to load pending items');
            this.pendingItems = [];
          }
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading pending items:', error);
          this.snackbar.error('Failed to load pending items');
          this.loading = false;
          this.pendingItems = [];
        }
      });
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

  onSubmit(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.loadPendingItems(0);
  }

  resetForm(): void {
    this.searchForm.reset({
      productId: '',
      customerId: ''
    });
    this.loadPendingItems(0);
  }

  onPageChange(page: number): void {
    this.loadPendingItems(page);
  }

  editQuotation(quotationId: number): void {
    if (!quotationId) return;
    const encryptedId = this.encryptionService.encrypt(quotationId.toString());
    this.router.navigate(['/quotation/edit', encryptedId]);
  }

  canDispatchQuotation(): boolean {
    return this.authService.isAdmin() || this.authService.isStaffAdmin();
  }

  dispatchQuotation(id: number): void {
    if (!id) return;
    localStorage.setItem('editQuotationId', this.encryptionService.encrypt(id.toString()));
    this.router.navigate(['/quotation/dispatch']);
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisiblePages = 5;
    
    if (this.totalPages <= maxVisiblePages) {
      for (let i = 0; i < this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      const start = Math.max(0, Math.min(this.currentPage - 2, this.totalPages - maxVisiblePages));
      const end = Math.min(this.totalPages, start + maxVisiblePages);
      
      for (let i = start; i < end; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  }

  openWhatsApp(rawNumber: string | number | null | undefined): void {
    const digits = String(rawNumber ?? '').replace(/\D/g, '');
    if (!digits) {
      return;
    }
    const normalized = digits.length === 10 ? `91${digits}` : digits;
    const url = `whatsapp://send?phone=${normalized}`;
    try {
      window.location.href = url;
    } catch {
      // Swallow errors
    }
  }

  makeCall(rawNumber: string | number | null | undefined): void {
    const digits = String(rawNumber ?? '').replace(/\D/g, '');
    if (!digits) {
      return;
    }
    const url = `tel:+91${digits}`;
    try {
      window.location.href = url;
    } catch {
      // Swallow errors
    }
  }

  sanitizeHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    // Clear arrays to help with garbage collection
    this.pendingItems = [];
    this.customers = [];
    this.products = [];
  }
}
