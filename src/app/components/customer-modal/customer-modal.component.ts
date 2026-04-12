import { Component, OnInit, Output, EventEmitter, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CustomerService } from '../../services/customer.service';
import { Customer } from '../../models/customer.model';
import { ToastrService } from 'ngx-toastr';
import { ModalService } from '../../services/modal.service';
import { map, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-customer-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './customer-modal.component.html',
  styleUrls: ['./customer-modal.component.scss']
})
export class CustomerModalComponent implements OnInit, OnDestroy {
  @Output() customerSaved = new EventEmitter<boolean>();

  customerForm!: FormGroup;
  loading = false;
  isSubmitted = false;
  display$ = this.modalService.modalState$.pipe(
    map(state => state.isOpen && state.modalType === 'customer')
  );
  currentCustomer: Customer | null = null;
  isEditing = false;
  private destroy$ = new Subject<void>();
  private modalStateSubscription?: any;

  constructor(
    private fb: FormBuilder,
    private customerService: CustomerService,
    private toastr: ToastrService,
    private modalService: ModalService
  ) {
    this.initForm();
  }

  ngOnInit() {
    // Store subscription reference for proper cleanup
    this.modalStateSubscription = this.modalService.modalState$.subscribe(state => {
      if (state.isOpen && state.modalType === 'customer') {
        if (state.data) {
          this.currentCustomer = state.data;
          this.isEditing = true;
          this.patchForm(state.data);
        } else {
          this.currentCustomer = null;
          this.isEditing = false;
          this.initForm();
        }
      }
    });
  }

  ngOnDestroy(): void {
    // Unsubscribe from modal state subscription
    if (this.modalStateSubscription) {
      this.modalStateSubscription.unsubscribe();
    }

    // Complete the destroy subject to unsubscribe all observables
    this.destroy$.next();
    this.destroy$.complete();

    // Clean up references
    this.currentCustomer = null;

    // Reset form to release form subscriptions
    if (this.customerForm) {
      this.customerForm.reset();
    }
  }

  private initForm() {
    const now = new Date();
    const localISOString = new Date(now.getTime() - (now.getTimezoneOffset() * 60000))
      .toISOString()
      .slice(0, 16);

    this.customerForm = this.fb.group({
      name: ['', [Validators.required]],
      mobile: [''],
      email: [''],
      gst: ['', [Validators.pattern('^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$')]],
      dlNumber: [''],
      address: [''],
      pincode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      coatingUnitPrice: [0, [Validators.required, Validators.min(0.00)]],
      remainingPaymentAmount: [0],
      nextActionDate: [localISOString],
      remarks: [''],
      status: ['A'],
      validityDays: [null]
    });
  }

  private patchForm(customer: Customer) {
    if (!customer) return;

    try {
      let nextActionDate = '';

      if (customer.nextActionDate) {
        try {
          const utcDate = new Date(customer.nextActionDate);
          const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
          nextActionDate = istDate.toISOString().slice(0, 16);
        } catch (error) {
          console.error('Error parsing date:', error);
        }
      }

      this.customerForm.patchValue({
        name: customer.name || '',
        mobile: customer.mobile || '',
        email: customer.email || '',
        gst: customer.gst || '',
        dlNumber: customer.dlNumber || '',
        address: customer.address || '',
        pincode: customer.pincode || '',
        coatingUnitPrice: customer.coatingUnitPrice || 0,
        remainingPaymentAmount: customer.remainingPaymentAmount || 0,
        nextActionDate: nextActionDate,
        remarks: customer.remarks || '',
        status: customer.status || 'A',
        validityDays: customer.validityDays || null
      });
    } catch (error) {
      console.error('Error in patchForm:', error);
      this.initForm();
    }
  }

  onSubmit() {
    this.isSubmitted = true;
    if (this.customerForm.valid) {
      this.loading = true;
      const formData = this.customerForm.value;

      if (formData.nextActionDate) {
        const date = new Date(formData.nextActionDate);
        formData.nextActionDate = date.toLocaleString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }).replace(/\//g, '-').replace(',', '');
      }

      // Handle validityDays: convert empty string to null
      if (formData.validityDays === '' || formData.validityDays === null || formData.validityDays === undefined) {
        formData.validityDays = null;
      } else {
        formData.validityDays = Number(formData.validityDays);
      }

      const request = this.isEditing && this.currentCustomer
        ? this.customerService.updateCustomer(this.currentCustomer.id, formData)
        : this.customerService.createCustomer(formData);

      request.pipe(takeUntil(this.destroy$)).subscribe({
        next: (response) => {
          if (response.success) {
            this.toastr.success(response.message ||
              `Customer ${this.isEditing ? 'updated' : 'created'} successfully`);
            this.customerSaved.emit(true);
            this.close();
          }
        },
        error: (error) => {
          this.toastr.error(error.message ||
            `Failed to ${this.isEditing ? 'update' : 'create'} customer`);
        },
        complete: () => {
          this.loading = false;
        }
      });
    }
  }

  clearNextActionDate(evt?: Event) {
    if (evt) {
      evt.preventDefault();
      evt.stopPropagation();
    }
    const ctrl = this.customerForm.get('nextActionDate');
    ctrl?.setValue(null, { emitEvent: true });
    ctrl?.markAsDirty();
    ctrl?.markAsTouched();
  }

  close() {
    this.modalService.close();
    this.customerForm.reset();
    this.isSubmitted = false;
    this.currentCustomer = null;
    this.isEditing = false;
  }

  getFieldError(fieldName: string): string {
    const control = this.customerForm.get(fieldName);
    if (control?.errors && (control.dirty || control.touched || this.isSubmitted)) {
      if (control.errors['required']) return `${fieldName} is required`;
      if (control.errors['email']) return 'Invalid email format';
      if (control.errors['pattern']) return 'Invalid format';
      if (control.errors['min']) return `${fieldName} must be greater than or equal to ${control.errors['min'].min}`;
    }
    return '';
  }
}