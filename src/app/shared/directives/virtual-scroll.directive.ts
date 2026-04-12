import { Directive, Input, ElementRef, OnInit, OnDestroy, Output, EventEmitter, Renderer2 } from '@angular/core';
import { fromEvent, Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

@Directive({
  selector: '[appVirtualScroll]'
})
export class VirtualScrollDirective implements OnInit, OnDestroy {
  @Input() itemHeight: number = 50;
  @Input() buffer: number = 5;
  @Input() items: any[] = [];
  @Output() visibleItemsChange = new EventEmitter<{ items: any[]; startIndex: number; endIndex: number; total: number }>();
  @Output() scrollPositionChange = new EventEmitter<number>();

  private destroy$ = new Subject<void>();
  private scrollTop: number = 0;
  private containerHeight: number = 0;

  constructor(
    private el: ElementRef,
    private renderer: Renderer2
  ) {}

  ngOnInit() {
    // Initialize container height
    this.containerHeight = this.el.nativeElement.clientHeight;
    
    // Listen to scroll events with debounce
    fromEvent(this.el.nativeElement, 'scroll')
      .pipe(
        debounceTime(16), // ~60fps
        takeUntil(this.destroy$)
      )
      .subscribe((event: any) => {
        this.onScroll(event);
      });

    // Listen to window resize events
    fromEvent(window, 'resize')
      .pipe(
        debounceTime(100),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.containerHeight = this.el.nativeElement.clientHeight;
        this.updateVisibleItems();
      });

    // Initial update
    setTimeout(() => {
      this.updateVisibleItems();
    }, 0);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private onScroll(event: any) {
    this.scrollTop = event.target.scrollTop;
    this.scrollPositionChange.emit(this.scrollTop);
    this.updateVisibleItems();
  }

  private updateVisibleItems() {
    if (!this.items || this.items.length === 0) {
      this.visibleItemsChange.emit({ 
        items: [], 
        startIndex: 0,
        endIndex: 0,
        total: 0
      });
      return;
    }

    const startIndex = Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - this.buffer);
    const visibleCount = Math.ceil(this.containerHeight / this.itemHeight) + this.buffer * 2;
    const endIndex = Math.min(this.items.length, startIndex + visibleCount);

    const visibleItems = this.items.slice(startIndex, endIndex);
    this.visibleItemsChange.emit({ 
      items: visibleItems, 
      startIndex: startIndex,
      endIndex: endIndex,
      total: this.items.length
    });
  }

  // Method to update items and recalculate
  updateItems(items: any[]) {
    this.items = items || [];
    this.updateVisibleItems();
  }

  // Method to scroll to a specific item
  scrollToIndex(index: number) {
    const scrollTop = index * this.itemHeight;
    this.el.nativeElement.scrollTop = scrollTop;
  }
}