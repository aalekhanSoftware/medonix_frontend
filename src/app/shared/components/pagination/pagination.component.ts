import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-pagination',
  templateUrl: './pagination.component.html',
  styleUrls: ['./pagination.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class PaginationComponent {
  @Input() currentPage = 0;
  @Input() pageSize = 5;
  @Input() totalElements = 0;
  @Input() pageSizeOptions = [5, 10, 50, 100];
  /**
   * Optional sum of a numeric field across the currently displayed rows (usually current page).
   * If not provided, the pagination footer will not show any total amount.
   */
  @Input() totalAmountSum: number | null = null;
  @Input() totalAmountLabel = 'Total Amount';

  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  goToPageInput = '';

  get totalPages(): number {
    return Math.ceil(this.totalElements / this.pageSize);
  }

  get startIndex(): number {
    return this.currentPage * this.pageSize;
  }

  get endIndex(): number {
    return Math.min(this.startIndex + this.pageSize, this.totalElements);
  }

  onPageSizeChange(newSize: number): void {
    this.pageSizeChange.emit(newSize);
  }

  loadPage(page: number): void {
    if (page >= 0 && page < this.totalPages) {
      this.pageChange.emit(page);
    }
  }

  getVisiblePages(): number[] {
    const totalPages = this.totalPages;
    const currentPage = this.currentPage + 1;
    const visiblePages = [];
    const range = 2; // Show 2 pages before and after current page

    let startPage = Math.max(currentPage - range, 1);
    let endPage = Math.min(currentPage + range, totalPages);

    // Adjust the range to always show 5 pages when possible
    if (endPage - startPage + 1 < 5) {
      if (currentPage < totalPages - range) {
        endPage = Math.min(startPage + 4, totalPages);
      } else {
        startPage = Math.max(endPage - 4, 1);
      }
    }

    // Add visible pages
    for (let i = startPage; i <= endPage; i++) {
      visiblePages.push(i);
    }

    return visiblePages;
    } 

  goToPage(): void {
    const pageNumber = parseInt(this.goToPageInput, 10);
    if (
      !isNaN(pageNumber) && 
      pageNumber > 0 && 
      pageNumber <= this.totalPages
    ) {
      this.loadPage(pageNumber - 1);
      this.goToPageInput = '';
    }
  }
} 