import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AttendanceService } from '../../../services/attendance.service';
import { EmployeeService } from '../../../services/employee.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { DateUtils } from '../../../shared/utils/date-utils';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { CommonModule } from '@angular/common';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-create-attendance',
  templateUrl: './create-attendance.component.html',
  styleUrls: ['./create-attendance.component.scss'],
  providers: [DateUtils],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SearchableSelectComponent,
    LoaderComponent,
    RouterLink
  ] 

})
export class CreateAttendanceComponent implements OnInit, OnDestroy {
  attendanceForm!: FormGroup;
  employees: any[] = [];
  isLoading = false;
  isLoadingEmployees = false;

  private destroy$ = new Subject<void>();
  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private attendanceService: AttendanceService,
    private employeeService: EmployeeService,
    private router: Router,
    private snackbar: SnackbarService,
    private dateUtils: DateUtils
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.loadEmployees();
  }

  private initializeForm(): void {
    const today = new Date();
    const startDateTime = this.setDefaultTime(today, 15, 0);  // 3:00 PM IST
    const endDateTime = this.setDefaultTime(today, 23, 0);   // 11:00 PM IST
  
    this.attendanceForm = this.fb.group({
      employeeIds: ['', Validators.required],
      startDateTime: [startDateTime, Validators.required],
      endDateTime: [endDateTime, [Validators.required, this.validateEndDateTime.bind(this)]],
      remarks: ['']
    });

    // Subscribe to start date changes to update end date validation
    const startDateSub = this.attendanceForm.get('startDateTime')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.attendanceForm.get('endDateTime')?.updateValueAndValidity();
      });
    if (startDateSub) {
      this.subscriptions.push(startDateSub);
    }
  }

  
  private setDefaultTime(date: Date, hours: number, minutes: number): string {
    // Create date in local timezone
    const newDate = new Date(date);
    
    // Convert hours to IST (UTC+5:30)
    const istHours = hours - 5.5; // Adjust for IST offset
    
    // Set time in local timezone
    newDate.setHours(istHours, minutes, 0, 0);
    
    // Format date for input
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const day = String(newDate.getDate()).padStart(2, '0');
    const hour = String(newDate.getHours()).padStart(2, '0');
    const minute = String(newDate.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }

  private validateEndDateTime(control: AbstractControl): ValidationErrors | null {
    if (!control.value) return null;
    
    const startDateTime = this.attendanceForm?.get('startDateTime')?.value;
    if (!startDateTime) return null;

    const startDate = new Date(startDateTime);
    const endDate = new Date(control.value);

    // Check if dates are different
    if (startDate.toDateString() !== endDate.toDateString()) {
      return { sameDayRequired: true };
    }

    // Check if end time is before start time
    if (endDate < startDate) {
      return { endTimeBeforeStart: true };
    }

    return null;
  }

  loadEmployees(): void {
    this.isLoadingEmployees = true;
    const sub = this.employeeService.getAllEmployees()
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
    this.subscriptions.push(sub);
  }

  selectAllEmployees(): void {
    const allEmployeeIds = this.employees
      // .filter(emp => emp.status === 'A')
      .map(emp => emp.id);
    this.attendanceForm.patchValue({ employeeIds: allEmployeeIds });
  }

  clearEmployeeSelection(): void {
    this.attendanceForm.patchValue({ employeeIds: [] });
  }

  onSubmit(): void {
    if (this.attendanceForm.valid) {
      this.isLoading = true;
      const formData = { ...this.attendanceForm.value };
      
      // Format dates for API
      formData.startDateTime = this.dateUtils.formatDateTimeForApi(formData.startDateTime);
      formData.endDateTime = this.dateUtils.formatDateTimeForApi(formData.endDateTime);

      const sub = this.attendanceService.createAttendance(formData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            if (response.success) {
              this.snackbar.success('Attendance created successfully');
              // this.router.navigate(['/attendance']);
            }
            this.isLoading = false;
            this.attendanceForm.reset();
            this.initializeForm();
          },
          error: (error) => {
            this.snackbar.error(error?.error?.message || 'Failed to create attendance');
            this.isLoading = false;
          }
        });
      this.subscriptions.push(sub);
    }
  }

  refreshEmployees(): void {
    this.isLoadingEmployees = true;
    const sub = this.employeeService.refreshEmployees()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.employees = response.data;
            this.snackbar.success('Employees refreshed successfully');
          }
          this.isLoadingEmployees = false;
        },
        error: () => {
          this.snackbar.error('Failed to refresh employees');
          this.isLoadingEmployees = false;
        }
      });
    this.subscriptions.push(sub);
  }

  getMaxEndDateTime(): string {
    const startDateTime = this.attendanceForm.get('startDateTime')?.value;
    if (!startDateTime) return '';

    const startDate = new Date(startDateTime);
    const maxDate = new Date(startDate);
    maxDate.setHours(23, 59, 59);
    
    return this.dateUtils.formatDateTimeForInput(maxDate);
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.attendanceForm.get(fieldName);
    return field ? (field.invalid && (field.dirty || field.touched)) : false;
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
    this.employees = [];

    // Reset form to release form subscriptions
    if (this.attendanceForm) {
      this.attendanceForm.reset();
    }
  }
}
