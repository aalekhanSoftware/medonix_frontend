import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import { PaymentHistoryService } from '../../../services/payment-history.service';
import { CustomerService } from '../../../services/customer.service';
import { PaymentHistoryDetailsResponse, PaymentHistoryUpsertRequest } from '../../../models/payment-history.model';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { SearchableSelectComponent } from "../../../shared/components/searchable-select/searchable-select.component";
import { EncryptionService } from '../../../shared/services/encryption.service';

@Component({
  selector: 'app-add-payment-history',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, LoaderComponent, SearchableSelectComponent],
  templateUrl: './add-payment-history.component.html',
  styleUrls: ['./add-payment-history.component.scss']
})
export class AddPaymentHistoryComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  isEdit = false;
  loading = false;
  isLoadingCustomers = false;
  submitted = false;
  currentId: number | null = null;
  private destroy$ = new Subject<void>();
  
  customers: any[] = [];
  
  typeOptions = [
    { label: 'Cash', value: 'C' },
    { label: 'Bank', value: 'B' }
  ];

  constructor(
    private fb: FormBuilder,
    private paymentHistoryService: PaymentHistoryService,
    private customerService: CustomerService,
    private snackbar: SnackbarService,
    private router: Router,
    private route: ActivatedRoute,
    private encryptionService: EncryptionService
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadCustomers();
    this.setupCustomerSync();
    
    // Check for encrypted ID in route params (for edit mode)
    const encryptedIdParam = this.route.snapshot.paramMap.get('encryptedId');
    if (encryptedIdParam) {
      const decryptedId = this.encryptionService.decrypt(encryptedIdParam);
      if (decryptedId) {
        this.isEdit = true;
        this.currentId = Number(decryptedId);
        this.fetchPaymentHistoryDetails(this.currentId);
        return;
      } else {
        this.snackbar.error('Invalid payment history ID. Redirecting to payment history list.');
        this.router.navigate(['/payment-history']);
        return;
      }
    }
    
    // For create mode: Reset form to default values
    this.isEdit = false;
    this.currentId = null;
    this.resetFormToDefaults();
  }

  private initForm(): void {
    const today = new Date();
    // Format date as YYYY-MM-DD for the date picker
    const formattedDate = today.toISOString().split('T')[0];
    
    this.form = this.fb.group({
      id: new FormControl<number | null>(null),
      amount: new FormControl<number>(0, { nonNullable: true, validators: [Validators.required, Validators.min(0.01)] }),
      customerId: new FormControl<number | null>(null, { nonNullable: true, validators: [Validators.required] }),
      customerName: new FormControl<string>({ value: '', disabled: true }), // Will be populated automatically
      type: new FormControl<'C' | 'B'>('C', { nonNullable: true, validators: [Validators.required] }),
      remarks: new FormControl<string>('', { nonNullable: true, validators: [] }),
      isReceived: new FormControl<boolean>(true, { nonNullable: true, validators: [] }),
      date: new FormControl<string>(formattedDate, { nonNullable: true, validators: [Validators.required] })
    });
  }

  private setupCustomerSync(): void {
    this.form.get('customerId')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(customerId => {
        if (customerId) {
          const selectedCustomer = this.customers.find(c => c.id === customerId);
          if (selectedCustomer) {
            this.form.patchValue({ customerName: selectedCustomer.name });
          }
        } else {
          this.form.patchValue({ customerName: '' });
        }
      });
  }

  resetFormToDefaults(): void {
    const today = new Date();
    // Format date as YYYY-MM-DD for the date picker
    const formattedDate = today.toISOString().split('T')[0];
    
    // Reset form to default values
    this.form.patchValue({
      id: null,
      amount: 0,
      customerId: null,
      customerName: '',
      type: 'C',
      remarks: '',
      isReceived: true,
      date: formattedDate
    });

    // Reset form state
    this.form.markAsUntouched();
    this.form.markAsPristine();
    this.submitted = false;
  }

  private fetchPaymentHistoryDetails(id: number | null): void {
    if (!id) {
      this.snackbar.error('Payment history ID is required');
      return;
    }

    this.loading = true;
    this.paymentHistoryService.getPaymentHistoryDetails(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: PaymentHistoryDetailsResponse) => {
        const d = res.data;
        // Convert DD-MM-YYYY from API to YYYY-MM-DD for the date picker
        const [day, month, year] = d.date.split('-');
        const formattedDate = `${year}-${month}-${day}`;
        
        this.form.patchValue({
          id: d.id,
          amount: d.amount,
          customerId: d.customerId,
          customerName: d.customerName,
          type: d.type,
          remarks: d.remarks,
          isReceived: d.isReceived,
          date: formattedDate
        });
      },
      error: () => {
        this.snackbar.error('Failed to load payment history details');
      },
      complete: () => { this.loading = false; }
    });
  }

  private loadCustomers(): void {
    this.isLoadingCustomers = true;
    this.customerService.getCustomers({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.customers = response.data;
          }
          this.isLoadingCustomers = false;
        },
        error: (error) => {
          this.snackbar.error('Failed to load customers');
          this.isLoadingCustomers = false;
        }
      });
  }

  refreshCustomers(): void {
    this.isLoadingCustomers = true;
    this.customerService.refreshCustomers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.customers = response.data;
            this.snackbar.success('Customers refreshed successfully');
          }
          this.isLoadingCustomers = false;
        },
        error: (error) => {
          this.snackbar.error('Failed to refresh customers');
          this.isLoadingCustomers = false;
        }
      });
  }

  // Convert date from YYYY-MM-DD (date picker) to DD-MM-YYYY (API format)
  private convertDateFormat(dateString: string): string {
    const [year, month, day] = dateString.split('-');
    return `${day}-${month}-${year}`;
  }

  submit(): void {
    this.submitted = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackbar.error('Please fill all required fields correctly');
      return;
    }

    const rawValue = this.form.getRawValue();
    const payload: PaymentHistoryUpsertRequest = {
      id: this.isEdit ? (this.currentId as number) : undefined,
      amount: rawValue.amount,
      customerId: rawValue.customerId!,
      customerName: rawValue.customerName,
      type: rawValue.type,
      remarks: rawValue.remarks,
      isReceived: rawValue.isReceived,
      // Convert date format from YYYY-MM-DD to DD-MM-YYYY
      date: this.convertDateFormat(rawValue.date)
    };

    this.loading = true;
    const serviceCall = this.isEdit 
      ? this.paymentHistoryService.updatePaymentHistory(payload)
      : this.paymentHistoryService.createPaymentHistory(payload);

    serviceCall.pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        this.snackbar.success(this.isEdit ? 'Payment history updated successfully' : 'Payment history created successfully');
        this.router.navigate(['/payment-history']);
      },
      error: (error: any) => {
        this.snackbar.error('Failed to save payment history');
      },
      complete: () => { this.loading = false; }
    });
  }

  ngOnDestroy(): void {
    // Complete destroy subject to clean up all takeUntil subscriptions
    this.destroy$.next();
    this.destroy$.complete();

    // Clear arrays to release memory
    this.customers = [];

    // Reset form to release form subscriptions
    if (this.form) {
      this.form.reset();
    }
  }
}