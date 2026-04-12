import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { BatchService } from '../../services/batch.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { DateUtils } from '../../shared/utils/date-utils';
import { ConfirmModalComponent } from '../../shared/components/confirm-modal/confirm-modal.component';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-data-center',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LoaderComponent,
    ConfirmModalComponent
  ],
  templateUrl: './data-center.component.html',
  styleUrl: './data-center.component.scss'
})
export class DataCenterComponent implements OnInit, OnDestroy {
  batchDeleteForm!: FormGroup;
  isLoading = false;
  showTypeError = false;
  selectedTypes: string[] = [];
  showConfirmModal = false;
  
  readonly dataTypes = ['PURCHASE', 'SALE', 'QUOTATION', 'ATTENDANCE'];
  
  private destroy$ = new Subject<void>();
  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private batchService: BatchService,
    private snackbar: SnackbarService,
    private dateUtils: DateUtils
  ) {}

  ngOnInit(): void {
    this.initializeForm();
  }

  private initializeForm(): void {
    this.batchDeleteForm = this.fb.group({
      startDate: ['', Validators.required],
      endDate: ['', Validators.required]
    }, { validators: this.dateRangeValidator });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.batchDeleteForm.get(fieldName);
    return field ? field.invalid && (field.dirty || field.touched) : false;
  }

  onCheckboxChange(event: any): void {
    const value = event.target.value;
    if (event.target.checked) {
      this.selectedTypes.push(value);
    } else {
      this.selectedTypes = this.selectedTypes.filter(type => type !== value);
    }
    this.showTypeError = this.selectedTypes.length === 0;
  }

  dateRangeValidator(group: FormGroup): {[key: string]: any} | null {
    const start = group.get('startDate')?.value;
    const end = group.get('endDate')?.value;
    
    if (start && end && new Date(start) > new Date(end)) {
      return { dateRange: true };
    }
    return null;
  }

  resetForm(): void {
    this.batchDeleteForm.reset();
    this.selectedTypes = [];
    this.showTypeError = false;
  }

  onSubmit(): void {
    if (this.batchDeleteForm.valid && this.selectedTypes.length > 0) {
      this.isLoading = true;
      const formValue = this.batchDeleteForm.value;
      
      const request = {
        startDate: this.dateUtils.formatDateDDMMYYYY(formValue.startDate),
        endDate: this.dateUtils.formatDateDDMMYYYY(formValue.endDate),
        type: this.selectedTypes
      };

      const sub = this.batchService.batchDelete(request)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            this.snackbar.success('Data deleted successfully');
            this.resetForm();
            this.isLoading = false;
          },
          error: (error) => {
            this.snackbar.error(error.message || 'Failed to delete data');
            this.isLoading = false;
          }
        });
      this.subscriptions.push(sub);
    } else {
      this.showTypeError = this.selectedTypes.length === 0;
      this.batchDeleteForm.markAllAsTouched();
    }
  }

  onConfirmDelete(): void {
    if (this.batchDeleteForm.valid && this.selectedTypes.length > 0) {
        this.isLoading = true;
        const formValue = this.batchDeleteForm.value;

        const request = {
            startDate: this.dateUtils.formatDateDDMMYYYY(formValue.startDate),
            endDate: this.dateUtils.formatDateDDMMYYYY(formValue.endDate),
            type: this.selectedTypes
        };

        const sub = this.batchService.batchDelete(request)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
              next: (response) => {
                  this.snackbar.success('Data deleted successfully');
                  this.resetForm();
                  // console.log(this.selectedTypes);
                  this.ngOnInit();
                  this.isLoading = false;
              },
              error: (error) => {
                  this.snackbar.error(error.message || 'Failed to delete data');
                  this.isLoading = false;
              }
          });
        this.subscriptions.push(sub);
    }
    this.showConfirmModal = false;
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

    // Clear arrays
    this.selectedTypes = [];

    // Reset form to release form subscriptions
    if (this.batchDeleteForm) {
      this.batchDeleteForm.reset();
    }
  }

}
