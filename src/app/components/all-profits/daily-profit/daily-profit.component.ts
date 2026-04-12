import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { ProfitService } from '../../../services/profit.service';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

interface DailyProfit {
  date: string;
  totalExpenses: number;
  grossProfit: number;
  netProfit: number;
}

@Component({
  selector: 'app-daily-profit',
  templateUrl: './daily-profit.component.html',
  styleUrls: ['./daily-profit.component.scss'],
  imports: [CommonModule, ReactiveFormsModule, FormsModule, LoaderComponent],
  standalone: true
})
export class DailyProfitComponent implements OnInit, OnDestroy {
  profits: any;
  currentPage = 0;
  pageSize = 5;
  searchForm: FormGroup;
  pageSizeOptions = [1, 5, 10, 25, 50];
  totalElements = 0;
  startIndex = 0;
  endIndex = 0;
  isLoading = false;
  private destroy$ = new Subject<void>();

  constructor(
    private profitService: ProfitService,
    private fb: FormBuilder,
    private snackbar: SnackbarService
  ) {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    this.searchForm = this.fb.group({
      startDate: [this.formatDateForInput(firstDay)],
      endDate: [this.formatDateForInput(lastDay)]
    });
  }

  private formatDateForInput(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private formatDateForApi(dateStr: string, isStartDate: boolean): string {
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const time = isStartDate ? '00:00:00' : '23:59:59';

    return `${day}-${month}-${year} ${time}`;
  }

  ngOnInit(): void {
    this.loadProfits();
  }

  loadProfits(): void {
    this.isLoading = true;
    const formValues = this.searchForm.value;

    const params = {
      startDate: this.formatDateForApi(formValues.startDate, true),
      endDate: this.formatDateForApi(formValues.endDate, false)
    };

    this.profitService.getDailyProfits(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.profits = response.data;
            this.totalElements = response.data.totalElements;
            this.updatePaginationIndexes();
          } else {
            this.snackbar.error(response?.message || 'Failed to load profits');
          }
          this.isLoading = false;
        },
        error: (error) => {
          this.snackbar.error(error?.error?.message || 'Failed to load profits');
          this.isLoading = false;
        }
      });
  }

  onSearch(): void {
    this.loadProfits();
  }

  resetForm(): void {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    this.searchForm.patchValue({
      startDate: this.formatDateForInput(firstDay),
      endDate: this.formatDateForInput(lastDay)
    });

    this.loadProfits();
  }

  private updatePaginationIndexes(): void {
    this.startIndex = this.currentPage * this.pageSize;
    this.endIndex = Math.min(this.startIndex + this.pageSize, this.totalElements);
  }

  getTotalGrossProfit(): number {
    return this.profits?.content.reduce((sum: number, profit: any) => sum + profit.grossProfit, 0) || 0;
  }

  getTotalNetProfit(): number {
    return this.profits?.content.reduce((sum: number, profit: any) => sum + profit.netProfit, 0) || 0;
  }

  getPageNumbers(): number[] {
    const totalPages = this.profits?.totalPages || 0;
    const currentPage = this.currentPage + 1;
    const maxPages = 5;

    let startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
    let endPage = startPage + maxPages - 1;

    if (endPage > totalPages) {
      endPage = totalPages;
      startPage = Math.max(1, endPage - maxPages + 1);
    }

    const pages: number[] = [];
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  loadPage(page: number): void {
    if (page >= 0 && page < this.profits?.totalPages) {
      this.currentPage = page;
      this.loadProfits(); // Assuming you have this method to fetch profits
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
