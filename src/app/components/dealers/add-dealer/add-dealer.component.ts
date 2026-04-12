import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DealersService, RegisterDealerRequest } from '../../../services/dealers.service';
import { ToastrService } from 'ngx-toastr';
import { Title } from '@angular/platform-browser';
import { Meta } from '@angular/platform-browser';
import { Subject, Subscription } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';

@Component({
  selector: 'app-add-dealer',
  templateUrl: './add-dealer.component.html',
  styleUrl: './add-dealer.component.scss'
})
export class AddDealerComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  isSubmitting = false;

  private destroy$ = new Subject<void>();
  private subscriptions: Subscription[] = [];

  constructor(
    private formBuilder: FormBuilder,
    @Inject(DealersService) private dealersService: DealersService,
    private toastr: ToastrService,
    private title: Title,
    private meta: Meta
  ) {}

  ngOnInit(): void {
    this.title.setTitle('Register Dealer ');
    this.meta.updateTag({ name: 'description', content: 'Register as a dealer to partner with Medonix. Quick, secure, and mobile-friendly registration with pending approval workflow.' });

    this.form = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      firstName: ['', [Validators.required, Validators.maxLength(50)]],
      lastName: ['', [Validators.required, Validators.maxLength(50)]],
      customerName: ['', [Validators.required, Validators.maxLength(120)]],
      gst: ['', [Validators.required, Validators.pattern(/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[0-9A-Z]{1}$/)]],
      dlNumber: ['', [Validators.maxLength(32)]],
      address: ['', [Validators.required, Validators.maxLength(250)]],
      pincode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      mobile: ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
      remarks: ['', [Validators.maxLength(250)]]
    });
  }

  get f() { return this.form.controls; }

  submit(): void {
    if (this.form.invalid || this.isSubmitting) {
      this.form.markAllAsTouched();
      return;
    }

    const payload: RegisterDealerRequest = this.form.value as RegisterDealerRequest;
    this.isSubmitting = true;

    const sub = this.dealersService.registerDealer(payload)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          // Always reset submitting state - runs on success, error, or unsubscribe
          this.isSubmitting = false;
        })
      )
      .subscribe({
        next: (response) => {
          if (response?.success) {
            this.toastr.success('Dealer registered successfully. Pending for approval.', 'Success');
            this.form.reset();
          } else {
            this.toastr.info(response?.message || 'Request submitted.');
          }
        },
        error: (err) => {
          const message = err?.error?.message || 'Failed to register dealer. Please try again.';
          this.toastr.error(message, 'Error');
          // Safety fallback - ensure button is re-enabled on error
          this.isSubmitting = false;
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
