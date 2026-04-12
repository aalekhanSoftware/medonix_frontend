import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { ExpenseMasterService } from '../../../services/expense-master.service';
import type { ExpenseMaster } from '../../../models/expense-master.model';

export const EXPENSE_MASTER_DRAFT_KEY = 'expenseMasterDraft';

@Component({
  selector: 'app-expense-master-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    LoaderComponent,
    PaginationComponent
  ],
  templateUrl: './expense-master-list.component.html',
  styleUrls: ['./expense-master-list.component.scss']
})
export class ExpenseMasterListComponent implements OnInit, OnDestroy {
  @ViewChild('excelFileInput') excelFileInput?: ElementRef<HTMLInputElement>;

  searchForm!: FormGroup;
  isLoading = false;
  isImporting = false;
  rows: ExpenseMaster[] = [];
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50, 100];
  totalPages = 0;
  totalElements = 0;
  totalExpenseAmountSum: number | null = null;
  startIndex = 0;
  endIndex = 0;

  private destroy$ = new Subject<void>();
  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private expenseService: ExpenseMasterService,
    private snackbar: SnackbarService,
    private router: Router,
    private encryption: EncryptionService
  ) {
    this.searchForm = this.fb.group({
      search: [''],
      reason: [''],
      isExpense: ['']
    });
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.isLoading = true;
    this.totalExpenseAmountSum = null;
    const v = this.searchForm.value;
    const payload = {
      search: v.search || '',
      reason: v.reason || '',
      isExpense: this.parseIsExpenseFilter(v.isExpense),
      page: this.currentPage,
      size: this.pageSize,
      sortBy: 'id' as const,
      sortDir: 'desc' as const
    };
    const sub = this.expenseService
      .search(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response?.data?.content) {
            this.rows = response.data.content;
            this.totalExpenseAmountSum = this.calculateTotalExpenseAmount(this.rows);
            this.totalPages = response.data.totalPages;
            this.totalElements = response.data.totalElements;
            this.updateIndexes();
          } else {
            this.rows = [];
            this.totalExpenseAmountSum = 0;
            this.totalPages = 0;
            this.totalElements = 0;
            this.updateIndexes();
          }
          this.isLoading = false;
        },
        error: () => {
          this.snackbar.error('Could not load expenses. Try again in a moment.');
          this.isLoading = false;
        }
      });
    this.subscriptions.push(sub);
  }

  private calculateTotalExpenseAmount(rows: ExpenseMaster[]): number {
    let sum = 0;
    for (const row of rows ?? []) {
      const value = row?.amount as unknown;
      if (typeof value === 'number') {
        sum += isFinite(value) ? value : 0;
      } else if (value !== null && value !== undefined) {
        const n = Number(value);
        sum += isFinite(n) ? n : 0;
      }
    }
    return sum;
  }

  /** Uses `employeeNames` / `employees` from search API when present; otherwise falls back to id placeholders. */
  employeeDisplay(row: ExpenseMaster): string {
    const names = row.employeeNames?.filter((n) => n != null && String(n).trim() !== '');
    if (names?.length) {
      return names.join(', ');
    }
    const fromEmployees = row.employees
      ?.map((e) => e?.name)
      .filter((n) => n != null && String(n).trim() !== '');
    if (fromEmployees?.length) {
      return fromEmployees.join(', ');
    }
    const ids = row.employeeIds;
    if (!ids?.length) {
      return '—';
    }
    return ids.map((id) => `#${id}`).join(', ');
  }

  formatAmount(amount: number | null | undefined): string {
    if (amount == null || Number.isNaN(Number(amount))) return '—';
    return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      Number(amount)
    );
  }

  formatExpenseDate(value: string | null | undefined): string {
    if (!value) return '—';
    const input = String(value).split('T')[0];
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) {
      return input;
    }
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).format(parsed);
  }

  expenseTypeLabel(row: ExpenseMaster): string {
    return row?.isExpense === false ? 'Income' : 'Expense';
  }

  onSearch(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.currentPage = 0;
    this.loadData();
  }

  reset(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.searchForm.reset({ search: '', reason: '', isExpense: '' });
    this.currentPage = 0;
    this.pageSize = 10;
    this.loadData();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadData();
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.currentPage = 0;
    this.loadData();
  }

  deleteRow(id: number, reason: string): void {
    if (!confirm(`Delete this expense (${reason || 'no reason'})? This cannot be undone.`)) {
      return;
    }
    this.isLoading = true;
    const sub = this.expenseService
      .delete(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res?.success === false) {
            this.snackbar.error(res?.message || 'Delete did not complete');
            this.isLoading = false;
            return;
          }
          this.snackbar.success(res?.message || 'Expense removed');
          this.loadData();
        },
        error: (err) => {
          this.snackbar.error(err?.error?.message || 'Could not delete this expense');
          this.isLoading = false;
        }
      });
    this.subscriptions.push(sub);
  }

  onEdit(row: ExpenseMaster): void {
    if (row.id == null) return;
    const draft = {
      id: row.id,
      employeeIds: [...(row.employeeIds || [])],
      amount: row.amount,
      reason: row.reason,
      expenseDate: row.expenseDate ?? '',
      isExpense: row.isExpense ?? true,
      other: row.other ?? '',
      remarks: row.remarks ?? ''
    };
    localStorage.setItem(EXPENSE_MASTER_DRAFT_KEY, this.encryption.encrypt(JSON.stringify(draft)));
    void this.router.navigate(['/expense-master/edit']);
  }

  goToCreate(): void {
    localStorage.removeItem(EXPENSE_MASTER_DRAFT_KEY);
    void this.router.navigate(['/expense-master/create']);
  }

  onImportExcelClick(): void {
    const input = this.excelFileInput?.nativeElement;
    if (!input) return;
    input.value = '';
    input.click();
  }

  onExcelFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      this.snackbar.error('Please choose an Excel file (.xlsx or .xls).');
      return;
    }
    if (this.isImporting) {
      return;
    }
    this.isImporting = true;
    const sub = this.expenseService
      .importExcel(file)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.isImporting = false;
          if (res?.success === false) {
            this.snackbar.error(res?.message || 'Import failed');
            return;
          }
          const d = res?.data;
          const extra =
            d != null && typeof d === 'object'
              ? ` Processed ${d.processedRows ?? 0}, inserted ${d.insertedRows ?? 0}.`
              : '';
          this.snackbar.success((res?.message || 'Import completed') + extra);
          this.loadData();
        },
        error: (err) => {
          this.isImporting = false;
          this.snackbar.error(err?.error?.message || 'Could not import the file. Please try again.');
        }
      });
    this.subscriptions.push(sub);
  }

  private updateIndexes(): void {
    this.startIndex = this.currentPage * this.pageSize;
    this.endIndex = Math.min(this.startIndex + this.pageSize, this.totalElements);
  }

  private parseIsExpenseFilter(value: unknown): boolean | null {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return null;
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((s) => s.unsubscribe());
    this.subscriptions = [];
    this.destroy$.next();
    this.destroy$.complete();
    this.rows = [];
    this.searchForm?.reset();
  }
}
