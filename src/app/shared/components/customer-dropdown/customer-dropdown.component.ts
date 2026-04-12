import { Component, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { SearchableSelectComponent } from '../searchable-select/searchable-select.component';
import { CustomerService } from '../../../services/customer.service';
import { SnackbarService } from '../../services/snackbar.service';

@Component({
  selector: 'app-customer-dropdown',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SearchableSelectComponent, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomerDropdownComponent),
      multi: true
    }
  ],
  template: `
    <div class="customer-select-group">
      <app-searchable-select
        [formControl]="control"
        [options]="customers"
        labelKey="name"
        valueKey="id"
        [placeholder]="placeholder"
        [defaultOption]="defaultOption"
        [searchPlaceholder]="searchPlaceholder"
        [class.is-invalid]="isInvalid"
      ></app-searchable-select>
      <button 
        type="button" 
        class="btn-icon refresh" 
        (click)="refreshCustomers()" 
        [disabled]="isLoading"
        [title]="'Refresh Customers'"
      >
        <i class="fas" [ngClass]="isLoading ? 'fa-spinner fa-spin' : 'fa-sync-alt'"></i>
      </button>
    </div>
  `,
  styleUrls: ['./customer-dropdown.component.scss']
})
export class CustomerDropdownComponent implements ControlValueAccessor {
  @Input() placeholder = 'Select Customer';
  @Input() searchPlaceholder = 'Search customers...';
  @Input() isInvalid = false;
  @Output() customersLoaded = new EventEmitter<any[]>();

  customers: any[] = [];
  isLoading = false;
  defaultOption = { label: 'Select Customer', value: '' };
  
  private onChange: any = () => {};
  private onTouched: any = () => {};

  constructor(
    private customerService: CustomerService,
    private snackbar: SnackbarService
  ) {
    this.loadCustomers();
  }

  loadCustomers(): void {
    this.isLoading = true;
    this.customerService.getCustomers({ status: 'A' }).subscribe({
      next: (response) => {
        if (response.success) {
          this.customers = response.data;
          this.customersLoaded.emit(this.customers);
        }
        this.isLoading = false;
      },
      error: () => {
        this.snackbar.error('Failed to load customers');
        this.isLoading = false;
      }
    });
  }

  refreshCustomers(): void {
    this.isLoading = true;
    this.customerService.refreshCustomers().subscribe({
      next: (response) => {
        if (response.success) {
          this.customers = response.data;
          this.customersLoaded.emit(this.customers);
          this.snackbar.success('Customers refreshed successfully');
        }
        this.isLoading = false;
      },
      error: () => {
        this.snackbar.error('Failed to refresh customers');
        this.isLoading = false;
      }
    });
  }

  writeValue(value: any): void {
    if (value !== undefined) {
      this.onChange(value);
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    // Handle disabled state
  }
} 