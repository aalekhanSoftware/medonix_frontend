import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Chart, ChartConfiguration, ChartData, registerables } from 'chart.js';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { CustomerService } from '../../services/customer.service';
import { AuthService } from '../../services/auth.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { TransactionLabelService } from '../../shared/services/transaction-label.service';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../shared/components/searchable-select/searchable-select.component';
import { IndianNumberPipe } from '../../shared/pipes/indian-number.pipe';
import { TransactionLabelPipe } from '../../shared/pipes/transaction-label.pipe';
import {
  TopCustomerTransactionChartService,
  TopCustomerChartSearchPayload,
  TopCustomerChartPoint,
  TopCustomerReportType
} from '../../services/top-customer-transaction-chart.service';

// TOP_CUSTOMER_CHART
const TOP_LIMIT = 10;
const MAX_LABEL_LENGTH = 16;

@Component({
  selector: 'app-top-customer-chart',
  templateUrl: './top-customer-chart.component.html',
  styleUrls: ['./top-customer-chart.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LoaderComponent,
    SearchableSelectComponent,
    IndianNumberPipe,
    TransactionLabelPipe
  ]
})
export class TopCustomerChartComponent implements OnInit, OnDestroy {
  @ViewChild('topCustomerChartCanvas', { static: false }) chartCanvas?: ElementRef<HTMLCanvasElement>;

  chartForm!: FormGroup;
  isLoading = false;
  isExporting = false;

  customers: any[] = [];
  canShowCustomerFilter = false;

  points: TopCustomerChartPoint[] = [];
  chartTotal = 0;
  hasSearched = false;

  private destroy$ = new Subject<void>();
  private chartInstance: Chart<'bar'> | null = null;

  private readonly reportColors: Record<TopCustomerReportType, { bar: string; border: string }> = {
    SALES: { bar: 'rgba(41, 182, 246, 0.6)', border: 'rgba(41, 182, 246, 1)' },
    SALE_RETURN: { bar: 'rgba(156, 39, 176, 0.55)', border: 'rgba(156, 39, 176, 1)' },
    PURCHASE: { bar: 'rgba(253, 120, 35, 0.55)', border: 'rgba(253, 120, 35, 1)' },
    PURCHASE_RETURN: { bar: 'rgba(229, 57, 53, 0.55)', border: 'rgba(229, 57, 53, 1)' }
  };

  constructor(
    private fb: FormBuilder,
    private customerService: CustomerService,
    private chartService: TopCustomerTransactionChartService,
    private snackbar: SnackbarService,
    private authService: AuthService,
    private txLabel: TransactionLabelService
  ) {
    Chart.register(...registerables);
  }

