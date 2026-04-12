import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Chart, ChartConfiguration, ChartData, registerables } from 'chart.js';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { CustomerService } from '../../services/customer.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../shared/components/searchable-select/searchable-select.component';
import { MonthWiseTransactionChartService, MonthWiseTransactionChartSearchPayload, MonthWiseChartPoint } from '../../services/month-wise-transaction-chart.service';

type ReportType = 'SALES' | 'PURCHASE' | 'PAYMENT_DONE';

@Component({
  selector: 'app-transaction-chart',
  templateUrl: './chart.component.html',
  styleUrls: ['./chart.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LoaderComponent,
    SearchableSelectComponent
  ]
})
export class ChartComponent implements OnInit, OnDestroy {
  @ViewChild('chartCanvas', { static: false }) chartCanvas?: ElementRef<HTMLCanvasElement>;

  chartForm!: FormGroup;
  isLoading = false;

  customers: any[] = [];
  chartPoints: MonthWiseChartPoint[] = [];
  chartTotal = 0;
  totalReceivedCount = 0;
  totalPaidCount = 0;

  hasSearched = false;

  private destroy$ = new Subject<void>();
  private chartInstance: Chart<'bar'> | null = null;

  private readonly reportColors: Record<ReportType, { bar: string; border: string }> = {
    SALES: { bar: 'rgba(41, 182, 246, 0.6)', border: 'rgba(41, 182, 246, 1)' },
    PURCHASE: { bar: 'rgba(253, 120, 35, 0.55)', border: 'rgba(253, 120, 35, 1)' },
    PAYMENT_DONE: { bar: 'rgba(76, 175, 80, 0.55)', border: 'rgba(76, 175, 80, 1)' }
  };
  private readonly paymentDoneColors = {
    received: { bar: 'rgba(33, 150, 243, 0.55)', border: 'rgba(33, 150, 243, 1)' },
    paid: { bar: 'rgba(255, 152, 0, 0.55)', border: 'rgba(255, 152, 0, 1)' }
  };

  constructor(
    private fb: FormBuilder,
    private customerService: CustomerService,
    private chartService: MonthWiseTransactionChartService,
    private snackbar: SnackbarService
  ) {
    Chart.register(...registerables);
  }

  ngOnInit(): void {
    this.initForm();
    this.loadCustomers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.destroyChartInstance();
  }

  private initForm(): void {
    const today = new Date();
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);

