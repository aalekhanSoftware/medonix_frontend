import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../services/user.service';
import { AdminStaffUserListRequest, User } from '../../models/user.model';
import { ToastrService } from 'ngx-toastr';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-admin-staff-users',
  templateUrl: './admin-staff-users.component.html',
  styleUrls: ['./admin-staff-users.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, PaginationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminStaffUsersComponent implements OnInit, OnDestroy {
  users: User[] = [];
  searchForm!: FormGroup;
  passwordResetForm!: FormGroup;
  isLoading = false;
  isPasswordModalOpen = false;
  isResettingPassword = false;
  selectedUserForPassword: User | null = null;
  showNewPassword = false;
  showConfirmPassword = false;

  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50, 100];
  totalPages = 0;
  totalElements = 0;

  sortBy = 'first_name';
  sortDir: 'asc' | 'desc' = 'asc';

  private destroy$ = new Subject<void>();

  constructor(
    private userService: UserService,
    private fb: FormBuilder,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {
    this.initializeForm();
    this.initializePasswordResetForm();
  }

  ngOnInit(): void {
    this.loadUsers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.users = [];

    if (this.searchForm) {
      this.searchForm.reset();
    }
  }

  private initializeForm(): void {
    this.searchForm = this.fb.group({
      search: [''],
      status: ['']
    });
  }

  private initializePasswordResetForm(): void {
    this.passwordResetForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(50)]],
      confirmPassword: ['', [Validators.required]]
    });
  }

  loadUsers(): void {
    this.isLoading = true;
    const formValues = this.searchForm.value;

    const params: AdminStaffUserListRequest = {
      search: formValues.search?.trim() || '',
      page: this.currentPage,
      size: this.pageSize,
      sortBy: this.sortBy,
      sortDir: this.sortDir
    };

    if (formValues.status) {
      params.status = formValues.status;
    }

    this.userService.listAdminStaffUsers(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.users = response.data.content;
            this.totalPages = response.data.totalPages;
            this.totalElements = response.data.totalElements;
          }
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.toastr.error('Failed to load admin staff users');
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  onSearch(): void {
    this.currentPage = 0;
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

  resetForm(): void {
    this.searchForm.reset({ search: '', status: '' });
    this.currentPage = 0;
    this.sortBy = 'first_name';
    this.sortDir = 'asc';
    this.loadUsers();
  }

  getUserDisplayName(user: User): string {
    return `${user.firstName} ${user.lastName}`.trim();
  }

  openSetPasswordModal(user: User): void {
    this.selectedUserForPassword = user;
    this.isPasswordModalOpen = true;
    this.showNewPassword = false;
    this.showConfirmPassword = false;
    this.passwordResetForm.reset();
    this.cdr.markForCheck();
  }

  closeSetPasswordModal(): void {
    this.isPasswordModalOpen = false;
    this.isResettingPassword = false;
    this.selectedUserForPassword = null;
    this.showNewPassword = false;
    this.showConfirmPassword = false;
    this.passwordResetForm.reset();
    this.cdr.markForCheck();
  }

  togglePasswordField(field: 'new' | 'confirm'): void {
    if (field === 'new') {
      this.showNewPassword = !this.showNewPassword;
      return;
    }

    this.showConfirmPassword = !this.showConfirmPassword;
  }

  get passwordsMismatch(): boolean {
    const password = this.passwordResetForm.get('password')?.value;
    const confirmPassword = this.passwordResetForm.get('confirmPassword')?.value;
    return !!password && !!confirmPassword && password !== confirmPassword;
  }

  submitPasswordReset(): void {
    if (!this.selectedUserForPassword?.id) {
      this.toastr.error('User id is not available');
      return;
    }

    if (this.passwordResetForm.invalid || this.passwordsMismatch) {
      Object.keys(this.passwordResetForm.controls).forEach((key) => {
        this.passwordResetForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.isResettingPassword = true;
    const password = this.passwordResetForm.get('password')?.value;

    this.userService.updatePassword({
      id: this.selectedUserForPassword.id,
      password
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.toastr.success(response.message || 'Password updated successfully');
            this.closeSetPasswordModal();
            return;
          }

          this.toastr.error(response.message || 'Failed to update password');
          this.isResettingPassword = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.toastr.error(error?.error?.message || 'Failed to update password');
          this.isResettingPassword = false;
          this.cdr.markForCheck();
        }
      });
  }
}
