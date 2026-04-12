import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink, RouterModule } from '@angular/router';
import { LoaderComponent } from '../../../shared/components/loader/loader.component';
import { SnackbarService } from '../../../shared/services/snackbar.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { TransportMasterSearchRequest, TransportMasterService } from '../../../services/transport-master.service';
import { Router } from '@angular/router';
import { EncryptionService } from '../../../shared/services/encryption.service';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-transport-master-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    LoaderComponent,
    RouterLink,
    PaginationComponent
  ],
  templateUrl: './transport-master-list.component.html',
  styleUrls: ['./transport-master-list.component.scss']
})
export class TransportMasterListComponent implements OnInit, OnDestroy {
  searchForm!: FormGroup;
  isLoading = false;
  transports: any[] = [];
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50, 100];
  totalPages = 0;
  totalElements = 0;
  startIndex = 0;
  endIndex = 0;

  private destroy$ = new Subject<void>();
  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private service: TransportMasterService,
    private snackbar: SnackbarService,
    private router: Router,
    private encryption: EncryptionService
  ) {
    this.searchForm = this.fb.group({
      search: ['']
    });
  }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.isLoading = true;
    const payload = {
      search: this.searchForm.value.search || '',
      page: this.currentPage,
      size: this.pageSize,
      sortBy: 'id',
      sortDir: 'desc'
    };
    const sub = this.service.search(payload as TransportMasterSearchRequest)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response?.data?.content) {
            this.transports = response.data.content;
            this.totalPages = response.data.totalPages;
            this.totalElements = response.data.totalElements;
            this.updateIndexes();
          } else if (Array.isArray(response?.data)) {
            this.transports = response.data;
            this.totalPages = 1;
            this.totalElements = response.data.length;
            this.updateIndexes();
          } else {
            this.transports = [];
            this.totalPages = 0;
            this.totalElements = 0;
            this.updateIndexes();
          }
          this.isLoading = false;
        },
        error: () => {
          this.snackbar.error('Failed to load transports');
          this.isLoading = false;
        }
      });
    this.subscriptions.push(sub);
  }

  onSearch(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.currentPage = 0;
    this.pageSize = 10;
    this.loadData();
  }

  reset(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.searchForm.reset();
    this.currentPage = 0;
    this.pageSize = 10;
    this.loadData();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadData();
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.currentPage = 0;
    this.loadData();
  }

  delete(id: number): void {
    if (!confirm('Delete this transport?')) return;
    this.isLoading = true;
    const sub = this.service.delete(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snackbar.success('Transport deleted');
          this.loadData();
        },
        error: () => {
          this.snackbar.error('Failed to delete transport');
          this.isLoading = false;
        }
      });
    this.subscriptions.push(sub);
  }

  private updateIndexes(): void {
    this.startIndex = this.currentPage * this.pageSize;
    this.endIndex = Math.min(this.startIndex + this.pageSize, this.totalElements);
  }

  onEdit(id: number): void {
    const encrypted = this.encryption.encrypt(id.toString());
    localStorage.setItem('transportMasterId', encrypted);
    this.router.navigate(['/transport-master/edit']);
  }  

  goToCreateTransport(): void {
    localStorage.removeItem('transportMasterId');
    this.router.navigate(['/transport-master/create']);
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
    this.transports = [];

    // Reset form to release form subscriptions
    if (this.searchForm) {
      this.searchForm.reset();
    }
  }
}


