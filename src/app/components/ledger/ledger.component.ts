import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { LedgerService } from '../../services/ledger.service';
import { CustomerService } from '../../services/customer.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { LedgerEntry, LedgerPdfDataPayload } from '../../models/ledger-pdf-data.model';

@Component({
  selector: 'app-ledger',
  templateUrl: './ledger.component.html',
  styleUrls: ['./ledger.component.scss'],
  standalone: false
})
export class LedgerComponent implements OnInit, OnDestroy {
  ledgerForm!: FormGroup;
  customers: any[] = [];
  isLoading = false;
  isLoadingCustomers = false;
  isGeneratingPdf = false;
  isLoadingPdfData = false;
  isDealer = false;
  ledgerPdfData: LedgerPdfDataPayload | null = null;

  private readonly transactionTypeLabels: Record<string, string> = {
    PURCHASE: 'Purchase',
    SALE: 'Sale',
    PURCHASE_RETURN: 'Pur. Return',
    SALE_RETURN: 'Sale Return',
    PAYMENT_RECEIVED: 'Pymt Rcvd',
    PAYMENT_MADE: 'Pymt Made'
  };

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private ledgerService: LedgerService,
    private customerService: CustomerService,
    private snackbar: SnackbarService,
    private authService: AuthService,
    private userService: UserService
  ) {
    this.isDealer = this.authService.hasRole('DEALER');
    this.initForm();
  }

  ngOnInit(): void {
    if (this.isDealer) {
      this.loadDealerCustomerId();
    } else {
      this.loadCustomers();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    const today = new Date();
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);

    this.ledgerForm = this.fb.group({
      customerId: [this.isDealer ? null : '', this.isDealer ? [] : Validators.required],
      startDate: [this.formatDateForInput(firstDayOfYear), Validators.required],
      endDate: [this.formatDateForInput(today), Validators.required]
    });
  }

  private loadDealerCustomerId(): void {
    this.userService.getCurrentUser()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          if (response?.success && response?.data?.clientId) {
            const customerId = response.data.clientId;
            this.ledgerForm.patchValue({ customerId: customerId.toString() });
            // Also add to customers array for display purposes
            this.customers = [{
              id: customerId,
              name: response.data.client?.name || 'Current User'
            }];
          } else if (response?.data?.clientId) {
            // Handle case where response might not have success property
            const customerId = response.data.clientId;
            this.ledgerForm.patchValue({ customerId: customerId.toString() });
            this.customers = [{
              id: customerId,
              name: response.data.client?.name || 'Current User'
            }];
          }
        },
        error: () => {
          this.snackbar.error('Failed to load user information');
        }
      });
  }

  private formatDateForInput(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private formatDateForApi(dateStr: string): string {
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }

  private loadCustomers(): void {
    this.isLoadingCustomers = true;
    this.customerService.getCustomers({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
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
    this.isLoadingCustomers = true;
    this.customerService.refreshCustomers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
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

  isFieldInvalid(fieldName: string): boolean {
    const field = this.ledgerForm.get(fieldName);
    return field ? field.invalid && field.touched : false;
  }

  resetForm(): void {
    const today = new Date();
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);

    const resetData: any = {
      startDate: this.formatDateForInput(firstDayOfYear),
      endDate: this.formatDateForInput(today)
    };

    // Don't reset customerId for DEALER users
    if (!this.isDealer) {
      resetData.customerId = '';
    }

    this.ledgerForm.patchValue(resetData);
    this.ledgerForm.markAsUntouched();
    this.ledgerPdfData = null;
  }

  /**
   * Marks controls touched, validates form, dealer customerId, and date range.
   * Returns API params or null if invalid.
   */
  private buildLedgerParamsOrNotify(): { customerId: number; startDate: string; endDate: string } | null {
    Object.keys(this.ledgerForm.controls).forEach(key => {
      this.ledgerForm.get(key)?.markAsTouched();
    });

    if (this.ledgerForm.invalid) {
      this.snackbar.error('Please fill all required fields');
      return null;
    }

    const formValues = this.ledgerForm.value;

    if (this.isDealer && !formValues.customerId) {
      this.snackbar.error('Customer information not available. Please refresh the page.');
      return null;
    }

    const startDate = new Date(formValues.startDate);
    const endDate = new Date(formValues.endDate);

    if (startDate > endDate) {
      this.snackbar.error('Start date cannot be after end date');
      return null;
    }

    return {
      customerId: Number(formValues.customerId),
      startDate: this.formatDateForApi(formValues.startDate),
      endDate: this.formatDateForApi(formValues.endDate)
    };
  }

  searchLedgerData(): void {
    const params = this.buildLedgerParamsOrNotify();
    if (!params) {
      return;
    }

    this.isLoadingPdfData = true;
    this.ledgerService.generatePdfData(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isLoadingPdfData = false;
          if (response?.success && response.data) {
            this.ledgerPdfData = response.data;
            this.snackbar.success(response.message || 'Ledger data loaded');
          } else {
            this.ledgerPdfData = null;
            this.snackbar.error(response?.message || 'Failed to load ledger data');
          }
        },
        error: (error: any) => {
          this.ledgerPdfData = null;
          this.snackbar.error(error?.error?.message || 'Failed to load ledger data');
          this.isLoadingPdfData = false;
        }
      });
  }

  generatePdf(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const params = this.buildLedgerParamsOrNotify();
    if (!params) {
      return;
    }

    this.isGeneratingPdf = true;

    this.ledgerService.generatePdf(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ blob, filename }) => {
          // Create download link
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();

          // Clean up
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);

          this.snackbar.success('Ledger report downloaded successfully');
          this.isGeneratingPdf = false;
        },
        error: (error: any) => {
          this.snackbar.error(error?.error?.message || 'Failed to generate ledger report');
          this.isGeneratingPdf = false;
        }
      });
  }

  getSelectedCustomerName(): string {
    const customerId = this.ledgerForm.get('customerId')?.value;
    if (!customerId) return '';
    const customer = this.customers.find(c => c.id === Number(customerId));
    return customer?.name || '';
  }

  getSortedLedgerEntries(): LedgerEntry[] {
    const entries = this.ledgerPdfData?.ledgerSummary?.entries ?? [];
    return [...entries].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  transactionTypeLabel(type: string): string {
    return this.transactionTypeLabels[type] ?? type;
  }

  companyOtherEntries(): { key: string; value: string }[] {
    const o = this.ledgerPdfData?.companyOther;
    if (!o || typeof o !== 'object') {
      return [];
    }
    return Object.entries(o)
      .filter(([, v]) => v != null && String(v).trim() !== '')
      .map(([key, value]) => ({ key, value: String(value) }));
  }
}
