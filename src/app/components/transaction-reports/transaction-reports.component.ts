import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { CustomerService } from '../../services/customer.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { SalesPurchaseReportService, SalesPurchaseReportSearchPayload } from '../../services/sales-purchase-report.service';
import { CollectionPaymentReportService } from '../../services/collection-payment-report.service';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';

type ReportTypeUi = 'PURCHASE' | 'SALES' | 'COLLECTION_OUTSTANDING' | 'PAYMENT_DONE';

interface ReportRowUi {
  invoiceNumber: string;
  customerName: string;
  date: string;
  numberOfItems: number | string;
  taxAmount: number | string;
  totalAmount: number | string;
}

@Component({
  selector: 'app-transaction-reports',
  templateUrl: './transaction-reports.component.html',
  styleUrls: ['./transaction-reports.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LoaderComponent,
    PaginationComponent
  ]
})
export class TransactionReportsComponent implements OnInit, OnDestroy {
  reportForm!: FormGroup;

  customers: any[] = [];
  isLoadingCustomers = false;

  isLoading = false;
  isExporting = false;

  rows: any[] = [];
  totalElements = 0;
  totalPages = 0;

  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 50, 100];

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private customerService: CustomerService,
    private reportService: SalesPurchaseReportService,
    private collectionPaymentService: CollectionPaymentReportService,
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
    const today = new Date();
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);

    this.reportForm = this.fb.group({
      reportType: ['PURCHASE' as ReportTypeUi, Validators.required],
      search: [''],
      customerId: [''],
      startDate: [this.formatDateForInput(firstDayOfYear), Validators.required],
      endDate: [this.formatDateForInput(today), Validators.required]
    });
  }

  private formatDateForInput(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /** Format yyyy-MM-dd to dd-MM-yyyy for Payment Done API only. */
  private formatDateDDMMYYYY(dateStr: string): string {
    if (!dateStr) return dateStr;
    const [y, m, d] = dateStr.split('-');
    if (!d || !m || !y) return dateStr;
    return `${d}-${m}-${y}`;
  }

  private loadCustomers(): void {
    this.isLoadingCustomers = true;
    this.customerService
      .getCustomers({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          if (response?.success && response?.data) {
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
          if (response?.success && response?.data) {
            this.customers = response.data;
            this.snackbar.success('Customers refreshed successfully');
          }
          this.isLoadingCustomers = false;
        },
        error: () => {
          this.isLoadingCustomers = false;
          this.snackbar.error('Failed to refresh customers');
        }
      });
  }

  onReportTypeChange(): void {
    const reportType = this.reportForm.get('reportType')?.value as ReportTypeUi;
    const startDate = this.reportForm.get('startDate');
    const endDate = this.reportForm.get('endDate');
    if (reportType === 'COLLECTION_OUTSTANDING') {
      startDate?.clearValidators();
      endDate?.clearValidators();
    } else {
      startDate?.setValidators(Validators.required);
      endDate?.setValidators(Validators.required);
    }
    startDate?.updateValueAndValidity();
    endDate?.updateValueAndValidity();
    this.currentPage = 0;
    this.rows = [];
    this.totalElements = 0;
    this.totalPages = 0;
  }

  onSearch(event?: Event, skipValidation?: boolean): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    Object.keys(this.reportForm.controls).forEach(key => {
      this.reportForm.get(key)?.markAsTouched();
    });

    const values = this.reportForm.value;
    const reportType: ReportTypeUi = values.reportType;

    if (!skipValidation) {
      if (reportType === 'PURCHASE' || reportType === 'SALES' || reportType === 'PAYMENT_DONE') {
        if (this.reportForm.get('startDate')?.invalid || this.reportForm.get('endDate')?.invalid) {
          this.snackbar.error('Please fill all required fields');
          return;
        }
        const startDate = new Date(values.startDate);
        const endDate = new Date(values.endDate);
        if (startDate > endDate) {
          this.snackbar.error('Start date cannot be after end date');
          return;
        }
      } else if (reportType === 'COLLECTION_OUTSTANDING' && this.reportForm.invalid) {
        this.snackbar.error('Please fill all required fields');
        return;
      }
    }

    this.isLoading = true;

    if (reportType === 'COLLECTION_OUTSTANDING') {
      const payload = {
        currentPage: this.currentPage,
        perPageRecord: this.pageSize,
        search: (values.search || '').trim() || undefined
      };
      this.collectionPaymentService.searchCollectionOutstanding(payload).pipe(takeUntil(this.destroy$)).subscribe({
        next: (page: any) => {
          this.rows = Array.isArray(page?.content) ? page.content : [];
          this.totalElements = Number(page?.totalElements ?? 0);
          this.totalPages = Number(page?.totalPages ?? 0);
          this.isLoading = false;
        },
        error: (error: any) => {
          this.isLoading = false;
          this.rows = [];
          this.totalElements = 0;
          this.totalPages = 0;
          this.snackbar.error(error?.error?.message || 'Failed to load report');
        }
      });
      return;
    }

    if (reportType === 'PAYMENT_DONE') {
      const payload = {
        currentPage: this.currentPage,
        perPageRecord: this.pageSize,
        startDate: this.formatDateDDMMYYYY(values.startDate),
        endDate: this.formatDateDDMMYYYY(values.endDate)
      };
      this.collectionPaymentService.searchPaymentDone(payload).pipe(takeUntil(this.destroy$)).subscribe({
        next: (page: any) => {
          this.rows = Array.isArray(page?.content) ? page.content : [];
          this.totalElements = Number(page?.totalElements ?? 0);
          this.totalPages = Number(page?.totalPages ?? 0);
          this.isLoading = false;
        },
        error: (error: any) => {
          this.isLoading = false;
          this.rows = [];
          this.totalElements = 0;
          this.totalPages = 0;
          this.snackbar.error(error?.error?.message || 'Failed to load report');
        }
      });
      return;
    }

    const payload: SalesPurchaseReportSearchPayload = {
      currentPage: this.currentPage,
      perPageRecord: this.pageSize,
      customerId: values.customerId ? Number(values.customerId) : undefined,
      startDate: values.startDate,
      endDate: values.endDate
    };

    const request$ =
      reportType === 'PURCHASE'
        ? this.reportService.searchPurchaseReport(payload)
        : this.reportService.searchSalesReport(payload);

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (page: any) => {
        const content: any[] = Array.isArray(page?.content) ? page.content : [];
        this.rows = content.map(item => this.mapRow(item, reportType));
        this.totalElements = Number(page?.totalElements ?? 0);
        this.totalPages = Number(page?.totalPages ?? 0);
        this.isLoading = false;
      },
      error: (error: any) => {
        this.isLoading = false;
        this.rows = [];
        this.totalElements = 0;
        this.totalPages = 0;
        this.snackbar.error(error?.error?.message || 'Failed to load report');
      }
    });
  }

  exportExcel(): void {
    if (this.isExporting) return;

    Object.keys(this.reportForm.controls).forEach(key => {
      this.reportForm.get(key)?.markAsTouched();
    });

    const values = this.reportForm.value;
    const reportType: ReportTypeUi = values.reportType;

    if (reportType === 'PURCHASE' || reportType === 'SALES' || reportType === 'PAYMENT_DONE') {
      if (this.reportForm.get('startDate')?.invalid || this.reportForm.get('endDate')?.invalid) {
        this.snackbar.error('Please fill all required fields');
        return;
      }
      const startDate = new Date(values.startDate);
      const endDate = new Date(values.endDate);
      if (startDate > endDate) {
        this.snackbar.error('Start date cannot be after end date');
        return;
      }
    }

    this.isExporting = true;

    const doDownload = (request$: Observable<{ blob: Blob; filename: string }>) => {
      request$.pipe(takeUntil(this.destroy$)).subscribe({
        next: ({ blob, filename }) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          this.snackbar.success('Report downloaded successfully');
          this.isExporting = false;
        },
        error: (error: any) => {
          this.isExporting = false;
          this.snackbar.error(error?.error?.message || 'Failed to export report');
        }
      });
    };

    if (reportType === 'COLLECTION_OUTSTANDING') {
      doDownload(this.collectionPaymentService.exportCollectionOutstandingExcel({
        currentPage: 0,
        perPageRecord: this.pageSize,
        search: (values.search || '').trim() || undefined
      }));
      return;
    }

    if (reportType === 'PAYMENT_DONE') {
      doDownload(this.collectionPaymentService.exportPaymentDoneExcel({
        currentPage: 0,
        perPageRecord: this.pageSize,
        startDate: this.formatDateDDMMYYYY(values.startDate),
        endDate: this.formatDateDDMMYYYY(values.endDate)
      }));
      return;
    }

    const exportPayload = {
      customerId: values.customerId ? Number(values.customerId) : undefined,
      startDate: values.startDate,
      endDate: values.endDate
    };

    const request$ =
      reportType === 'PURCHASE'
        ? this.reportService.exportPurchaseReportExcel(exportPayload)
        : this.reportService.exportSalesReportExcel(exportPayload);
    doDownload(request$);
  }

  resetForm(): void {
    const today = new Date();
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);

    this.reportForm.patchValue({
      reportType: 'PURCHASE',
      search: '',
      customerId: '',
      startDate: this.formatDateForInput(firstDayOfYear),
      endDate: this.formatDateForInput(today)
    });
    this.reportForm.get('startDate')?.setValidators(Validators.required);
    this.reportForm.get('endDate')?.setValidators(Validators.required);
    this.reportForm.get('startDate')?.updateValueAndValidity();
    this.reportForm.get('endDate')?.updateValueAndValidity();
    this.reportForm.markAsUntouched();
    this.currentPage = 0;
    this.rows = [];
    this.totalElements = 0;
    this.totalPages = 0;
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

  trackByIndex(index: number): number {
    return index;
  }

  get reportType(): ReportTypeUi {
    return this.reportForm?.get('reportType')?.value ?? 'PURCHASE';
  }

  get isPurchaseOrSales(): boolean {
    return this.reportType === 'PURCHASE' || this.reportType === 'SALES';
  }

  private mapRow(item: any, reportType: ReportTypeUi): ReportRowUi {
    if (reportType === 'PURCHASE') {
      return {
        invoiceNumber: String(item?.invoice_number ?? ''),
        customerName: String(item?.customer_name ?? ''),
        date: String(item?.purchase_date ?? ''),
        numberOfItems: item?.number_of_items ?? '',
        taxAmount: item?.tax_amount ?? '',
        totalAmount: item?.total_purchase_amount ?? ''
      };
    }
    return {
      invoiceNumber: String(item?.invoice_number ?? ''),
      customerName: String(item?.customer_name ?? ''),
      date: String(item?.sale_date ?? ''),
      numberOfItems: item?.number_of_items ?? '',
      taxAmount: item?.tax_amount ?? '',
      totalAmount: item?.total_sale_amount ?? ''
    };
  }
}

