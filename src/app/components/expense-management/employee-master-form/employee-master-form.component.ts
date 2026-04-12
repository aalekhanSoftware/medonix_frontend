import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { EmployeeMasterService } from '../../../services/employee-master.service';
import { EMPLOYEE_MASTER_DRAFT_KEY } from '../employee-master-list/employee-master-list.component';
import { EmployeeMaster } from '../../../models/employee-master.model';

@Component({
  selector: 'app-employee-master-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LoaderComponent, RouterLink],
  templateUrl: './employee-master-form.component.html',
  styleUrls: ['./employee-master-form.component.scss']
})
export class EmployeeMasterFormComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  isLoading = false;
  isEditMode = false;
  employeeId?: number;

  private destroy$ = new Subject<void>();
  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private service: EmployeeMasterService,
    private router: Router,
    private snackbar: SnackbarService,
    private encryption: EncryptionService
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(200)]],
      status: ['A', Validators.required],
      remarks: ['', [Validators.maxLength(500)]]
    });
  }

  ngOnInit(): void {
    const stored = localStorage.getItem(EMPLOYEE_MASTER_DRAFT_KEY);
    if (!stored) {
      return;
    }
    // Same pattern as expense-master-form: decrypt may return a JSON string or a parsed object.
    const decrypted = this.encryption.decrypt(stored) as unknown;
    let draft: EmployeeMaster | null = null;
    if (typeof decrypted === 'string' && decrypted) {
      try {
        draft = JSON.parse(decrypted) as EmployeeMaster;
      } catch {
        draft = null;
      }
    } else if (decrypted && typeof decrypted === 'object' && !Array.isArray(decrypted)) {
      draft = decrypted as EmployeeMaster;
    }
    if (draft?.id != null) {
      this.isEditMode = true;
      this.employeeId = draft.id;
      this.form.patchValue({
        name: draft.name ?? '',
        status: draft.status || 'A',
        remarks: draft.remarks ?? ''
      });
    }
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isLoading = true;
    const { name, status, remarks } = this.form.value as {
      name: string;
      status: string;
      remarks: string;
    };
    const remarksOut = remarks?.trim() ? remarks.trim() : null;

    const request$ = this.isEditMode
      ? this.service.update({
          id: this.employeeId!,
          name: name.trim(),
          status,
          remarks: remarksOut
        })
      : this.service.create({
          name: name.trim(),
          status,
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
          this.snackbar.success(response?.message || (this.isEditMode ? 'Employee updated' : 'Employee created'));
          localStorage.removeItem(EMPLOYEE_MASTER_DRAFT_KEY);
          void this.router.navigate(['/employee-master']);
        },
        error: (err) => {
          this.snackbar.error(err?.error?.message || 'Request failed. Please check the form and try again.');
          this.isLoading = false;
        }
      });
    this.subscriptions.push(sub);
  }

  getFieldError(field: string): string {
    const control = this.form.get(field) as AbstractControl | null;
    if (!control?.errors) return '';
    if (control.errors['required']) return 'This field is required';
    if (control.errors['maxlength']) return 'Too long';
    return 'Invalid value';
  }

  isFieldInvalid(field: string): boolean {
    const c = this.form.get(field);
    return !!(c && c.invalid && (c.dirty || c.touched));
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((s) => s.unsubscribe());
    this.destroy$.next();
    this.destroy$.complete();
    this.form?.reset();
  }
}
