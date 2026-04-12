import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { TransportMaster, TransportMasterService } from '../../../services/transport-master.service';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-add-transport-master',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LoaderComponent,
    RouterLink
  ],
  templateUrl: './add-transport.component.html',
  styleUrls: ['./add-transport.component.scss']
})
export class AddTransportComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  isLoading = false;
  isEditMode = false;
  transportId?: number;

  private destroy$ = new Subject<void>();
  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private service: TransportMasterService,
    private router: Router,
    private route: ActivatedRoute,
    private snackbar: SnackbarService,
    private encryption: EncryptionService
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    const stored = localStorage.getItem('transportMasterId');
    if (stored) {
      const decrypted = this.encryption.decrypt(stored);
      if (decrypted) {
        this.transportId = Number(decrypted);
        this.isEditMode = true;
        this.loadDetails(this.transportId);
      }
    }
  }
  getFieldError(field: string): string {
    const control = this.form.get(field);
    if (!control || !control.errors) return '';
    if (control.errors['required']) return `${this.getPrettyLabel(field)} is required`;
    if (control.errors['email']) return 'Invalid email format';
    if (control.errors['maxlength']) return `${this.getPrettyLabel(field)} is too long`;
    if (control.errors['pattern']) {
      if (field === 'mobile') return 'Enter a valid 10-digit mobile number';
      return 'Invalid format';
    }
    return 'Invalid value';
  }
  isFieldInvalid(field: string): boolean {
    const control = this.form.get(field);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }
  isFieldValid(field: string): boolean {
    const control = this.form.get(field);
    return !!(control && control.valid && (control.dirty || control.touched));
  }
  private getPrettyLabel(field: string): string {
    switch (field) {
      case 'name': return 'Name';
      case 'mobile': return 'Mobile';
      case 'gst': return 'GST';
      case 'remarks': return 'Remarks';
      default: return field;
    }
  }

  private initializeForm(): void {
    this.form = this.fb.group({
      name: [null, [Validators.required, Validators.maxLength(100)]],
      mobile: [null, [Validators.pattern('^\\d{10}$')]],
      gst: [null, [Validators.maxLength(15)]],
      remarks: [null, [Validators.maxLength(200)]],
      status: ['A']
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach(c => c.markAsTouched());
      return;
    }
    this.isLoading = true;
    const payload: TransportMaster = {
      id: this.transportId,
      ...this.form.value
    };
    const request$ = this.isEditMode ? this.service.update(payload) : this.service.create(payload);
    const sub = request$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response?.success === false) {
            this.snackbar.error(response?.message || 'Operation failed');
            this.isLoading = false;
            return;
          }
          this.snackbar.success(`Transport ${this.isEditMode ? 'updated' : 'created'} successfully`);
          localStorage.removeItem('transportMasterId');
          this.router.navigate(['/transport-master']);
        },
        error: (error) => {
          this.snackbar.error(error?.error?.message || `Failed to ${this.isEditMode ? 'update' : 'create'} transport`);
          this.isLoading = false;
        }
      });
    this.subscriptions.push(sub);
  }

  private loadDetails(id: number): void {
    this.isLoading = true;
    const sub = this.service.details(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const data = res?.data || res;
          if (data) {
            this.form.patchValue({
              name: data.name,
              mobile: data.mobile,
              gst: data.gst,
              remarks: data.remarks,
              status: data.status
            });
          }
          this.isLoading = false;
        },
        error: () => {
          this.snackbar.error('Failed to load transport details');
          this.isLoading = false;
        }
      });
    this.subscriptions.push(sub);
  }

  ngOnDestroy(): void {
    // Unsubscribe from all subscriptions
    this.subscriptions.forEach(sub => {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    });
    this.subscriptions = [];

    // Complete destroy subject
    this.destroy$.next();
    this.destroy$.complete();

    // Reset form to release form subscriptions
    if (this.form) {
      this.form.reset();
    }
  }
}


