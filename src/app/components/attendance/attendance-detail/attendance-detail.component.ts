import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { RouterLink } from '@angular/router';
import { EmployeeService } from '../../../services/employee.service';
import { AttendanceService } from '../../../services/attendance.service';
import { Router } from '@angular/router';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { FormsModule, ReactiveFormsModule, FormGroup, FormBuilder, Validators, FormControl } from '@angular/forms';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component';
import { merge, Subject, Subscription } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { CalendarViewComponent } from '../../../shared/components/calendar-view/calendar-view.component';

@Component({
  selector: 'app-attendance-detail',
  templateUrl: './attendance-detail.component.html',
  styleUrls: ['./attendance-detail.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    LoaderComponent,
    RouterLink,
    PaginationComponent,
    FormsModule,
    ReactiveFormsModule,
    ConfirmModalComponent,
    CalendarViewComponent
  ]
})
export class AttendanceDetailComponent implements OnInit, OnDestroy {
  employee: any;
  attendanceRecords: any[] = [];
  isLoading = false;
  pageSizeOptions = [2,5, 10, 25, 50, 100];
  
  // Pagination
  currentPage = 0;
  pageSize = 10;
  totalPages = 0;
  totalElements = 0;

  // Add these properties
  selectedAttendances: number[] = [];
  selectAll: boolean = false;
  showDeleteModal = false;
  dateFilterForm!: FormGroup;
  startDate = new FormControl('');
  endDate = new FormControl('');
  attendanceDates: string[] = [];
  totalRegularHours!:number
  totalRegularPay!:number
  totalOvertimeHours!:number
  totalOvertimePay!:number
  totalOfTotalPay!:number

  private destroy$ = new Subject<void>();
  private subscriptions: Subscription[] = [];

  constructor(
    private employeeService: EmployeeService,
    private attendanceService: AttendanceService,
    private router: Router,
    private snackbar: SnackbarService,
    private encryptionService: EncryptionService,
    private fb: FormBuilder
  ) {
    this.initializeDateFilter();
  }

  ngOnInit(): void {
    this.loadEmployeeDetails();
  }

  private loadEmployeeDetails(): void {
    const encryptedData = localStorage.getItem('selectedEmployee');
    if (!encryptedData) {
      this.router.navigate(['/attendance']);
      return;
    }

    try {
      this.employee = JSON.parse(this.encryptionService.decrypt(encryptedData));
      this.loadAttendanceRecords();
    } catch (error) {
      this.snackbar.error('Failed to load employee details');
      this.router.navigate(['/attendance']);
    }
  }

  private initializeDateFilter(): void {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    // Always set to first day of current month
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);

    // Format dates properly for input
    const formattedFirstDay = this.formatDateForInput(firstDay);
    const formattedLastDay = this.formatDateForInput(lastDay);

    this.startDate.setValue(formattedFirstDay);
    this.endDate.setValue(formattedLastDay);

    const dateSub = merge(this.startDate.valueChanges, this.endDate.valueChanges)
      .pipe(
        debounceTime(300),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        if (this.startDate.value && this.endDate.value) {
          this.currentPage = 0;
          this.loadAttendanceRecords();
        }
      });
    this.subscriptions.push(dateSub);
  }

  private formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatDateForApi(dateStr: string): string {
    const date = new Date(dateStr);
    return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
  }

  private loadAttendanceRecords(): void {
    this.isLoading = true;
    const params = {
      employeeId: this.employee.id,
      page: this.currentPage,
      size: this.pageSize,
      startDate: this.formatDateForApi(this.startDate.value || ''),
      endDate: this.formatDateForApi(this.endDate.value || '')
    };

    const sub = this.attendanceService.searchAttendance(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.attendanceRecords = response.data.content;
            this.calculateTotalPayAndHours();
            this.attendanceDates = this.attendanceRecords.map(record => 
              this.formatDateForApi(record.startDateTime)
            );
            this.totalPages = response.data.totalPages;
            this.totalElements = response.data.totalElements;
          }
          this.isLoading = false;
        },
        error: () => {
          this.snackbar.error('Failed to load attendance records');
          this.isLoading = false;
        }
      });
    this.subscriptions.push(sub);
  }

calculateTotal(fieldName:any[]){
  return fieldName.reduce((acuumulartor, field) =>{
    return acuumulartor + field;
  },0)
}