    this.chartForm = this.fb.group({
      reportType: ['SALES' as ReportType, Validators.required],
      startDate: [this.formatDateForInput(firstDayOfYear), Validators.required],
      endDate: [this.formatDateForInput(today), Validators.required],
      customerId: ['']
    });
  }

  private formatDateForInput(date: Date): string {
    // yyyy-MM-dd (browser date input format)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  onReportTypeChange(): void {
    this.hasSearched = false;
    this.chartPoints = [];
    this.chartTotal = 0;
    this.totalReceivedCount = 0;
    this.totalPaidCount = 0;
    this.destroyChartInstance();
  }

  onSearch(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (this.isLoading) return;

    Object.keys(this.chartForm.controls).forEach(key => {
      this.chartForm.get(key)?.markAsTouched();
    });

    if (this.chartForm.invalid) {
      this.snackbar.error('Please fill all required fields');
      return;
    }

    const values = this.chartForm.value;
    const reportType: ReportType = values.reportType;
    const startDate = values.startDate as string;
    const endDate = values.endDate as string;
    const customerId = values.customerId as number | string | null | undefined;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      this.snackbar.error('Invalid date range');
      return;
    }

    if (start > end) {
      this.snackbar.error('Start date cannot be after end date');
      return;
    }

    const payload: MonthWiseTransactionChartSearchPayload = {
      startDate,
      endDate,
      customerId: customerId !== undefined && customerId !== null && String(customerId).trim() !== '' ? Number(customerId) : null
    };

    this.hasSearched = true;
    this.isLoading = true;
    this.chartPoints = [];
    this.chartTotal = 0;
    this.totalReceivedCount = 0;
    this.totalPaidCount = 0;
    this.destroyChartInstance();

    const request$ =
      reportType === 'SALES'
        ? this.chartService.searchSalesMonthWise(payload)
        : reportType === 'PURCHASE'
          ? this.chartService.searchPurchaseMonthWise(payload)
          : this.chartService.searchPaymentDoneMonthWise(payload);

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        const rawPoints = Array.isArray(response?.data) ? response.data : [];
        const points: MonthWiseChartPoint[] = rawPoints.map((p: any) => ({
          month: String(p?.month ?? ''),
          value: Number(p?.value) || 0,
          receivedCount: Number(p?.receivedCount) || 0,
          paidCount: Number(p?.paidCount) || 0
        }));
        this.chartPoints = points;
        if (reportType === 'PAYMENT_DONE') {
          this.totalReceivedCount = points.reduce((sum, p) => sum + (Number(p?.receivedCount) || 0), 0);
          this.totalPaidCount = points.reduce((sum, p) => sum + (Number(p?.paidCount) || 0), 0);
          this.chartTotal = this.totalReceivedCount + this.totalPaidCount;
        } else {
          this.chartTotal = points.reduce((sum, p) => sum + (Number(p?.value) || 0), 0);
        }

        this.renderChart(reportType, points);
        this.isLoading = false;
      },
      error: (error: any) => {
        this.isLoading = false;
        this.chartPoints = [];
        this.chartTotal = 0;
        this.totalReceivedCount = 0;
        this.totalPaidCount = 0;
        this.snackbar.error(error?.error?.message || 'Failed to load chart data');
      }
    });
  }

  resetForm(): void {
    const today = new Date();
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);

    this.chartForm.patchValue(
      {
        reportType: 'SALES' as ReportType,
        startDate: this.formatDateForInput(firstDayOfYear),
        endDate: this.formatDateForInput(today),
        customerId: ''
      },
      { emitEvent: false }
    );

    this.hasSearched = false;
    this.chartPoints = [];
    this.chartTotal = 0;
    this.totalReceivedCount = 0;
    this.totalPaidCount = 0;
    this.destroyChartInstance();
    this.chartForm.markAsUntouched();
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.chartInstance) {
      this.chartInstance.resize();
    }
  }

  private destroyChartInstance(): void {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }

  private renderChart(reportType: ReportType, points: MonthWiseChartPoint[]): void {
    if (!this.chartCanvas?.nativeElement) return;
    if (!points || points.length === 0) return;

    const canvas = this.chartCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    this.destroyChartInstance();

    const labels = points.map(p => this.formatMonthLabel(String(p?.month ?? '')));
    const values = points.map(p => Number(p?.value) || 0);
    const colors = this.reportColors[reportType];
    const receivedCounts = points.map(p => Number(p?.receivedCount) || 0);
    const paidCounts = points.map(p => Number(p?.paidCount) || 0);
    const isPaymentDone = reportType === 'PAYMENT_DONE';

    const axisTextColor = this.getCssVar('--text-secondary', 'rgba(0,0,0,0.6)');
    const gridColor = this.getCssVar('--neutral-medium', 'rgba(0,0,0,0.08)');

    const chartData: ChartData<'bar'> = isPaymentDone
      ? {
          labels,
          datasets: [
            {
              label: 'Received',
              data: receivedCounts,
              backgroundColor: this.paymentDoneColors.received.bar,
              borderColor: this.paymentDoneColors.received.border,
              borderWidth: 1,
              borderRadius: 6,
              hoverBackgroundColor: this.paymentDoneColors.received.border,
              hoverBorderColor: this.paymentDoneColors.received.border
            },
            {
              label: 'Paid',
              data: paidCounts,
              backgroundColor: this.paymentDoneColors.paid.bar,
              borderColor: this.paymentDoneColors.paid.border,
              borderWidth: 1,
              borderRadius: 6,
              hoverBackgroundColor: this.paymentDoneColors.paid.border,
              hoverBorderColor: this.paymentDoneColors.paid.border
            }
          ]
        }
      : {
          labels,
          datasets: [
            {
              label: this.getReportTypeLabel(reportType),
              data: values,
              backgroundColor: colors.bar,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 6,
              hoverBackgroundColor: colors.border,
              hoverBorderColor: colors.border
            }
          ]
        };

    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 450,
          easing: 'easeOutQuart'
        },
        interaction: {
          mode: 'nearest',
          intersect: true
        },
        plugins: {
          legend: {
            display: isPaymentDone
          },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            padding: 12,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              // Avoid any title/header rendering differences; always show month in body.
              title: () => '',
              label: (context) => {
                const dataIndex = context.dataIndex ?? 0;
                const monthLabel =
                  (labels?.[dataIndex] ? String(labels[dataIndex]) : (context.label ? String(context.label) : '')) || '';

                const v = Number((context.parsed as any)?.y ?? context.raw ?? 0);
                if (isPaymentDone) {
                  const dsLabel = context.dataset?.label ? String(context.dataset.label) : 'Count';
                  const formattedCount = v.toLocaleString('en-IN');
                  return monthLabel ? `${monthLabel} - ${dsLabel}: ${formattedCount}` : `${dsLabel}: ${formattedCount}`;
                }

                const formattedAmount = v.toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                });
                return monthLabel ? `${monthLabel} : ₹${formattedAmount}` : `Amount: ₹${formattedAmount}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: axisTextColor,
              autoSkip: true,
              maxRotation: 0,
              minRotation: 0
            }
          },
          y: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: {
              color: axisTextColor,
              callback: (value) => {
                const v = Number(value);
                if (isPaymentDone) {
                  return v.toLocaleString('en-IN');
                }
                return `₹${v.toLocaleString('en-IN')}`;
              }
            }
          }
        }
      }
    };

    try {
      this.chartInstance = new Chart(ctx, config);
    } catch (error) {
      // Keep UI usable even if chart fails; show empty state.
      this.chartPoints = [];
      this.chartTotal = 0;
      this.snackbar.error('Failed to render chart');
    }
  }

  private getReportTypeLabel(reportType: ReportType): string {
    if (reportType === 'SALES') return 'Sales Report';
    if (reportType === 'PURCHASE') return 'Purchase Report';
    return 'Payment Done Report';
  }

  private formatMonthLabel(month: string): string {
    // yyyy-MM -> Mon yyyy
    if (!month) return '';
    const parts = month.split('-');
    if (parts.length !== 2) return month;
    const year = parts[0];
    const monthNumber = Number(parts[1]);
    if (!year || Number.isNaN(monthNumber) || monthNumber < 1 || monthNumber > 12) return month;

    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${names[monthNumber - 1]} ${year}`;
  }

  private getCssVar(name: string, fallback: string): string {
    if (typeof window === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  private loadCustomers(): void {
    this.customerService
      .getCustomers({ status: 'A' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          if (response?.success && Array.isArray(response?.data)) {
            this.customers = response.data;
            return;
          }
          if (Array.isArray(response?.data)) {
            this.customers = response.data;
            return;
          }
          if (Array.isArray(response)) {
            this.customers = response;
          } else {
            this.customers = [];
          }
        },
        error: () => {
          this.customers = [];
          this.snackbar.error('Failed to load customers');
        }
      });
  }
}

