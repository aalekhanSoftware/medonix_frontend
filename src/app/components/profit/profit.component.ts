import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { ProfitService } from '../../services/profit.service';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

interface ProfitResponse {
  success: boolean;
  message: string;
  data: {
    totalPages: number;
    content: Profit[];
    totalElements: number;
  };
}

interface Profit {
  id: number;
  productName: string;
  saleInvoice: string;
  saleAmount: number;
  purchaseAmount: number;
  otherExpenses: number;
  grossProfit: number;
  netProfit: number;
  profitDate: string;
  productId: number;
}

@Component({
  selector: 'app-profit',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    LoaderComponent,
    PaginationComponent
  ],
  templateUrl: './profit.component.html',
  styleUrls: ['./profit.component.scss']
})
export class ProfitComponent implements OnInit, OnDestroy {
  profits: any;
  currentPage = 0;
  pageSize = 10;
  searchTerm = '';
  searchForm: FormGroup;
  pageSizeOptions = [5, 10, 25, 50, 100];
  totalPages = 0;
  totalElements = 0;
  isLoading = false;
  startIndex = 0;
  endIndex = 0;
  private destroy$ = new Subject<void>();

  constructor(
    private profitService: ProfitService,
    private fb: FormBuilder
  ) {
    this.searchForm = this.fb.group({
      search: [''],
      startDate: [''],
      endDate: ['']
    });
  }

  ngOnInit(): void {
    this.loadProfits();
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

  onSearch() {
    this.isLoading = true;
    const formValues = this.searchForm.value;

    const params: any = {
      page: this.currentPage,
      size: this.pageSize,
    };

    if (formValues.search?.trim()) {
      params.search = formValues.search.trim();
    }

    if (formValues.startDate) {
      params.startDate = this.formatDateForApi(formValues.startDate, true);
    }

    if (formValues.endDate) {
      params.endDate = this.formatDateForApi(formValues.endDate, false);
    }

    this.profitService.searchProfits(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.profits = response.data;
          this.totalElements = response.data.totalElements;
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading profits:', error);
          this.isLoading = false;
        }
      });
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadProfits();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize = newSize;
    this.currentPage = 0;
    this.loadProfits();
  }

  loadProfits() {
    this.isLoading = true;
    const formValues = this.searchForm.value;

    const params: any = {
      page: this.currentPage,
      size: this.pageSize,
    };

    if (formValues.search?.trim()) {
      params.search = formValues.search.trim();
    }

    if (formValues.startDate) {
      params.startDate = this.formatDateForApi(formValues.startDate, true);
    }

    if (formValues.endDate) {
      params.endDate = this.formatDateForApi(formValues.endDate, false);
    }

    this.profitService.searchProfits(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.profits = response.data;
          this.totalPages = response.data.totalPages;
          this.totalElements = response.data.totalElements;
          this.startIndex = this.currentPage * this.pageSize;
          this.endIndex = Math.min(this.startIndex + this.pageSize, this.totalElements);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading profits:', error);
          this.isLoading = false;
        }
      });
  }

  resetForm(): void {
    this.searchForm.reset();
    this.currentPage = 0;
    this.loadProfits();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