calculateTotalPayAndHours(){
  const regularHoursList = this.attendanceRecords.map(record => record.regularHours);
  const regularPayList = this.attendanceRecords.map(record => record.regularPay);
  const overtimeHoursList = this.attendanceRecords.map(record => record.overtimeHours);
  const overtimePayList = this.attendanceRecords.map(record => record.overtimePay);
  const totalPayList = this.attendanceRecords.map(record => record.totalPay);              

  this.totalRegularHours = this.calculateTotal(regularHoursList)
  this.totalRegularPay = this.calculateTotal(regularPayList)
  this.totalOvertimeHours = this.calculateTotal(overtimeHoursList)
  this.totalOvertimePay = this.calculateTotal(overtimePayList)
  this.totalOfTotalPay = this.calculateTotal(totalPayList)
}

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadAttendanceRecords();
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.currentPage = 0;
    this.loadAttendanceRecords();
  }

  // Add these methods
  toggleSelectAll(): void {
    this.selectAll = !this.selectAll;
    this.selectedAttendances = this.selectAll 
      ? this.attendanceRecords.map(record => record.id)
      : [];
  }

  toggleSelection(id: number): void {
    const index = this.selectedAttendances.indexOf(id);
    if (index === -1) {
      this.selectedAttendances.push(id);
    } else {
      this.selectedAttendances.splice(index, 1);
    }
    this.selectAll = this.selectedAttendances.length === this.attendanceRecords.length;
  }

  deleteSelected(): void {
    if (!this.selectedAttendances.length) {
      this.snackbar.error('Please select records to delete');
      return;
    }
    this.showDeleteModal = true;
  }

  onConfirmDelete(): void {
    this.isLoading = true;
    const sub = this.attendanceService.deleteAttendances(this.selectedAttendances)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.snackbar.success('Records deleted successfully');
            this.selectedAttendances = [];
            this.selectAll = false;
            this.loadAttendanceRecords();
          }
          this.showDeleteModal = false;
          this.isLoading = false;
        },
        error: (error) => {
          this.snackbar.error(error.message || 'Failed to delete records');
          this.showDeleteModal = false;
          this.isLoading = false;
        }
      });
    this.subscriptions.push(sub);
  }

  onCancelDelete(): void {
    this.showDeleteModal = false;
  }

  getCurrentMonth(): Date {
    return this.startDate.value ? new Date(this.startDate.value) : new Date();
  }

  downloadAttendance(): void {
    if (!this.startDate.value) {
      this.snackbar.error('Please select start date');
      return;
    }

    this.isLoading = true;
    const params = {
      employeeId: this.employee.id,
      startDate: this.formatDateForApi(this.startDate.value)
    };

    const sub = this.attendanceService.generatePdf(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const url = window.URL.createObjectURL(response.blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = response.filename;
          link.click();
          window.URL.revokeObjectURL(url);
          this.isLoading = false;
        },
        error: (error) => {
          this.snackbar.error('Failed to download attendance report');
          this.isLoading = false;
        }
      });
    this.subscriptions.push(sub);
  }

  printAttendance(): void {
    if (!this.startDate.value) {
      this.snackbar.error('Please select start date');
      return;
    }

    this.isLoading = true;
    const params = {
      employeeId: this.employee.id,
      startDate: this.formatDateForApi(this.startDate.value)
    };

    const sub = this.attendanceService.generatePdf(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const blob = response.blob;
          const url = window.URL.createObjectURL(blob);
          
          // Create an iframe for printing
          const printFrame = document.createElement('iframe');
          printFrame.style.display = 'none';
          printFrame.src = url;
          
          document.body.appendChild(printFrame);
          printFrame.onload = () => {
            setTimeout(() => {
              try {
                printFrame.contentWindow?.print();
                // Only set loading to false after print dialog is shown
                this.isLoading = false;
              } catch (error) {
                this.snackbar.error('Failed to open print dialog');
                this.isLoading = false;
              }
            }, 1000);

            // Cleanup after longer delay
            setTimeout(() => {
              if (document.body.contains(printFrame)) {
                document.body.removeChild(printFrame);
              }
              window.URL.revokeObjectURL(url);
            }, 5000);
          };
        },
        error: (error) => {
          this.snackbar.error('Failed to generate attendance report');
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

    // Clear arrays
    this.attendanceRecords = [];
    this.attendanceDates = [];
    this.selectedAttendances = [];

    // Reset form controls
    this.startDate.reset();
    this.endDate.reset();
  }
}
