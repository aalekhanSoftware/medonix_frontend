import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml, Meta } from '@angular/platform-browser';
import { Subject, takeUntil } from 'rxjs';

import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { CustomerService } from '../../../services/customer.service';
import { ProductService } from '../../../services/product.service';
import { PurchaseOrderService } from '../../../services/purchase-order.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { EncryptionService } from '../../../shared/services/encryption.service';

interface PendingPurchaseItem {
  id: number;
  orderId: number;
  purchaseIds: number[];
  customerId: number;
  customerName?: string;
  productId: number;
  productName: string;
  quantity: number;
  getQuantity: number | null;
  unitPrice: number;
  price: number;
  taxPercentage: number;
  taxAmount: number;
  finalPrice: number;
  remarks: string;
}

interface PendingPurchaseResponse {
  success: boolean;
  message: string;
  data?: {
    content: PendingPurchaseItem[];
    totalElements: number;
    page: number;
    size: number;
    totalPages: number;
  };
}

@Component({
  selector: 'app-purchase-order-item-pending',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    SearchableSelectComponent
  ],
  templateUrl: './purchase-order-item-pending.component.html',
  styleUrls: ['./purchase-order-item-pending.component.scss']
})
export class PurchaseOrderItemPendingComponent implements OnInit, OnDestroy {
  searchForm: FormGroup;
  pendingItems: PendingPurchaseItem[] = [];
  currentPage = 0;
  totalPages = 0;
  totalItems = 0;
  perPageRecord = 10;
  loading = false;
  customers: any[] = [];
  isLoadingCustomers = false;
  products: any[] = [];
  isLoadingProducts = false;
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private purchaseOrderService: PurchaseOrderService,
    private customerService: CustomerService,
    private productService: ProductService,
    private snackbar: SnackbarService,
    private router: Router,
    private encryptionService: EncryptionService,
    private sanitizer: DomSanitizer,
    private meta: Meta
  ) {
    this.searchForm = this.fb.group({
      orderId: [''],
      productId: [''],
      customerId: ['']
    });
  }

  ngOnInit(): void {
    this.meta.updateTag({
      name: 'description',
      content: 'Pending purchase order items with quantities, pricing, and customer filters.'
    });
    this.meta.updateTag({
      name: 'robots',
      content: 'index,follow'
    });
    this.loadPendingItems();
    this.loadProducts();
    this.loadCustomers();
  }

  loadPendingItems(page: number = 0): void {
    this.loading = true;
    this.currentPage = page;

    const formValue = this.searchForm.value;
    const request = {
      id: formValue.orderId ? Number(formValue.orderId) : undefined,
      productId: formValue.productId ? Number(formValue.productId) : undefined,
      customerId: formValue.customerId ? Number(formValue.customerId) : undefined,
      page,
      size: this.perPageRecord
    };

    this.purchaseOrderService.searchPendingPurchaseOrderItems(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: PendingPurchaseResponse) => {
          if (response?.success && response.data) {
            this.pendingItems = response.data.content || [];
            this.totalPages = response.data.totalPages || 0;
            this.totalItems = response.data.totalElements || 0;
          } else {
            this.pendingItems = [];
            this.snackbar.error(response?.message || 'Failed to load pending purchase items');
          }
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading pending purchase items:', error);
          this.pendingItems = [];
          this.loading = false;
          this.snackbar.error('Failed to load pending purchase items');
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
      orderId: '',
      productId: '',
      customerId: ''
    });
    this.loadPendingItems(0);
  }

  onPageChange(page: number): void {
    if (page < 0 || page > this.totalPages - 1) {
      return;
    }
    this.loadPendingItems(page);
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
        error: () => {
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
        error: () => {
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
        error: () => {
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
        error: () => {
          this.snackbar.error('Failed to refresh products');
          this.isLoadingProducts = false;
        }
      });
  }

  editPurchaseOrder(orderId: number): void {
    if (!orderId) return;
    localStorage.setItem('purchaseOrderId', this.encryptionService.encrypt(orderId.toString()));
    this.router.navigate(['/purchase-order/create']);
  }

  sanitizeHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.pendingItems = [];
    this.customers = [];
    this.products = [];
  }
}


