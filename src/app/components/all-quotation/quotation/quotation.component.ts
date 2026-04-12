import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { QuotationService } from '../../../services/quotation.service';
import { CustomerService } from '../../../services/customer.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ModalService } from '../../../services/modal.service';
import { DateUtils } from '../../../shared/utils/date-utils';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { QuotationStatus, StatusOption } from '../../../models/quotation.model';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { AuthService, UserRole } from '../../../services/auth.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { Subject, finalize } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-quotation',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    MatDialogModule,
    LoaderComponent,
    SearchableSelectComponent,
    PaginationComponent
  ],
  templateUrl: './quotation.component.html',
  styleUrl: './quotation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuotationComponent implements OnInit, OnDestroy {
  quotations: any[] = [];
  searchForm!: FormGroup;
  isLoading = false;
  statusOptions: any[] = [];


  // Pagination properties
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50, 100];
  totalPages = 0;
  totalElements = 0;
  totalQuotationAmountSum: number | null = null;
  startIndex = 0;
  endIndex = 0;
  selectedQuotation: any = null;
  products: any[] = [];
  isLoadingProducts = false;
  customers: any[] = [];
  isLoadingCustomers = false;
  private destroy$ = new Subject<void>();
  private clickListener: any;
  isDealerUser = false;

  constructor(
    private quotationService: QuotationService,
    private customerService: CustomerService,
    private fb: FormBuilder,
    private snackbar: SnackbarService,
    private dialog: MatDialog,
    private modalService: ModalService,
    private dateUtils: DateUtils,
    private encryptionService: EncryptionService,
    private router: Router,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    this.initializeForm();
    this.statusOptions = Object.entries(QuotationStatus).map(([key, value]) => ({ label: value, value: key }));
    this.setupClickOutsideListener();
  }

  ngOnInit(): void {
    this.isDealerUser = this.authService.hasRole(UserRole.DEALER);
    this.loadQuotations();
    if (!this.isDealerUser) {
      this.loadCustomers();
    }
  }

  private initializeForm(): void {
    this.searchForm = this.fb.group({
      search: [''],
      customerId: [''],
      startDate: [''],
      endDate: [''],
      status: null
    });
  }

  loadQuotations(): void {
    this.isLoading = true;
    this.totalQuotationAmountSum = null;
    const params = {
      currentPage: this.currentPage,
      perPageRecord: this.pageSize,
      startDate: this.searchForm.value.startDate ? this.dateUtils.formatDate(this.searchForm.value.startDate) : '',
      endDate: this.searchForm.value.endDate ? this.dateUtils.formatDate(this.searchForm.value.endDate) : '',
      ...this.searchForm.value,
    };

    this.quotationService.searchQuotations(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          // Initialize showStatusDropdown for each quotation
          this.quotations = response.content.map((q: any) => ({
            ...q,
            showStatusDropdown: false
          }));
          this.totalQuotationAmountSum = this.calculateTotalQuotationAmount(this.quotations);
          this.totalPages = response.totalPages;
          this.totalElements = response.totalElements;
          this.startIndex = this.currentPage * this.pageSize;
          this.endIndex = Math.min((this.currentPage + 1) * this.pageSize, this.totalElements);
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error: any) => {
          this.snackbar.error(error.message || 'Failed to load quotations');
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private calculateTotalQuotationAmount(rows: any[]): number {
    let sum = 0;
    for (const row of rows ?? []) {
      const value = row?.totalAmount as unknown;
      if (typeof value === 'number') {
        sum += isFinite(value) ? value : 0;
      } else if (value !== null && value !== undefined) {
        const n = Number(value);
        sum += isFinite(n) ? n : 0;
      }
    }
    return sum;
  }

  onSearch(): void {
    this.currentPage = 0;
    this.loadQuotations();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadQuotations();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize = newSize;
    this.currentPage = 0;
    this.loadQuotations();
  }

  openSaleModal(quotation: any) {
    this.selectedQuotation = quotation;
    this.modalService.open('sale');
  }

  deleteQuotation(id: number): void {
    if (confirm('Are you sure you want to delete this quotation? This action cannot be undone.')) {
      this.isLoading = true;
      this.quotationService.deleteQuotation(id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.snackbar.success('Quotation deleted successfully');
            this.loadQuotations();
          },
          error: (error) => {
            this.snackbar.error(error?.error?.message || 'Failed to delete quotation');
            this.isLoading = false;
            this.cdr.markForCheck();
          }
        });
    }
  }

  private loadCustomers(): void {
    if (this.isDealerUser) {
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
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.snackbar.error('Failed to load customers');
          this.isLoadingCustomers = false;
          this.cdr.markForCheck();
        }
      });
  }

  refreshCustomers(): void {
    if (this.isDealerUser) {
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
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.snackbar.error('Failed to refresh customers');
          this.isLoadingCustomers = false;
          this.cdr.markForCheck();
        }
      });
  }

  resetForm(): void {
    this.searchForm.reset();
    this.currentPage = 0;
    this.loadQuotations();
  }

  getStatusLabel(status: string): string {
    return QuotationStatus[status as keyof typeof QuotationStatus] || status;
  }

  getStatusClass(status: string): string {
    const statusClasses: { [key: string]: string } = {
      Q: 'status-quote',
      A: 'status-accepted',
      D: 'status-declined',
      R: 'status-ready',
      P: 'status-processing',
      PC: 'status-packaging',
      C: 'status-completed',
      I: 'status-invoiced'
    };
    return statusClasses[status] || 'status-default';
  }

  generatePdf(id: number, quotation: any): void {
    if (!quotation) return;

    quotation.isPrinting = true;
    this.cdr.markForCheck();

    this.quotationService.generatePdf(id)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          quotation.isPrinting = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response) => {
          const url = window.URL.createObjectURL(response.blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'quotation-' + quotation.customerName + '.pdf';
          link.click();
          window.URL.revokeObjectURL(url);
        },
        error: () => {
          this.snackbar.error('Failed to generate PDF');
        }
      });
  }

  generateDispatchPdf(id: number, quotation: any): void {
    if (!quotation) return;

    quotation.isPrinting = true;
    this.cdr.markForCheck();
    this.quotationService.generateDispatchPdf(id, null)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          quotation.isPrinting = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (response) => {
          const url = window.URL.createObjectURL(response.blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'dispatch-slip.pdf';
          link.click();
          window.URL.revokeObjectURL(url);
        },
        error: () => {
          this.snackbar.error('Failed to generate PDF');
        }
      });
  }

  getStatusIcon(status: string): string {
    const statusIcons: { [key: string]: string } = {
      Q: 'fa-file-alt',         // Quote
      A: 'fa-check-circle',     // Accepted
      D: 'fa-times-circle',     // Declined
      R: 'fa-clock',            // Ready
      P: 'fa-spinner fa-spin',  // Processing
      PC: 'fa-spinner fa-spin',  // Processing
      C: 'fa-check-double',      // Completed
      I: 'fa-file-invoice'      // Invoiced
    };
    return statusIcons[status] || 'fa-question-circle';
  }

  private setupClickOutsideListener(): void {
    this.clickListener = (event: any) => {
      const dropdowns = document.querySelectorAll('.status-container');
      dropdowns.forEach(dropdown => {
        if (!dropdown.contains(event.target)) {
          this.quotations.forEach(q => q.showStatusDropdown = false);
        }
      });
    };
    document.addEventListener('click', this.clickListener);
  }

  toggleStatusDropdown(quotation: any): void {
    event?.stopPropagation();
    this.quotations.forEach(q => {
      if (q !== quotation) q.showStatusDropdown = false;
    });
    quotation.showStatusDropdown = !quotation.showStatusDropdown;
  }

  canChangeStatus(status: string): boolean {
    return ['D', 'Q', 'A', 'P', 'PC', 'C'].includes(status);
  }

  updateStatus(quotation: any, newStatus: string): void {
    if (!quotation || quotation.isUpdating) return;

    quotation.isUpdating = true;
    quotation.showStatusDropdown = false;

    this.quotationService.updateQuotationStatus(quotation.id, newStatus)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          quotation.status = newStatus;
          this.snackbar.success('Status updated successfully');
          quotation.isUpdating = false;
          this.cdr.markForCheck();
        },
        error: (error: any) => {
          this.snackbar.error(error?.error?.message || 'Failed to update status');
          quotation.isUpdating = false;
          this.cdr.markForCheck();
        }
      });
  }

  getAvailableStatusOptions(currentStatus: string): StatusOption[] {
    switch (currentStatus) {
      case 'Q':
        return [
          { label: QuotationStatus.A, value: 'A', disabled: false },
          { label: QuotationStatus.D, value: 'D', disabled: false }
        ];
      case 'A':
        return [
          { label: QuotationStatus.P, value: 'P', disabled: false },
          { label: QuotationStatus.D, value: 'D', disabled: false }
        ];
      case 'P':
        return [{ label: QuotationStatus.C, value: 'C', disabled: false }];
      case 'D':
        return [{ label: QuotationStatus.A, value: 'A', disabled: false }];
      case 'C':
        return [{ label: QuotationStatus.I, value: 'I', disabled: false }];
      case 'I':
        return []; // Status cannot be updated
      default:
        return [];
    }
  }

  editQuotation(id: number): void {
    if (!id) return;
    localStorage.setItem('editQuotationId', this.encryptionService.encrypt(id.toString()));
    this.router.navigate(['/quotation/create']);
  }

  addQuotation(): void {
    localStorage.removeItem('editQuotationId');
    this.router.navigate(['/quotation/create']);
  }

  addDealerOrder(): void {
    this.router.navigate(['/quotation/dealer-order']);
  }

  // Role helpers for template
  canEditQuotation(): boolean {
    return this.authService.isAdmin() || this.authService.isStaffAdmin();
  }

  canDispatchQuotation(): boolean {
    return this.authService.isAdmin() || this.authService.isStaffAdmin();
  }

  dispatchQuotation(id: number): void {
    if (!id) return;
    localStorage.setItem('editQuotationId', this.encryptionService.encrypt(id.toString()));
    this.router.navigate(['/quotation/dispatch']);
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.clickListener) {
      document.removeEventListener('click', this.clickListener);
      this.clickListener = null;
    }

    // Clear arrays to help with garbage collection
    this.quotations = [];
    this.products = [];
    this.customers = [];
    this.statusOptions = [];
    this.selectedQuotation = null;
  }
}
