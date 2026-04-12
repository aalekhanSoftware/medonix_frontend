import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Chart, ChartConfiguration, ChartData, registerables } from 'chart.js';
import { QuotationService } from '../../services/quotation.service';
import { CustomerService } from '../../services/customer.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../shared/components/searchable-select/searchable-select.component';
import { DateUtils } from '../../shared/utils/date-utils';
import { QuotationStatus } from '../../models/quotation.model';
import { Subscription } from 'rxjs';

interface ChartStatusData {
  status: string;
  statusLabel: string;
  count: number;
  totalAmount: number;
  percentage: number;
}

interface ChartResponse {
  success: boolean;
  message: string;
  data: ChartStatusData[];
}

@Component({
  selector: 'app-chart',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    LoaderComponent,
    SearchableSelectComponent
  ],
  templateUrl: './chart.component.html',
  styleUrl: './chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChartComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('chartCanvas', { static: false }) chartCanvas!: ElementRef<HTMLCanvasElement>;
  
  chartForm!: FormGroup;
  chartInstance: Chart<'pie'> | null = null;
  isLoading = false;
  isLoadingCustomers = false;
  customers: any[] = [];
  chartData: ChartStatusData[] = [];
  quotationStatusOptions: any[] = [];
  
  private dataLoaded = false;
  private viewInitialized = false;
  private subscriptions = new Subscription();

  // Color palette for chart - professional colors
  private readonly colorPalette = [
    'rgba(41, 182, 246, 0.8)',   // Primary blue
    'rgba(253, 120, 35, 0.8)',   // Primary orange
    'rgba(28, 63, 96, 0.8)',     // Secondary dark
    'rgba(76, 175, 80, 0.8)',    // Green
    'rgba(244, 67, 54, 0.8)',    // Red
    'rgba(156, 39, 176, 0.8)',   // Purple
    'rgba(255, 193, 7, 0.8)',    // Amber
    'rgba(0, 188, 212, 0.8)',    // Cyan
    'rgba(103, 58, 183, 0.8)',   // Deep Purple
    'rgba(233, 30, 99, 0.8)',    // Pink
  ];

  constructor(
    private fb: FormBuilder,
    private quotationService: QuotationService,
    private customerService: CustomerService,
    private snackbar: SnackbarService,
    private dateUtils: DateUtils,
    private cdr: ChangeDetectorRef
  ) {
    Chart.register(...registerables);
    
    this.quotationStatusOptions = Object.entries(QuotationStatus).map(([key, value]) => ({ label: value, value: key }));
  }

  ngOnInit(): void {
    this.initializeForm();
    this.loadCustomers();
    this.loadChartData();
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    // If data is already loaded, render the chart
    if (this.dataLoaded && this.chartData.length > 0) {
      setTimeout(() => this.initializeChart(), 100);
    }
  }

  ngOnDestroy(): void {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
    
    // Clean up subscriptions to prevent memory leaks
    this.subscriptions.unsubscribe();
    
    // Clear data
    this.chartData = [];
    this.customers = [];
    this.quotationStatusOptions = [];
  }

  private initializeForm(): void {
    const { startDate, endDate } = this.getCurrentMonthDates();
    
    this.chartForm = this.fb.group({
      startDate: [startDate],
      endDate: [endDate],
      customerId: [''],
      quotationStatuses: [[]]
    });

    // Note: Form value changes are NOT tracked to prevent UI freezing
    // Users must click the Search button to update the chart
    // This prevents performance issues with dropdown interactions
  }

  private getCurrentMonthDates(): { startDate: string; endDate: string } {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    
    return {
      startDate: this.formatDateForInput(startDate),
      endDate: this.formatDateForInput(endDate)
    };
  }

  private formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatDateForApi(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  loadChartData(): void {
    this.isLoading = true;
    this.dataLoaded = false;
    this.cdr.markForCheck();
    
    const formValue = this.chartForm.value;
    const params = {
      startDate: this.formatDateForApi(formValue.startDate),
      endDate: this.formatDateForApi(formValue.endDate),
      customerId: formValue.customerId || null,
      statuses: Array.isArray(formValue.quotationStatuses) ? formValue.quotationStatuses : []
    };

    this.quotationService.getStatusChartData(params).subscribe({
      next: (response: ChartResponse) => {
        if (response.success && response.data) {
          this.chartData = response.data;
          this.dataLoaded = true;
          
          // Initialize chart only if view is ready
          if (this.viewInitialized) {
            // Use setTimeout to ensure DOM is fully rendered
            setTimeout(() => {
              this.initializeChart();
              this.cdr.detectChanges();
            }, 100);
          }
        } else {
          this.snackbar.error(response.message || 'Failed to load chart data');
          this.chartData = [];
          this.dataLoaded = false;
        }
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Chart data loading error:', error);
        this.snackbar.error(error?.error?.message || 'Failed to load chart data');
        this.chartData = [];
        this.dataLoaded = false;
        this.isLoading = false;
        
        if (this.chartInstance) {
          this.chartInstance.destroy();
          this.chartInstance = null;
        }
        this.cdr.markForCheck();
      }
    });
  }

  private initializeChart(): void {
    // Validate prerequisites
    if (!this.chartCanvas?.nativeElement || this.chartData.length === 0) {
      console.warn('Chart initialization skipped: canvas or data not available');
      return;
    }

    // Destroy existing chart instance
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) {
      console.error('Failed to get canvas context');
      return;
    }

    // Prepare chart data
    const labels = this.chartData.map(item => item.statusLabel);
    const data = this.chartData.map(item => item.count);
    const backgroundColors = this.chartData.map((_, index) => 
      this.colorPalette[index % this.colorPalette.length]
    );
    const borderColors = backgroundColors.map(color => color.replace('0.8', '1'));

    const chartData: ChartData<'pie'> = {
      labels: labels,
      datasets: [{
        label: 'Quotation Status',
        data: data,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 2,
        hoverOffset: 10,
        hoverBorderWidth: 3
      }]
    };

    const config: ChartConfiguration<'pie'> = {
      type: 'pie',
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false, // Custom legend in HTML for better styling
          },
          tooltip: {
            enabled: true,
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                const item = this.chartData[context.dataIndex];
                const percentage = item?.percentage || 0;
                const totalAmount = item?.totalAmount || 0;
                return [
                  `${label}: ${value} (${percentage.toFixed(2)}%)`,
                  `Amount: ₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                ];
              }
            },
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            padding: 14,
            cornerRadius: 6,
            titleFont: {
              size: 14,
              weight: 'bold' as const,
              family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
            },
            bodyFont: {
              size: 13,
              family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
            },
            displayColors: true,
            boxWidth: 12,
            boxHeight: 12,
            boxPadding: 4
          }
        },
        animation: {
          animateRotate: true,
          animateScale: true,
          duration: 800,
          easing: 'easeInOutQuart'
        },
        layout: {
          padding: {
            top: 10,
            bottom: 10,
            left: 10,
            right: 10
          }
        }
      }
    };

    try {
      this.chartInstance = new Chart(ctx, config);
      // console.log('Chart initialized successfully');
    } catch (error) {
      console.error('Error initializing chart:', error);
      this.snackbar.error('Failed to render chart');
    }
  }

  loadCustomers(): void {
    this.isLoadingCustomers = true;
    this.cdr.markForCheck();
    
    const customerSub = this.customerService.getCustomers({ status: 'A' }).subscribe({
      next: (response) => {
        if (response.success) {
          this.customers = response.data || [];
        } else {
          this.customers = [];
        }
        this.isLoadingCustomers = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Failed to load customers:', error);
        this.snackbar.error('Failed to load customers');
        this.customers = [];
        this.isLoadingCustomers = false;
        this.cdr.markForCheck();
      }
    });
    
    this.subscriptions.add(customerSub);
  }

  refreshCustomers(): void {
    if (this.isLoadingCustomers) return;
    
    this.isLoadingCustomers = true;
    this.cdr.markForCheck();
    
    this.customerService.refreshCustomers().subscribe({
      next: (response) => {
        if (response.success) {
          this.customers = response.data || [];
          this.snackbar.success('Customers refreshed successfully');
        } else {
          this.snackbar.error(response.message || 'Failed to refresh customers');
        }
        this.isLoadingCustomers = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Failed to refresh customers:', error);
        this.snackbar.error('Failed to refresh customers');
        this.isLoadingCustomers = false;
        this.cdr.markForCheck();
      }
    });
  }

  onSearch(): void {
    if (this.isLoading) return;
    this.loadChartData();
  }

  onReset(): void {
    const { startDate, endDate } = this.getCurrentMonthDates();
    this.chartForm.patchValue({
      startDate,
      endDate,
      customerId: '',
      quotationStatuses: []
    }, { emitEvent: false }); // Prevent triggering valueChanges
    
    this.loadChartData();
  }

  onResize(): void {
    if (this.chartInstance) {
      this.chartInstance.resize();
    }
  }

  getTotalCount(): number {
    return this.chartData.reduce((sum, item) => sum + item.count, 0);
  }

  getTotalAmount(): number {
    return this.chartData.reduce((sum, item) => sum + item.totalAmount, 0);
  }

  getColor(index: number): string {
    return this.colorPalette[index % this.colorPalette.length];
  }
}
