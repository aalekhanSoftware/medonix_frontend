import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

import { PaymentHistoryService } from '../../../services/payment-history.service';
import { CustomerService } from '../../../services/customer.service';
import { PaymentHistoryListItem, PaymentHistorySearchRequest, PaymentHistorySearchResponse } from '../../../models/payment-history.model';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SearchableSelectComponent } from "../../../shared/components/searchable-select/searchable-select.component";

@Component({
  selector: 'app-payment-history-list',
  standalone: true,
  imports: [CommonModule, RouterModule, LoaderComponent, PaginationComponent, ReactiveFormsModule, SearchableSelectComponent],
  templateUrl: './payment-history-list.component.html',
  styleUrls: ['./payment-history-list.component.scss']
})
export class PaymentHistoryListComponent implements OnInit, OnDestroy {
  paymentHistories: PaymentHistoryListItem[] = [];
  customers: any[] = [];
  searchForm!: FormGroup;
  loading = false;
  currentPage = 0;
  totalPages = 0;
  totalElements = 0;
  perPageRecord = 10;
  pageSizeOptions = [5, 10, 25, 50];
  private destroy$ = new Subject<void>();
  isLoadingCustomers = false;

  constructor(
    private paymentHistoryService: PaymentHistoryService,
    private customerService: CustomerService,
    private snackbar: SnackbarService,
    private router: Router,
    private encryptionService: EncryptionService,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.initSearchForm();
    this.loadPaymentHistories();
    this.loadCustomers();
  }

  private initSearchForm(): void {
    this.searchForm = this.fb.group({
      search: [''],
      customerId: [null],
      startDate: [null],
      endDate: [null]
    });
  }

  private loadPaymentHistories(): void {
    this.loading = true;
    
    // Build request with search params if active
    const formValue = this.searchForm?.value || {};
    const request: PaymentHistorySearchRequest = {
      search: formValue.search || '',
      customerId: formValue.customerId || undefined,
      startDate: formValue.startDate ? this.formatDateForApi(formValue.startDate) : undefined,
      endDate: formValue.endDate ? this.formatDateForApi(formValue.endDate) : undefined,
      currentPage: this.currentPage,
      perPageRecord: this.perPageRecord
    };

    this.paymentHistoryService.getPaymentHistories(request).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: PaymentHistorySearchResponse) => {
        if (response.success) {
          this.paymentHistories = response.data.content || [];
          this.totalPages = response.data.totalPages || 0;
          this.totalElements = response.data.totalElements || 0;
        } else {
          this.snackbar.error(response.message || 'Failed to load payment histories');
        }
      },
      error: (error) => {
        console.error('Error loading payment histories:', error);
        this.snackbar.error('Failed to load payment histories');
      },
      complete: () => {
        this.loading = false;
      }
    });
  }

  private loadCustomers(): void {
    this.isLoadingCustomers = true;
    this.customerService.getCustomers({ status: 'A' }).subscribe({
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
    this.isLoadingCustomers = true;
    this.customerService.refreshCustomers().subscribe({
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

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadPaymentHistories();
  }

  onPageSizeChange(size: number): void {
    this.perPageRecord = size;
    this.currentPage = 0; // Reset to first page when page size changes
    this.loadPaymentHistories();
  }

  onSearch(): void {
    this.currentPage = 0; // Reset to first page when searching
    this.loadPaymentHistories();
  }

  resetSearchForm(): void {
    this.searchForm.reset();
    this.currentPage = 0;
    this.loadPaymentHistories();
  }

  isSearchActive(): boolean {
    const formValue = this.searchForm.value;
    return formValue.search || formValue.customerId || formValue.startDate || formValue.endDate;
  }

  // Format date from YYYY-MM-DD to DD-MM-YYYY for API
  private formatDateForApi(dateString: string): string {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-');
    return `${day}-${month}-${year}`;
  }

  onAddNew(): void {
    this.router.navigate(['/payment-history/add']);
  }

  onEdit(paymentHistory: PaymentHistoryListItem): void {
    const encryptedId = this.encryptionService.encrypt(JSON.stringify(paymentHistory.id));
    this.router.navigate(['/payment-history/edit', encryptedId]);
  }

  onDelete(paymentHistory: PaymentHistoryListItem): void {
    if (confirm(`Are you sure you want to delete payment history for ${paymentHistory.customerName}?`)) {
      this.paymentHistoryService.deletePaymentHistory(paymentHistory.id).subscribe({
        next: (response) => {
          if (response.success) {
            this.snackbar.success('Payment history deleted successfully');
            this.loadPaymentHistories(); // Reload the list
          } else {
            this.snackbar.error(response.message || 'Failed to delete payment history');
          }
        },
        error: (error) => {
          console.error('Error deleting payment history:', error);
          this.snackbar.error('Failed to delete payment history');
        }
      });
    }
  }

  getTypeLabel(type: 'C' | 'B'): string {
    return type === 'C' ? 'Cash' : 'Bank';
  }

  getTransactionTypeLabel(isReceived: boolean): string {
    return isReceived ? 'Received' : 'Paid';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}