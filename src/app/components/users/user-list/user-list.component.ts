import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { UserService } from '../../../services/user.service';
import { User, UserSearchRequest } from '../../../models/user.model';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule,
    LoaderComponent,
    PaginationComponent
  ],
  templateUrl: './user-list.component.html',
  styleUrls: ['./user-list.component.scss']
})
export class UserListComponent implements OnInit, OnDestroy {
  users: User[] = [];
  searchForm!: FormGroup;
  isLoading = false;
  
  // Pagination properties
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50, 100];
  totalPages = 0;
  totalElements = 0;
  startIndex = 0;
  endIndex = 0;

  // Sorting
  sortBy = 'id';
  sortDir: 'asc' | 'desc' = 'desc';

  // Client ID - can be made configurable
  clientId = 1;

  // Status filter
  statusFilter: 'A' | 'I' | 'all' = 'A';

  private destroy$ = new Subject<void>();

  constructor(
    private userService: UserService,
    private fb: FormBuilder,
    private snackbar: SnackbarService
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.loadUsers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.users = [];
  }

  private initializeForm(): void {
    this.searchForm = this.fb.group({
      search: [''],
      status: ['A']
    });
  }

  loadUsers(): void {
    this.isLoading = true;
    const formValues = this.searchForm.value;
    
    const params: UserSearchRequest = {
      clientId: this.clientId,
      search: formValues.search?.trim() || '',
      status: this.statusFilter !== 'all' ? this.statusFilter : undefined,
      page: this.currentPage,
      size: this.pageSize,
      sortBy: this.sortBy,
      sortDir: this.sortDir
    };

    this.userService.searchUsers(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.users = response.data.content;
            this.totalPages = response.data.totalPages;
            this.totalElements = response.data.totalElements;
            this.updatePaginationIndexes();
          }
          this.isLoading = false;
        },
        error: () => {
          this.snackbar.error('Failed to load users');
          this.isLoading = false;
        }
      });
  }

  updatePaginationIndexes(): void {
    this.startIndex = this.currentPage * this.pageSize;
    this.endIndex = Math.min(this.startIndex + this.pageSize, this.totalElements);
  }

  onSearch(): void {
    this.currentPage = 0;
    this.statusFilter = this.searchForm.value.status || 'A';
    this.loadUsers();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadUsers();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize = newSize;
    this.currentPage = 0;
    this.loadUsers();
  }

  onSort(column: string): void {
    if (this.sortBy === column) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = column;
      this.sortDir = 'desc';
    }
    this.currentPage = 0;
    this.loadUsers();
  }

  resetForm(): void {
    this.searchForm.reset({ search: '', status: 'A' });
    this.statusFilter = 'A';
    this.currentPage = 0;
    this.sortBy = 'id';
    this.sortDir = 'desc';
    this.loadUsers();
  }

  getStatusBadgeClass(status: 'A' | 'I'): string {
    return status === 'A' ? 'active' : 'inactive';
  }

  getStatusText(status: 'A' | 'I'): string {
    return status === 'A' ? 'Active' : 'Inactive';
  }

  getSortIcon(column: string): string {
    if (this.sortBy !== column) {
      return 'fa-sort';
    }
    return this.sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
  }
}
