import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryService } from '../../services/category.service';
import { Category } from '../../models/category.model';
import { FormsModule } from '@angular/forms';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { animate, style, transition, trigger } from '@angular/animations';
import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    LoaderComponent,
    FormsModule,
    PaginationComponent
  ],
  templateUrl: './category.component.html',
  styleUrls: ['./category.component.scss'],
  animations: [
    trigger('dialogAnimation', [
      transition(':enter', [
        style({ transform: 'translate(-50%, -48%) scale(0.95)', opacity: 0 }),
        animate('200ms ease-out', style({ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('150ms ease-in', style({ transform: 'translate(-50%, -48%) scale(0.95)', opacity: 0 }))
      ])
    ])
  ]
})
export class CategoryComponent implements OnInit, OnDestroy {
  categories: Category[] = [];
  categoryForm: FormGroup;
  isLoading = false;
  isEditing = false;
  editingId?: number;
  searchForm: FormGroup;
  currentPage = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50, 100];
  totalPages = 0;
  totalElements = 0;
  startIndex = 0;
  endIndex = 0;
  isDialogOpen = false;
  private destroy$ = new Subject<void>();

  constructor(
    private categoryService: CategoryService,
    private fb: FormBuilder,
    private snackbar: SnackbarService
  ) {
    this.categoryForm = this.fb.group({
      name: ['', Validators.required],
      status: ['A', Validators.required]
    });

    this.searchForm = this.fb.group({
      search: [''],
      status: ['A']
    });
  }

  ngOnInit(): void {
    this.loadCategories();
  }

  ngOnDestroy(): void {
    // Complete the destroy subject to unsubscribe all observables
    this.destroy$.next();
    this.destroy$.complete();
    
    // Clean up references
    this.categories = [];
  }

  openCreateDialog(): void {
    this.isEditing = false;
    this.editingId = undefined;
    this.categoryForm.reset({ status: 'A' });
    this.isDialogOpen = true;
  }

  closeDialog(): void {
    if (!this.categoryForm.dirty) {
      this.isLoading = false;
    }
    this.isDialogOpen = false;
    this.resetForm();
  }

  loadCategories(): void {
    this.isLoading = true;
    const searchParams = {
      ...this.searchForm.value,
      size: this.pageSize,
      page: this.currentPage
    };

    this.categoryService.searchCategories(searchParams)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.isLoading = false))
      )
      .subscribe({
        next: (response) => {
          this.categories = response.data.content;
          this.totalPages = response.data.totalPages;
          this.totalElements = response.data.totalElements;
          this.startIndex = this.currentPage * this.pageSize;
          this.endIndex = Math.min((this.currentPage + 1) * this.pageSize, this.totalElements);
          this.isLoading = false;
        },
        error: (error) => {
          const errorMessage = error?.error?.message || 'Failed to load categories';
          this.snackbar.error(errorMessage);
          this.isLoading = false;
        }
      });
  }

  onSubmit(): void {
    if (this.categoryForm.valid) {
      this.isLoading = true;
      const category = this.categoryForm.value;

      const request = this.isEditing && this.editingId
        ? this.categoryService.updateCategory(this.editingId, category)
        : this.categoryService.createCategory(category);

      request.pipe(takeUntil(this.destroy$)).subscribe({
        next: (response:any) => {
          if (response?.success) {
            this.snackbar.success(response.message || 'Category saved successfully');
            this.closeDialog();
            this.loadCategories();
          } else {
            this.snackbar.error(response.message || 'Operation failed');
            this.isLoading = false;
          }
        },
        error: (error) => {
          const errorMessage = error?.error?.message || 'Operation failed';
          this.snackbar.error(errorMessage);
          this.isLoading = false;
        }
      });
    } else {
      Object.keys(this.categoryForm.controls).forEach(key => {
        const control = this.categoryForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  editCategory(category: Category): void {
    if (!category.id) {
      this.snackbar.error('Invalid category ID');
      return;
    }
    
    this.isEditing = true;
    this.editingId = category.id;
    this.categoryForm.patchValue({
      name: category.name,
      status: category.status
    });
    
    this.isDialogOpen = true;
  }

  deleteCategory(id: number): void {
    this.isLoading = true;
    if (confirm('Are you sure you want to delete this category?')) {
      this.categoryService.deleteCategory(id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response:any) => {
            if (response?.success) {
              this.snackbar.success(response.message || 'Category deleted successfully');
              this.loadCategories();
            } else {
              this.snackbar.error(response.message || 'Failed to delete category');
            }
          },
          error: (error) => {
            const errorMessage = error?.error?.message || 'Failed to delete category';
            this.snackbar.error(errorMessage);
            this.isLoading = false;
          }
        });
    }
  }

  resetForm(): void {
    this.isEditing = false;
    this.editingId = undefined;
    this.categoryForm.reset({ status: 'A' });
    this.categoryForm.markAsPristine();
    this.categoryForm.markAsUntouched();
  }

  onSearch(): void {
    this.loadCategories();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadCategories();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize = newSize;
    this.currentPage = 0;
    this.loadCategories();
  }
}