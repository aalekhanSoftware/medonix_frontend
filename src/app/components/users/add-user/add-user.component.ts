import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { UserService } from '../../../services/user.service';
import { User, UserDetailRequest, UserUpdatePasswordRequest } from '../../../models/user.model';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-add-user',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    LoaderComponent
  ],
  templateUrl: './add-user.component.html',
  styleUrls: ['./add-user.component.scss']
})
export class AddUserComponent implements OnInit, OnDestroy {
  userForm!: FormGroup;
  isLoading = false;
  isLoadingUser = false;
  isSubmitted = false;
  userId: number | null = null;
  user: User | null = null;
  isEditing = false;
  showPassword = false;
  passwordStrength: 'weak' | 'medium' | 'strong' = 'weak';

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private snackbar: SnackbarService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.route.params
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        if (params['id']) {
          this.userId = +params['id'];
          this.isEditing = true;
          this.loadUser();
        } else {
          this.isEditing = false;
          this.userId = null;
          this.user = null;
          this.initForm();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.user = null;
  }

  private initForm(): void {
    this.userForm = this.fb.group({
      password: ['', [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(50)
      ]],
      confirmPassword: ['', [Validators.required]],
      status: ['A', [Validators.required]]
    }, {
      validators: this.passwordMatchValidator
    });
  }

  passwordMatchValidator(form: FormGroup): { [key: string]: boolean } | null {
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');
    
    if (password && confirmPassword && password.value !== confirmPassword.value) {
      return { passwordMismatch: true };
    }
    return null;
  }

  loadUser(): void {
    if (!this.userId) return;

    this.isLoadingUser = true;
    const params: UserDetailRequest = { id: this.userId };

    this.userService.getUserDetail(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.user = response.data;
            this.patchForm(response.data);
          }
          this.isLoadingUser = false;
        },
        error: () => {
          this.snackbar.error('Failed to load user details');
          this.isLoadingUser = false;
          this.router.navigate(['/users']);
        }
      });
  }

  private patchForm(user: User): void {
    if (!user) return;

    this.userForm.patchValue({
      password: '',
      confirmPassword: '',
      status: user.status || 'A'
    });
  }

  onPasswordChange(): void {
    const password = this.userForm.get('password')?.value || '';
    this.checkPasswordStrength(password);
    
    // Update confirm password validation
    const confirmPassword = this.userForm.get('confirmPassword');
    if (confirmPassword) {
      confirmPassword.updateValueAndValidity();
    }
  }

  checkPasswordStrength(password: string): void {
    if (password.length === 0) {
      this.passwordStrength = 'weak';
      return;
    }

    let strength = 0;
    
    // Length check
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    
    // Character variety checks
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    
    if (strength <= 2) {
      this.passwordStrength = 'weak';
    } else if (strength <= 4) {
      this.passwordStrength = 'medium';
    } else {
      this.passwordStrength = 'strong';
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onSubmit(): void {
    this.isSubmitted = true;
    
    if (this.userForm.valid && this.userId) {
      this.isLoading = true;
      
      const formData = this.userForm.value;
      const params: UserUpdatePasswordRequest = {
        id: this.userId,
        password: formData.password,
        status: formData.status
      };

      this.userService.updatePassword(params)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (response.success) {
              this.snackbar.success(response.message || 'User updated successfully');
              this.router.navigate(['/users']);
            }
            this.isLoading = false;
          },
          error: (error) => {
            this.snackbar.error(error.error?.message || 'Failed to update user');
            this.isLoading = false;
          }
        });
    } else {
      // Mark all fields as touched to show validation errors
      Object.keys(this.userForm.controls).forEach(key => {
        this.userForm.get(key)?.markAsTouched();
      });
    }
  }

  onCancel(): void {
    this.router.navigate(['/users']);
  }

  getFieldError(fieldName: string): string {
    const control = this.userForm.get(fieldName);
    if (control?.errors && (control.dirty || control.touched || this.isSubmitted)) {
      if (control.errors['required']) {
        return `${fieldName === 'confirmPassword' ? 'Confirm password' : 'Password'} is required`;
      }
      if (control.errors['minlength']) {
        return `Password must be at least ${control.errors['minlength'].requiredLength} characters`;
      }
      if (control.errors['maxlength']) {
        return `Password must not exceed ${control.errors['maxlength'].requiredLength} characters`;
      }
    }
    return '';
  }

  getFormError(): string {
    if (this.userForm.errors && this.userForm.errors['passwordMismatch']) {
      return 'Passwords do not match';
    }
    return '';
  }

  getPasswordStrengthClass(): string {
    return `password-strength ${this.passwordStrength}`;
  }

  getPasswordStrengthText(): string {
    switch (this.passwordStrength) {
      case 'weak':
        return 'Weak';
      case 'medium':
        return 'Medium';
      case 'strong':
        return 'Strong';
      default:
        return '';
    }
  }
}
