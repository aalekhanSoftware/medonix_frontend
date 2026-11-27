import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { AuthService } from '../../../services/auth.service';
import { CustomerService } from '../../../services/customer.service';
import { ArFifoReportService } from '../../../services/ar-fifo-report.service';
import {
  ArFifoBill,
  ArFifoParty,
  ArFifoSearchPayload,
  ArFifoSearchResult
} from '../../../models/ar-fifo-report.model';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { IndianNumberPipe } from '../../../shared/pipes/indian-number.pipe';

/**
 * AR_FIFO — Accounts Receivable FIFO report screen.
 *
 * Layout mirrors the Miracle "A/c Receivable Fifo Report":
 *   Party Name | Bill No | Bill Date | Due Days | Bill Amount | Balance Amt (Cumulative)
 *
 * Pagination is by party. Balances are current outstanding per bill, so the
 * As On date is fixed to today on the server.
 */
@Component({
  selector: 'app-ar-fifo-report',
  templateUrl: './ar-fifo-report.component.html',
  styleUrls: ['./ar-fifo-report.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LoaderComponent,
    PaginationComponent,
    SearchableSelectComponent,
    IndianNumberPipe
  ]
})
export class ArFifoReportComponent implements OnInit, OnDestroy {
  form!: FormGroup;

  customers: any[] = [];
  canShowCustomerFilter = false;

  parties: ArFifoParty[] = [];

  isLoading = false;
  isExporting = false;
  isLoadingCustomers = false;

  currentPage = 0;
  pageSize = 25;
  pageSizeOptions = [10, 25, 50, 100];
  totalElements = 0;
  totalPages = 0;

  asOnDisplay = '';

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private authService: AuthService,
    private customerService: CustomerService,
    private arFifoReportService: ArFifoReportService,
    private snackbar: SnackbarService
  ) {
    this.asOnDisplay = this.formatDateDisplay(new Date());
    this.initForm();
  }

  ngOnInit(): void {
    this.canShowCustomerFilter = !this.authService.hasRole('DEALER');
    if (this.canShowCustomerFilter) {
      this.loadCustomers();
    }
    this.onSearch(undefined, true);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.form = this.fb.group({
      search: [''],
      customerId: [''],
      fromDate: [this.formatDateInput(this.startOfFinancialYear(new Date()))],
      status: ['']
    });
  }

  private startOfFinancialYear(today: Date): Date {
    const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    return new Date(year, 3, 1);
  }

  private formatDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatDateDisplay(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${day}-${month}-${year}`;
  }

  /** yyyy-MM-dd (input value) -> dd-MM-yyyy (backend value). */
  private formatDateApi(dateStr: string): string {
    if (!dateStr) {
      return dateStr;
    }
    const [year, month, day] = dateStr.split('-');
    if (!year || !month || !day) {
      return dateStr;
    }
    return `${day}-${month}-${year}`;
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
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingCustomers = false;
          this.snackbar.error('Failed to load parties');
          this.cdr.markForCheck();
        }
      });
  }

  refreshCustomers(): void {
    if (this.isLoadingCustomers) {
      return;
    }
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
          this.snackbar.success('Parties refreshed successfully');
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoadingCustomers = false;
          this.snackbar.error('Failed to refresh parties');
          this.cdr.markForCheck();
        }
      });
  }

  onSearch(event?: Event, skipValidation = false): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!skipValidation) {
      Object.keys(this.form.controls).forEach(key => this.form.get(key)?.markAsTouched());
      if (this.form.invalid) {
        this.snackbar.error('Please enter valid filter values');
        return;
      }
      if (!this.isFromDateValid()) {
        return;
      }
    }

    this.isLoading = true;
    this.cdr.markForCheck();

    this.arFifoReportService
      .search(this.buildPayload(this.currentPage, this.pageSize))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result: ArFifoSearchResult) => {
          const page = result?.page;
          if (result?.asOn) {
            this.asOnDisplay = result.asOn;
          }
          this.parties = Array.isArray(page?.content) ? page.content : [];
          this.totalElements = Number(page?.totalElements ?? 0);
          this.totalPages = Number(page?.totalPages ?? 0);
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error: any) => {
          this.parties = [];
          this.totalElements = 0;
          this.totalPages = 0;
          this.isLoading = false;
          this.snackbar.error(error?.error?.message || 'Failed to load receivable report');
          this.cdr.markForCheck();
        }
      });
  }

  exportExcel(): void {
    if (this.isExporting || this.isLoading) {
      return;
    }
    if (!this.isFromDateValid()) {
      return;
    }

    this.isExporting = true;
    this.cdr.markForCheck();

    this.arFifoReportService
      .exportExcel(this.buildPayload(0, this.pageSize))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ blob, filename }) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          this.isExporting = false;
          this.snackbar.success('Report downloaded successfully');
          this.cdr.markForCheck();
        },
        error: (error: any) => {
          this.finishExportWithError(error);
        }
      });
  }

  resetForm(): void {
    this.form.patchValue({
      search: '',
      customerId: '',
      fromDate: this.formatDateInput(this.startOfFinancialYear(new Date())),
      status: ''
    });
    this.form.markAsUntouched();
    this.currentPage = 0;
    this.parties = [];
    this.totalElements = 0;
    this.totalPages = 0;
    this.cdr.markForCheck();
    this.onSearch(undefined, true);
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

  trackByPartyId(_index: number, party: ArFifoParty): number {
    return party.customerId;
  }

  trackByBillId(_index: number, bill: ArFifoBill): number {
    return bill.saleId;
  }

  get pageBillCount(): number {
    return this.parties.reduce((sum, party) => sum + (party.bills?.length || 0), 0);
  }

  get pageTotalOutstanding(): number {
    return this.parties.reduce(
      (sum, party) => sum + (Number(party.totalOutstanding) || 0),
      0
    );
  }

  private buildPayload(currentPage: number, perPageRecord: number): ArFifoSearchPayload {
    const values = this.form.value;
    const payload: ArFifoSearchPayload = {
      currentPage,
      perPageRecord
    };

    const search = (values.search || '').trim();
    if (search) {
      payload.search = search;
    }
    if (values.customerId !== '' && values.customerId != null) {
      payload.customerId = Number(values.customerId);
    }
    if (values.fromDate) {
      payload.fromDate = this.formatDateApi(values.fromDate);
    }
    if (values.status) {
      payload.status = values.status;
    }
    return payload;
  }

  /**
   * Excel export errors arrive as a Blob because the request uses
   * responseType: 'blob'. Extract the JSON message when possible.
   */
  private finishExportWithError(error: any): void {
    const fallback = 'Failed to export report';
    const body = error?.error;

    if (body instanceof Blob) {
      body
        .text()
        .then(text => {
          let message = fallback;
          try {
            const parsed = JSON.parse(text);
            if (parsed?.message) {
              message = parsed.message;
            }
          } catch {
            // non-JSON error body — keep fallback
          }
          this.applyExportError(message);
        })
        .catch(() => this.applyExportError(fallback));
      return;
    }

    this.applyExportError(body?.message || fallback);
  }

  private applyExportError(message: string): void {
    this.isExporting = false;
    this.snackbar.error(message);
    this.cdr.markForCheck();
  }

  private isFromDateValid(): boolean {
    const fromDate = this.form.get('fromDate')?.value;
    if (!fromDate) {
      return true;
    }
    const today = this.formatDateInput(new Date());
    if (String(fromDate) > today) {
      this.snackbar.error('From date cannot be in the future');
      return false;
    }
    return true;
  }
}
