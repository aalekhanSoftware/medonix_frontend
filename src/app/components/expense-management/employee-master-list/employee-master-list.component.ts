import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink, RouterModule } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { EmployeeMasterService } from '../../../services/employee-master.service';
import type { EmployeeMaster } from '../../../models/employee-master.model';

export const EMPLOYEE_MASTER_DRAFT_KEY = 'employeeMasterDraft';

@Component({
  selector: 'app-employee-master-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    RouterLink,
    LoaderComponent,
    PaginationComponent
  ],
  templateUrl: './employee-master-list.component.html',
  styleUrls: ['./employee-master-list.component.scss']
})
export class EmployeeMasterListComponent implements OnInit, OnDestroy {
  searchForm!: FormGroup;
  isLoading = false;
  rows: EmployeeMaster[] = [];
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50, 100];
  totalPages = 0;
  totalElements = 0;
  startIndex = 0;
  endIndex = 0;

  private destroy$ = new Subject<void>();
  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private service: EmployeeMasterService,
    private snackbar: SnackbarService,
    private router: Router,
    private encryption: EncryptionService
  ) {
    this.searchForm = this.fb.group({
      search: ['']
    });
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.isLoading = true;
    const v = this.searchForm.value;
    const payload = {
      search: v.search || '',
      status: '',
      page: this.currentPage,
      size: this.pageSize,
      sortBy: 'id' as const,
      sortDir: 'desc' as const
    };
    const sub = this.service
      .search(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response?.data?.content) {
            this.rows = response.data.content;
            this.totalPages = response.data.totalPages;
            this.totalElements = response.data.totalElements;
            this.updateIndexes();
          } else {
            this.rows = [];
            this.totalPages = 0;
            this.totalElements = 0;
            this.updateIndexes();
          }
          this.isLoading = false;
        },
        error: () => {
          this.snackbar.error('Could not load employees. Try again in a moment.');
          this.isLoading = false;
        }
      });
    this.subscriptions.push(sub);
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
    this.searchForm.reset({ search: '' });
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

  deleteRow(id: number, name: string): void {
    if (!confirm(`Remove ${name} from the employee list? This cannot be undone if the record is not linked to expenses.`)) {
      return;
    }
    this.isLoading = true;
    const sub = this.service
      .delete(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res?.success === false) {
            this.snackbar.error(res?.message || 'Delete did not complete');
            this.isLoading = false;
            return;
          }
          this.snackbar.success(res?.message || 'Employee removed');
          this.loadData();
        },
        error: (err) => {
          this.snackbar.error(err?.error?.message || 'Could not delete this employee');
          this.isLoading = false;
        }
      });
    this.subscriptions.push(sub);
  }

  onEdit(row: EmployeeMaster): void {
    if (row.id == null) return;
    const draft = {
      id: row.id,
      name: row.name,
      status: row.status,
      remarks: row.remarks ?? ''
    };
    localStorage.setItem(EMPLOYEE_MASTER_DRAFT_KEY, this.encryption.encrypt(JSON.stringify(draft)));
    void this.router.navigate(['/employee-master/edit']);
  }

  goToCreate(): void {
    localStorage.removeItem(EMPLOYEE_MASTER_DRAFT_KEY);
    void this.router.navigate(['/employee-master/create']);
  }

  private updateIndexes(): void {
    this.startIndex = this.currentPage * this.pageSize;
    this.endIndex = Math.min(this.startIndex + this.pageSize, this.totalElements);
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
