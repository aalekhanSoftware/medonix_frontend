import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { QuotationService, QuotationItemDetail, QuotationItemSearchRequest } from '../../../services/quotation.service';
import { CustomerService } from '../../../services/customer.service';
import { ProductService } from '../../../services/product.service';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { QuotationStatus } from '../../../models/quotation.model';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-order',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    SearchableSelectComponent
  ],
  templateUrl: './order.component.html',
  styleUrls: ['./order.component.scss']
})
export class OrderComponent implements OnInit, OnDestroy {
  searchForm: FormGroup;
  quotationItems: QuotationItemDetail[] = [];
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

  quotationItemStatusOptions = [
    { value: 'O', label: 'Open' },
    { value: 'IP', label: 'In Process' },
    { value: 'C', label: 'Completed' },
    { value: 'B', label: 'Billed' }
  ];

  quotationStatusOptions: any[] = [];

  constructor(
    private fb: FormBuilder,
    private quotationService: QuotationService,
    private customerService: CustomerService,
    private productService: ProductService,
    private encryptionService: EncryptionService,
    private snackbar: SnackbarService,
    private router: Router,
    private sanitizer: DomSanitizer
  ) {
    this.searchForm = this.fb.group({
      quotationItemStatuses: [['O', 'IP']], // Default selected
      productId: [''],
      quotationStatuses: [],
      customerId: [''],
      startDate: [''],
      endDate: ['']
    });
    
    // Initialize quotationStatusOptions from QuotationStatus enum
    this.quotationStatusOptions = Object.entries(QuotationStatus).map(([key, value]) => ({ label: value, value: key }));
  }

  ngOnInit(): void {
    this.loadQuotationItems();
    this.loadCustomers();
    this.loadProducts();
  }

  loadQuotationItems(page: number = 0): void {
    this.loading = true;
    this.currentPage = page;

    const formValue = this.searchForm.value;
    const request: QuotationItemSearchRequest = {
      currentPage: page,
      perPageRecord: this.perPageRecord,
      sortBy: 'id',
      sortDir: 'desc',
      quotationItemStatuses: formValue.quotationItemStatuses && formValue.quotationItemStatuses.length > 0 ? formValue.quotationItemStatuses : undefined,
      productId: formValue.productId ? Number(formValue.productId) : undefined,
      isProduction: true, // Always pass true
      quotationStatuses: formValue.quotationStatuses && formValue.quotationStatuses.length > 0 ? formValue.quotationStatuses : undefined,
      customerId: formValue.customerId ? Number(formValue.customerId) : undefined,
      startDate: formValue.startDate || undefined,
      endDate: formValue.endDate || undefined
    };

    this.quotationService.searchQuotationItemsWithDetails(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
      next: (response) => {
        this.quotationItems = response.content;
        this.totalPages = response.totalPages;
        this.totalItems = response.totalItems;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading quotation items:', error);
        this.snackbar.error('Failed to load quotation items');
        this.loading = false;
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

  onSubmit(): void {
    this.loadQuotationItems(0);
  }

  resetForm(): void {
    this.searchForm.reset({
      quotationItemStatuses: ['O', 'IP'],
      productId: '',
      quotationStatuses: [],
      customerId: '',
      startDate: '',
      endDate: ''
    });
    this.loadQuotationItems(0);
  }

  onPageChange(page: number): void {
    this.loadQuotationItems(page);
  }

  getStatusLabel(status: string): string {
    const statusOption = this.quotationItemStatusOptions.find(option => option.value === status);
    return statusOption ? statusOption.label : status;
  }

  getQuotationStatusLabel(status: string): string {
    const statusOption = this.quotationStatusOptions.find(option => option.value === status);
    return statusOption ? statusOption.label : status;
  }

  editQuotation(quotationId: number): void {
    // Navigate to quotation edit page
    if (!quotationId) return;
    const encryptedId = this.encryptionService.encrypt(quotationId.toString());
    this.router.navigate(['/quotation/edit', encryptedId]);
  }

  // Helper method to generate page numbers for pagination
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

  // Handle quotation item status checkbox changes
  onQuotationItemStatusChange(event: any, value: string): void {
    const statuses = this.searchForm.get('quotationItemStatuses')?.value || [];
    const index = statuses.indexOf(value);
    
    if (event.target.checked && index === -1) {
      statuses.push(value);
    } else if (!event.target.checked && index !== -1) {
      statuses.splice(index, 1);
    }
    
    this.searchForm.get('quotationItemStatuses')?.setValue(statuses);
  }

  // Handle quotation status checkbox changes
  onQuotationStatusChange(event: any, value: string): void {
    const statuses = this.searchForm.get('quotationStatuses')?.value || [];
    const index = statuses.indexOf(value);
    
    if (event.target.checked && index === -1) {
      statuses.push(value);
    } else if (!event.target.checked && index !== -1) {
      statuses.splice(index, 1);
    }
    
    this.searchForm.get('quotationStatuses')?.setValue(statuses);
  }

  // Method to update quotation item status (same as in add-quotation.component.ts)
  updateQuotationItemStatus(index: number, status: 'O' | 'IP' | 'C' | 'B'): void {
    const item = this.quotationItems[index];
    const itemId = item.id;
    
    if (itemId) {
      this.quotationService.updateQuotationItemStatus(itemId, status)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
        next: (response: any) => {
          if (response.success) {
            // Update the local item status
            this.quotationItems[index].quotationItemStatus = status;
            this.snackbar.success('Quotation item status updated successfully');
          } else {
            this.snackbar.error(response.message || 'Failed to update quotation item status');
          }
        },
        error: (error: any) => {
          console.error('Error updating quotation item status:', error);
          this.snackbar.error(error?.error?.message || 'Failed to update quotation item status');
        }
      });
    }
  }
  
  openWhatsApp(rawNumber: string | number | null | undefined): void {
    const digits = String(rawNumber ?? '').replace(/\D/g, '');
    if (!digits) {
      return;
    }
    const normalized = digits.length === 10 ? `91${digits}` : digits;
    const url = `whatsapp://send?phone=${normalized}`;
    try {
      // Attempt to open native WhatsApp app via custom protocol
      window.location.href = url;
    } catch {
      // Swallow errors; native handlers may block exceptions
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
      // Swallow errors; native handlers may block exceptions
    }
  }
    

  sanitizeHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    // Clear arrays to help with garbage collection
    this.quotationItems = [];
    this.customers = [];
    this.products = [];
    this.quotationStatusOptions = [];
  }
}