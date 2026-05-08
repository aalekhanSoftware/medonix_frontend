import { Component, Inject, PLATFORM_ID, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { isPlatformBrowser } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit, OnDestroy {
  loginForm: FormGroup;
  isLoading = false;
  isClientsLoading = false;
  clients: Array<{ id: number; name: string }> = [];
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private snackbar: SnackbarService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.loginForm = this.fb.group({
      clientId: [null, Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.loadClients();
  }

  private loadClients(): void {
    this.isClientsLoading = true;
    this.authService.getPublicClients()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.clients = response?.data ?? [];
          this.isClientsLoading = false;
        },
        error: () => {
          this.snackbar.error('Failed to load clients');
          this.isClientsLoading = false;
        }
      });
  }

  get selectedClientName(): string {
    const selectedId = Number(this.loginForm.get('clientId')?.value);
    if (!selectedId) return '';
    return this.clients.find(c => c.id === selectedId)?.name ?? '';
  }

  onSubmit(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    if (this.loginForm.valid) {
      this.isLoading = true;

      const formValue = this.loginForm.value;
      const payload = {
        clientId: Number(formValue.clientId),
        email: formValue.email,
        password: formValue.password
      };

      this.authService.login(payload)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            // Check if we're in the browser before accessing localStorage
            if (isPlatformBrowser(this.platformId)) {
              localStorage.setItem('token', response.accessToken);
              localStorage.setItem('user', JSON.stringify(response.user));
            }
            this.snackbar.success('Login successful');
            this.router.navigate(['/quotation']);
            this.isLoading = false;
          },
          error: (error) => {
            this.snackbar.error(error?.error?.message || 'Login failed');
            this.isLoading = false;
          }
        });
    } else {
      this.snackbar.warning('Please fill in all required fields correctly');
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}