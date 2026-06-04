import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

import { CustomerService } from '../../services/customer.service';
import { UnpaidSaleRow, UnpaidSalesService } from '../../services/unpaid-sales.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';
import { SearchableSelectComponent } from '../../shared/components/searchable-select/searchable-select.component';

@Component({
  selector: 'app-transaction-unpaid-sales',
  templateUrl: './transaction-unpaid-sales.component.html',
  styleUrls: ['./transaction-unpaid-sales.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LoaderComponent,
    PaginationComponent,
    SearchableSelectComponent
  ]
})
export class TransactionUnpaidSalesComponent implements OnInit, OnDestroy {
  unpaidSalesForm!: FormGroup;

  customers: any[] = [];
  rows: UnpaidSaleRow[] = [];

  isLoading = false;
  isLoadingCustomers = false;
  /** Sale id currently generating payment receipt PDF */
  printingReceiptSaleId: number | null = null;

  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 50, 100,500, 1000];
  totalElements = 0;
  totalPages = 0;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private customerService: CustomerService,
    private unpaidSalesService: UnpaidSalesService,
    private snackbar: SnackbarService
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.loadCustomers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.unpaidSalesForm = this.fb.group({
      customerId: [''],
      days: ['', [Validators.min(0), Validators.max(365)]]
    });
  }

  private loadCustomers(): void {
    this.isLoadingCustomers = true;
    this.customerService
      .getCustomers({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          if (response?.success && Array.isArray(response.data)) {
            this.customers = response.data;
          } else if (Array.isArray(response?.data)) {
            this.customers = response.data;
          } else if (Array.isArray(response)) {
            this.customers = response;
          }
          this.isLoadingCustomers = false;
        },
        error: () => {
          this.isLoadingCustomers = false;
          this.snackbar.error('Failed to load customers');
        }
      });
  }

  refreshCustomers(): void {
    this.isLoadingCustomers = true;
    this.customerService
      .refreshCustomers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          if (response?.success && Array.isArray(response.data)) {
            this.customers = response.data;
          }
          this.isLoadingCustomers = false;
          this.snackbar.success('Customers refreshed successfully');
        },
        error: () => {
          this.isLoadingCustomers = false;
          this.snackbar.error('Failed to refresh customers');
        }
      });
  }

  onSearch(event?: Event, skipValidation = false): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!skipValidation) {
      Object.keys(this.unpaidSalesForm.controls).forEach((key) => {
        this.unpaidSalesForm.get(key)?.markAsTouched();
      });

      if (this.unpaidSalesForm.invalid) {
        this.showValidationError();
        return;
      }
    }

    const customerIdValue = this.unpaidSalesForm.get('customerId')?.value;
    const daysValue = this.unpaidSalesForm.get('days')?.value;
    const customerId = customerIdValue === '' || customerIdValue == null ? undefined : Number(customerIdValue);
    const days = daysValue === '' || daysValue == null ? undefined : Number(daysValue);
    const payload: any = {
      currentPage: this.currentPage,
      perPageRecord: this.pageSize
    };
    if (customerId !== undefined) {
      payload.customerId = customerId;
    }
    if (days !== undefined) {
      payload.days = days;
    }

    this.isLoading = true;
    this.unpaidSalesService
      .searchUnpaidSales(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (page) => {
          this.rows = Array.isArray(page?.content) ? page.content : [];
          this.totalElements = Number(page?.totalElements ?? 0);
          this.totalPages = Number(page?.totalPages ?? 0);
          this.isLoading = false;
        },
        error: (error: any) => {
          this.rows = [];
          this.totalElements = 0;
          this.totalPages = 0;
          this.isLoading = false;
          this.snackbar.error(error?.error?.message || 'Failed to load unpaid sales');
        }
      });
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.onSearch(undefined, true);
  }

  onPageSizeChange(size: number): void {
    this.pageSize = Number(size);
    this.currentPage = 0;
    this.onSearch(undefined, true);
  }

  resetForm(): void {
    this.unpaidSalesForm.patchValue({
      customerId: '',
      days: ''
    });
    this.unpaidSalesForm.markAsUntouched();
    this.currentPage = 0;
    this.rows = [];
    this.totalElements = 0;
    this.totalPages = 0;
  }

  trackBySaleId(_index: number, row: UnpaidSaleRow): number {
    return row.id;
  }

  get totalPendingAmount(): number {
    return this.rows.reduce((sum, row) => sum + (Number(row.pendingAmount) || 0), 0);
  }

  printPaymentReceipt(row: UnpaidSaleRow, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (this.printingReceiptSaleId != null) {
      return;
    }
    this.printingReceiptSaleId = row.id;
    this.unpaidSalesService
      .generatePaymentReceiptPdf(row.id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.printingReceiptSaleId = null;
        })
      )
      .subscribe({
        next: ({ blob }) => {
          const url = window.URL.createObjectURL(blob);
          const printFrame = document.createElement('iframe');
          printFrame.style.position = 'fixed';
          printFrame.style.right = '0';
          printFrame.style.bottom = '0';
          printFrame.style.width = '0';
          printFrame.style.height = '0';
          printFrame.style.border = 'none';
          printFrame.style.opacity = '0';
          printFrame.setAttribute('aria-hidden', 'true');
          printFrame.src = url;
          document.body.appendChild(printFrame);
          printFrame.onload = () => {
            setTimeout(() => {
              try {
                printFrame.contentWindow?.focus();
                printFrame.contentWindow?.print();
                this.snackbar.success('Payment receipt ready to print');
              } catch {
                this.snackbar.error('Could not open print dialog. Try saving the PDF from preview.');
              }
            }, 300);
            setTimeout(() => {
              if (document.body.contains(printFrame)) {
                document.body.removeChild(printFrame);
              }
              window.URL.revokeObjectURL(url);
            }, 60000);
          };
        },
        error: (error: any) => {
          this.snackbar.error(error?.error?.message || 'Failed to generate payment receipt');
        }
      });
  }

  private showValidationError(): void {
    const daysControl = this.unpaidSalesForm.get('days');

    if (daysControl?.errors?.['min']) {
      this.snackbar.error('Days must be greater than or equal to 0');
      return;
    }

    if (daysControl?.errors?.['max']) {
      this.snackbar.error('Days must be less than or equal to 365');
      return;
    }

    this.snackbar.error('Please enter valid filter values');
  }
}
