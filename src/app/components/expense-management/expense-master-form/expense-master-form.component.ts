import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { EmployeeMasterService } from '../../../services/employee-master.service';
import { ExpenseMasterService } from '../../../services/expense-master.service';
import { EXPENSE_MASTER_DRAFT_KEY } from '../expense-master-list/expense-master-list.component';
import { ExpenseMaster } from '../../../models/expense-master.model';

function atLeastOneEmployee(control: AbstractControl): ValidationErrors | null {
  const v = control.value;
  if (Array.isArray(v) && v.length > 0) {
    return null;
  }
  return { employeesRequired: true };
}

export interface ReasonSelectOption {
  id: string;
  name: string;
}

@Component({
  selector: 'app-expense-master-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LoaderComponent, RouterLink, SearchableSelectComponent],
  templateUrl: './expense-master-form.component.html',
  styleUrls: ['./expense-master-form.component.scss']
})
export class ExpenseMasterFormComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  isLoading = false;
  isLoadingEmployees = false;
  isEditMode = false;
  expenseId?: number;
  employees: { id: number; name: string }[] = [];

  readonly reasonOptions: ReasonSelectOption[] = [
    { id: 'Office', name: 'Office' },
    { id: 'Marketing', name: 'Marketing' },
    { id: 'Miscellaneous', name: 'Miscellaneous' },
    { id: 'Courier', name: 'Courier' },
    { id: 'Purchase', name: 'Purchase' },
    { id: 'Cash', name: 'Cash' }
  ];

  reasonOptionsForDisplay: ReasonSelectOption[] = [];

  private destroy$ = new Subject<void>();
  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private expenseService: ExpenseMasterService,
    private employeeMasterService: EmployeeMasterService,
    private router: Router,
    private snackbar: SnackbarService,
    private encryption: EncryptionService
  ) {
    this.form = this.fb.group({
      employeeIds: [[], [atLeastOneEmployee]],
      amount: [null, [Validators.required, Validators.min(0.01)]],
      reason: ['', [Validators.required, Validators.maxLength(200)]],
      expenseDate: ['', [Validators.required]],
      isExpense: [true],
      other: ['', [Validators.maxLength(500)]],
      remarks: ['', [Validators.maxLength(500)]]
    });
  }

  ngOnInit(): void {
    this.reasonOptionsForDisplay = [...this.reasonOptions];
    this.loadEmployees();
    const stored = localStorage.getItem(EXPENSE_MASTER_DRAFT_KEY);
    if (!stored) {
      return;
    }
    const decrypted = this.encryption.decrypt(stored) as unknown;
    let draft: ExpenseMaster | null = null;
    if (typeof decrypted === 'string' && decrypted) {
      try {
        draft = JSON.parse(decrypted) as ExpenseMaster;
      } catch {
        draft = null;
      }
    } else if (decrypted && typeof decrypted === 'object' && !Array.isArray(decrypted)) {
      draft = decrypted as ExpenseMaster;
    }
    if (draft?.id != null) {
      this.isEditMode = true;
      this.expenseId = draft.id;
      const reasonStr = (draft.reason ?? '').trim();
      if (reasonStr && !this.reasonOptions.some((o) => o.id === reasonStr)) {
        this.reasonOptionsForDisplay = [...this.reasonOptions, { id: reasonStr, name: reasonStr }];
      }
      this.form.patchValue({
        employeeIds: draft.employeeIds ?? [],
        amount: draft.amount,
        reason: reasonStr,
        expenseDate: this.toInputDate(draft.expenseDate),
        isExpense: draft.isExpense ?? true,
        other: draft.other ?? '',
        remarks: draft.remarks ?? ''
      });
    }
  }

  loadEmployees(): void {
    this.isLoadingEmployees = true;
    const sub = this.employeeMasterService
      .getEmployees({ name: '', status: '', search: '' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.isLoadingEmployees = false;
          if (res?.success && Array.isArray(res.data)) {
            this.employees = res.data
              .filter((e) => e.id != null)
              .map((e) => ({ id: e.id as number, name: e.name }));
          } else {
            this.employees = [];
          }
        },
        error: () => {
          this.isLoadingEmployees = false;
          this.snackbar.error('Could not load employees for this form.');
        }
      });
    this.subscriptions.push(sub);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isLoading = true;
    const { employeeIds, amount, reason, expenseDate, isExpense, other, remarks } = this.form.value as {
      employeeIds: number[];
      amount: number;
      reason: string;
      expenseDate: string;
      isExpense: boolean;
      other: string;
      remarks: string;
    };
    const dateOut = this.toInputDate(expenseDate);
    const otherOut = other?.trim() ? other.trim() : null;
    const remarksOut = remarks?.trim() ? remarks.trim() : null;

    const request$ = this.isEditMode
      ? this.expenseService.update({
          id: this.expenseId!,
          employeeIds,
          amount: Number(amount),
          reason: reason.trim(),
          expenseDate: dateOut,
          isExpense: Boolean(isExpense),
          other: otherOut,
          remarks: remarksOut
        })
      : this.expenseService.create({
          employeeIds,
          amount: Number(amount),
          reason: reason.trim(),
          expenseDate: dateOut,
          isExpense: Boolean(isExpense),
          other: otherOut,
          remarks: remarksOut
        });

    const sub = request$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response?.success === false) {
            this.snackbar.error(response?.message || 'Something went wrong');
            this.isLoading = false;
            return;
          }
          this.snackbar.success(response?.message || (this.isEditMode ? 'Expense updated' : 'Expense created'));
          localStorage.removeItem(EXPENSE_MASTER_DRAFT_KEY);
          void this.router.navigate(['/expense-master']);
        },
        error: (err) => {
          this.snackbar.error(err?.error?.message || 'Request failed. Please check the form and try again.');
          this.isLoading = false;
        }
      });
    this.subscriptions.push(sub);
  }

  isFieldInvalid(field: string): boolean {
    const c = this.form.get(field);
    return !!(c && c.invalid && (c.dirty || c.touched));
  }

  getFieldError(field: string): string {
    const control = this.form.get(field);
    if (!control?.errors) return '';
    if (control.errors['required']) return 'This field is required';
    if (control.errors['min']) return 'Enter a positive amount';
    if (control.errors['maxlength']) return 'Too long';
    if (control.errors['employeesRequired']) return 'Choose at least one employee';
    return 'Invalid value';
  }

  private toInputDate(value: string | null | undefined): string {
    if (!value) return '';
    return String(value).split('T')[0];
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((s) => s.unsubscribe());
    this.destroy$.next();
    this.destroy$.complete();
    this.employees = [];
    this.form?.reset();
  }
}
