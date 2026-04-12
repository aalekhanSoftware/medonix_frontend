import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { EmployeeOrderService } from '../../../services/employee-order.service';
import { EmployeeService } from '../../../services/employee.service';
import { ProductService } from '../../../services/product.service';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { SnackbarService } from '../../../shared/services/snackbar.service';

@Component({
  selector: 'app-employee-order-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LoaderComponent,
    RouterLink,
    SearchableSelectComponent,
    FormsModule,
    RouterModule
  ],
  templateUrl: './employee-order-form.component.html',
  styleUrls: ['./employee-order-form.component.scss']
})
export class EmployeeOrderFormComponent implements OnInit, OnDestroy {
  employeeOrderForm!: FormGroup;
  isLoading = false;
  isEditMode = false;
  orderId?: number;
  products: any[] = [];
  employees: any[] = [];
  isLoadingProducts = false;
  isLoadingEmployees = false;
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private employeeOrderService: EmployeeOrderService,
    private employeeService: EmployeeService,
    private productService: ProductService,
    private router: Router,
    private route: ActivatedRoute,
    private snackbar: SnackbarService
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.orderId = Number(this.route.snapshot.paramMap.get('id'));
    if (this.orderId) {
      this.isEditMode = true;
      this.loadEmployeeOrder();
    }
    this.loadProducts();
    this.loadEmployees();
  }

  private initializeForm(): void {
    this.employeeOrderForm = this.fb.group({
      productId: ['', Validators.required],
      employeeIds: [[], Validators.required],
      quantity: ['', [Validators.required, Validators.min(1)]],
      remarks: [''],
      status: ['O', Validators.required]
    });
  }

  ngOnDestroy(): void {
    // Complete destroy subject to clean up all takeUntil subscriptions
    this.destroy$.next();
    this.destroy$.complete();

    // Clear arrays to release memory
    this.products = [];
    this.employees = [];

    // Reset form to release form subscriptions
    if (this.employeeOrderForm) {
      this.employeeOrderForm.reset();
    }
  }

  private loadEmployeeOrder(): void {
    if (!this.orderId) return;
    
    this.isLoading = true;
    this.employeeOrderService.getEmployeeOrderDetail(this.orderId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.employeeOrderForm.patchValue({
              productId: response.data.productId,
              employeeIds: response.data.employeeIds,
              quantity: response.data.quantity,
              remarks: response.data.remarks,
              status: response.data.status
            }, { emitEvent: false });
          }
          this.isLoading = false;
        },
        error: (error) => {
          this.snackbar.error(error?.error?.message || 'Failed to load employee order details');
          this.isLoading = false;
        }
      });
  }

  public loadProducts(): void {
    this.isLoadingProducts = true;
    this.productService.getProducts({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.products = response.data;
          }
          this.isLoadingProducts = false;
        },
        error: () => {
          this.snackbar.error('Failed to load products');
          this.isLoadingProducts = false;
        }
      });
  }

  refreshProducts(): void {
    this.isLoadingProducts = true;
    this.productService.refreshProducts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.products = response.data;
            this.snackbar.success('Products refreshed successfully');
          }
          this.isLoadingProducts = false;
        },
        error: (error) => {
          this.snackbar.error('Failed to refresh products');
          this.isLoadingProducts = false;
        }
      });
  }

  public loadEmployees(): void {
    this.isLoadingEmployees = true;
    this.employeeService.getAllEmployees()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.employees = response.data;
          }
          this.isLoadingEmployees = false;
        },
        error: () => {
          this.snackbar.error('Failed to load employees');
          this.isLoadingEmployees = false;
        }
      });
  }

  onSubmit(): void {
    if (this.employeeOrderForm.valid) {
      this.isLoading = true;
      const formData = { ...this.employeeOrderForm.value };

      const request = this.isEditMode
        ? this.employeeOrderService.updateEmployeeOrder({ ...formData, id: this.orderId })
        : this.employeeOrderService.createEmployeeOrder(formData);

      request
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (response.success) {
              this.snackbar.success(response.message);
              this.router.navigate(['/employee-order']);
            }
            this.isLoading = false;
          },
          error: (error) => {
            this.snackbar.error(error.message || `Failed to ${this.isEditMode ? 'update' : 'create'} employee order`);
            this.isLoading = false;
          }
        });
    } else {
      Object.keys(this.employeeOrderForm.controls).forEach(key => {
        const control = this.employeeOrderForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.employeeOrderForm.get(fieldName);
    return field ? field.invalid && field.touched : false;
  }

  getFieldError(fieldName: string): string {
    const control = this.employeeOrderForm.get(fieldName);
    if (control?.errors) {
      if (control.errors['required']) return 'This field is required';
      if (control.errors['min']) return 'Value must be greater than 0';
    }
    return '';
  }
} 