  ngOnInit(): void {
    this.initForm();
    this.canShowCustomerFilter = this.authService.isAdmin() || this.authService.isStaffAdmin();
    if (this.canShowCustomerFilter) {
      this.loadCustomers();
    }
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
      reportType: ['SALES' as TopCustomerReportType, Validators.required],
      startDate: [this.formatDateForInput(firstDayOfYear), Validators.required],
      endDate: [this.formatDateForInput(today), Validators.required],
      customerId: ['']
    });
  }

  private formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  onReportTypeChange(): void {
    this.hasSearched = false;
    this.points = [];
    this.chartTotal = 0;
    this.destroyChartInstance();
  }

  onSearch(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (this.isLoading) return;

    const payload = this.buildValidatedPayload();
    if (!payload) return;

    this.hasSearched = true;
    this.isLoading = true;
    this.points = [];
    this.chartTotal = 0;
    this.destroyChartInstance();

    this.chartService
      .searchTopCustomers({ ...payload, limit: TOP_LIMIT })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          const rawPoints = Array.isArray(response?.data) ? response.data : [];
          const points: TopCustomerChartPoint[] = rawPoints.map((p: any) => ({
            customerId: p?.customerId !== undefined && p?.customerId !== null ? Number(p.customerId) : undefined,
            customerName: String(p?.customerName ?? ''),
            mobile: p?.mobile != null ? String(p.mobile) : '',
            totalAmount: Number(p?.totalAmount) || 0,
            documentCount: Number(p?.documentCount) || 0
          }));
          this.points = points;
          this.chartTotal = points.reduce((sum, p) => sum + (Number(p?.totalAmount) || 0), 0);
          this.renderChart(points);
          this.isLoading = false;
        },
        error: (error: any) => {
          this.isLoading = false;
          this.points = [];
          this.chartTotal = 0;
          this.snackbar.error(error?.error?.message || 'Failed to load top customers data');
        }
      });
  }

  onExportExcel(): void {
    if (this.isExporting) return;

    const payload = this.buildValidatedPayload();
    if (!payload) return;

    this.isExporting = true;
    this.chartService
      .exportExcel(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ blob, filename }) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          this.isExporting = false;
          this.snackbar.success('Report downloaded successfully');
        },
        error: (error: any) => {
          this.isExporting = false;
          this.snackbar.error(error?.error?.message || 'Failed to export report');
        }
      });
  }

  resetForm(): void {
    const today = new Date();
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);

    this.chartForm.patchValue(
      {
        reportType: 'SALES' as TopCustomerReportType,
        startDate: this.formatDateForInput(firstDayOfYear),
        endDate: this.formatDateForInput(today),
        customerId: ''
      },
      { emitEvent: false }
    );

    this.hasSearched = false;
    this.points = [];
    this.chartTotal = 0;
    this.destroyChartInstance();
    this.chartForm.markAsUntouched();
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.chartInstance) {
      this.chartInstance.resize();
    }
  }

  private buildValidatedPayload(): TopCustomerChartSearchPayload | null {
    Object.keys(this.chartForm.controls).forEach(key => {
      this.chartForm.get(key)?.markAsTouched();
    });

    if (this.chartForm.invalid) {
      this.snackbar.error('Please fill all required fields');
      return null;
    }

    const values = this.chartForm.value;
    const startDate = values.startDate as string;
    const endDate = values.endDate as string;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      this.snackbar.error('Invalid date range');
      return null;
    }

    if (start > end) {
      this.snackbar.error('Start date cannot be after end date');
      return null;
    }

    const customerId = values.customerId as number | string | null | undefined;

    return {
      reportType: values.reportType as TopCustomerReportType,
      startDate,
      endDate,
      customerId:
        customerId !== undefined && customerId !== null && String(customerId).trim() !== ''
          ? Number(customerId)
          : null
    };
  }

  private destroyChartInstance(): void {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }

  private renderChart(points: TopCustomerChartPoint[]): void {
    if (!this.chartCanvas?.nativeElement) return;
    if (!points || points.length === 0) return;

    const canvas = this.chartCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    this.destroyChartInstance();

    const reportType = this.chartForm.get('reportType')?.value as TopCustomerReportType;
    const colors = this.reportColors[reportType] || this.reportColors.SALES;

    const labels = points.map(p => this.truncateLabel(p?.customerName));
    const values = points.map(p => Number(p?.totalAmount) || 0);

    const axisTextColor = this.getCssVar('--text-secondary', 'rgba(0,0,0,0.6)');
    const gridColor = this.getCssVar('--neutral-medium', 'rgba(0,0,0,0.08)');

    const chartData: ChartData<'bar'> = {
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
            display: false
          },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            padding: 12,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              title: () => '',
              label: (context) => {
                const dataIndex = context.dataIndex ?? 0;
                const point = points[dataIndex];
                const name = point?.customerName ? String(point.customerName) : '';
                const v = Number((context.parsed as any)?.y ?? context.raw ?? 0);
                const formattedAmount = v.toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                });
                const documents = Number(point?.documentCount) || 0;
                const docLabel = this.getDocumentLabel(reportType);
                return name
                  ? `${name} - ₹${formattedAmount} (${documents} ${docLabel})`
                  : `₹${formattedAmount}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: axisTextColor,
              autoSkip: false,
              maxRotation: 30,
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
      this.points = [];
      this.chartTotal = 0;
      this.snackbar.error('Failed to render chart');
    }
  }

  private getReportTypeLabel(reportType: TopCustomerReportType): string {
    if (reportType === 'SALE_RETURN') return this.txLabel.swap('Sale Return Report');
    if (reportType === 'PURCHASE') return this.txLabel.swap('Purchase Report');
    if (reportType === 'PURCHASE_RETURN') return this.txLabel.swap('Purchase Return Report');
    return this.txLabel.swap('Sales Report');
  }

  private getDocumentLabel(reportType: TopCustomerReportType): string {
    return reportType === 'SALE_RETURN' || reportType === 'PURCHASE_RETURN' ? 'returns' : 'invoices';
  }

  private truncateLabel(name: string | undefined | null): string {
    const value = (name ?? '').trim();
    if (value.length <= MAX_LABEL_LENGTH) return value;
    return `${value.slice(0, MAX_LABEL_LENGTH - 1)}…`;
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
