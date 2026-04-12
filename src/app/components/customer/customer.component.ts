import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { CustomerService } from '../../services/customer.service';
import { Customer, CustomerSearchRequest } from '../../models/customer.model';
import { ToastrService } from 'ngx-toastr';
import { Router, RouterModule } from '@angular/router';
import { CustomerModalComponent } from '../customer-modal/customer-modal.component';
import { ModalService } from '../../services/modal.service';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-customer',
  templateUrl: './customer.component.html',
  styleUrls: ['./customer.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule, 
    CustomerModalComponent, PaginationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomerComponent implements OnInit, OnDestroy {
  customers: Customer[] = [];
  searchForm!: FormGroup;
  isLoading = false;
  displayModal = false;
  
  // Pagination properties
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50, 100];
  totalPages = 0;
  totalElements = 0;
  startIndex = 0;
  endIndex = 0;
  private destroy$ = new Subject<void>();
  private modalStateSubscription?: any;

  constructor(
    private customerService: CustomerService,
    private fb: FormBuilder,
    private toastr: ToastrService,
    public modalService: ModalService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.loadCustomers();
    
    // Store subscription reference for proper cleanup
    this.modalStateSubscription = this.modalService.modalState$.subscribe(state => {
      if (!state.isOpen) {
        // When modal closes, reload customers
        // this.loadCustomers();
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
    
    // Clear arrays to release memory
    this.customers = [];

    // Reset form to release form subscriptions
    if (this.searchForm) {
      this.searchForm.reset();
    }
  }

  private initializeForm(): void {
    this.searchForm = this.fb.group({
      search: [''],
      status: [''],
      startDate: [''],
      endDate: ['']
    });
  }

  private formatDateForApi(dateStr: string, isStartDate: boolean): string {
    if (!dateStr) return '';
    
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';

    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const time = isStartDate ? '00:00:00' : '23:59:59';

    return `${day}-${month}-${year} ${time}`;
  }

  loadCustomers(): void {
    this.isLoading = true;
    const formValues = this.searchForm.value;
    
    const params: CustomerSearchRequest = {
      currentPage: this.currentPage,
      perPageRecord: this.pageSize,
      search: formValues.search || ''
    };

    // Add dates if they are selected
    if (formValues.startDate) {
      params.startDate = this.formatDateForApi(formValues.startDate, true);
    }
    if (formValues.endDate) {
      params.endDate = this.formatDateForApi(formValues.endDate, false);
    }
    if (formValues.status) {
      params.status = formValues.status;
    }

    this.customerService.searchCustomers(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.customers = response.data.content;
            this.totalPages = response.data.totalPages;
            this.totalElements = response.data.totalElements;
          }
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.toastr.error('Failed to load customers');
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  onSearch(): void {
    this.currentPage = 0;
    this.loadCustomers();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadCustomers();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize = newSize;
    this.currentPage = 0;
    this.loadCustomers();
  }

  openDealerRegister() {
    this.router.navigate(['/dealers/register']);
  }
  // Update the openCustomerModal method
  openCustomerModal(customer?: Customer) {
    this.modalService.open('customer', customer);
    // Subscribe to modal state changes with proper cleanup
    this.modalService.modalState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        if (!state.isOpen) {
          // When modal closes, reload customers
          // this.loadCustomers();
          this.cdr.markForCheck();
        }
      });
  }

  resetForm(): void {
    this.searchForm.reset({ search: '', status: '', startDate: '', endDate: '' });
    this.currentPage = 0;
    this.loadCustomers();
  }
}