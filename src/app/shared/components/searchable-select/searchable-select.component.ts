import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, forwardRef, ElementRef, HostListener, HostBinding, OnDestroy, ViewChild, AfterViewInit, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, Renderer2, OnChanges, SimpleChanges } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  BARCODE_INPUT_MAX_DURATION_MS,
  buildProductCodeMap,
  findProductByProductCode,
  getBarcodeKeyChar,
  isLikelyBarcodeInput,
  normalizeScannedProductCodeText
} from '../../utils/product-barcode-scan.util';

interface SelectOption {
  [key: string]: any;
}

@Component({
  selector: 'app-searchable-select',
  templateUrl: './searchable-select.component.html',
  styleUrls: ['./searchable-select.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchableSelectComponent),
      multi: true
    }
  ],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchableSelectComponent implements ControlValueAccessor, OnInit, OnChanges, OnDestroy, AfterViewInit {
  @Input() options: SelectOption[] = [];
  @Input() labelKey: string = 'name';
  /** Optional extra option fields to include when filtering/jump-searching (e.g. productCode). */
  @Input() searchKeys: string[] = [];
  @Input() valueKey: string = 'id';
  @Input() placeholder: string = 'Select an option';
  @Input() defaultOption: { label: string; value: any } | null = null;
  @Input() searchPlaceholder: string = 'Search...';
  @Input() searchMode: 'filter' | 'jump' = 'filter';
  @Input() multiple = false;
  @Input() allowClear = true;
  @Input() focusWidthPx?: number;
  @Input() maxHeight: string = '420px';
  @Input() virtualScroll = true; // Default to true for performance
  @Input() searchDebounceMs = 300;
  @Input() initialDisplayLimit: number = 100; // Limit initial display for large lists (adaptive based on dataset size)
  @Input() virtualScrollItemHeight: number = 40; // Height of each option item in pixels
  @Input() virtualScrollBuffer: number = 25; // Number of items to render outside viewport (will be adaptive based on list size)
  /** When true, Enter tries exact productCode match before highlighted option selection. */
  @Input() enableProductCodeScan = false;
  @Input() productCodeField = 'productCode';

  @Output() selectionChange = new EventEmitter<any>();
  @Output() productCodeMatched = new EventEmitter<{ code: string; value: any }>();
  @Output() productCodeNotFound = new EventEmitter<string>();
  @Output() searchFocus = new EventEmitter<void>();
  @Output() searchBlur = new EventEmitter<void>();

  @ViewChild('searchInput', { static: false }) searchInput!: ElementRef<HTMLDivElement>;
  @ViewChild('dropdown', { static: false }) dropdown!: ElementRef<HTMLDivElement>;
  @ViewChild('optionsContainer', { static: false }) optionsContainer!: ElementRef<HTMLDivElement>;

  searchText: string = '';
  isOpen: boolean = false;

  /** Host class so parent tables can raise z-index while dropdown is open. */
  @HostBinding('class.dropdown-host-open')
  get dropdownHostOpen(): boolean {
    return this.isOpen;
  }

  @HostBinding('attr.data-product-barcode-scan')
  get productBarcodeScanAttr(): string | null {
    return this.enableProductCodeScan ? 'true' : null;
  }

  selectedValue: any = '';
  selectedValues: any[] = [];
  filteredOptions: SelectOption[] = [];
  displayedOptions: SelectOption[] = []; // Only visible items for virtual scrolling
  highlightedIndex: number = -1;
  interactingWithDropdown = false;
  isPlaceholderVisible: boolean = true;
  
  // Virtual scrolling properties
  scrollTop: number = 0;
  containerHeight: number = 200;
  startIndex: number = 0;
  endIndex: number = 0;
  totalHeight: number = 0;
  offsetY: number = 0;
  private isUpdatingScroll: boolean = false;
  private lastScrollTop: number = 0;

  onChange: (value: any) => void = () => {};
  onTouch: () => void = () => {};

  // Memory management
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private timeouts: ReturnType<typeof setTimeout>[] = [];
  private clickOutsideListener: (() => void) | null = null;
  private isFirstClick: boolean = true;
  private sanitizedHtmlCache: Map<string, SafeHtml> = new Map();
  private lastSearchText: string = '';
  private lastFilteredOptions: SelectOption[] = [];
  private originalStyles: Map<HTMLElement, { [key: string]: string }> = new Map();
  private labelCache: Map<SelectOption, string> = new Map();
  private animationFrameId: number | null = null;
  private jumpSearchToken = 0;
  private lastJumpSearchText = '';
  private lastJumpMatchIndex = -1;
  // Index map for O(1) lookup instead of O(n) find operations
  private optionsIndexMap: Map<any, SelectOption> = new Map();
  private productCodeMap: Map<string, SelectOption> = new Map();
  private barcodeKeyTimes: number[] = [];
  /** First unbuffered char of a rapid scan sequence (before inProgress starts). */
  private barcodePendingFirstChar = '';
  /** Buffered scan text — avoids contenteditable / writeValue races during rescan. */
  private barcodeScanBuffer = '';
  private barcodeScanInProgress = false;
  /** Selection to restore when a rescan-from-selected-field fails. */
  private barcodeScanRestoreValue: any = null;
  /** Above this size, map is built only when dropdown opens and cleared when it closes to save memory. */
  private readonly OPTIONS_INDEX_MAP_LAZY_THRESHOLD = 1000;

  // Touch handling for mobile/tablet to prevent accidental selection during scroll
  private pendingSelection: { option: SelectOption; timeoutId: ReturnType<typeof setTimeout> } | null = null;
  private touchStartTime: number = 0;
  private touchStartY: number = 0;
  private touchStartElement: HTMLElement | null = null;
  private touchStartOption: SelectOption | null = null;
  private containerTouchStartListener?: () => void;
  private containerTouchEndListener?: () => void;
  private containerTouchMoveListener?: () => void;
  private readonly mouseWheelScrollFactor = 0.45;
  private readonly maxWheelItemsPerEvent = 4;

  constructor(
    private elementRef: ElementRef,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private renderer: Renderer2
  ) {}

  ngOnInit(): void {
    this.filteredOptions = [];
    this.displayedOptions = [];
    if (this.options.length <= this.OPTIONS_INDEX_MAP_LAZY_THRESHOLD) {
      this.buildOptionsIndexMap();
    }
    this.buildProductCodeLookupMap();
  }
  
  private buildOptionsIndexMap(): void {
    this.optionsIndexMap.clear();
    for (const option of this.options) {
      const value = option[this.valueKey];
      if (value !== undefined && value !== null) {
        this.optionsIndexMap.set(value, option);
      }
    }
  }
  
  private getOptionByValue(value: any): SelectOption | undefined {
    if (value === undefined || value === null) return undefined;
    if (this.optionsIndexMap.size > 0) {
      let option = this.optionsIndexMap.get(value);
      if (option) return option;
      if (typeof value === 'string' && /^\d+$/.test(String(value).trim())) {
        option = this.optionsIndexMap.get(Number(value));
        if (option) return option;
      }
      if (typeof value === 'number') {
        option = this.optionsIndexMap.get(String(value));
        if (option) return option;
      }
      return undefined;
    }
    if (this.options.length > this.OPTIONS_INDEX_MAP_LAZY_THRESHOLD) {
      return this.options.find(opt =>
        opt[this.valueKey] === value ||
        opt[this.valueKey] === Number(value) ||
        opt[this.valueKey] === String(value)
      );
    }
    if (this.options.length > 0) {
      this.buildOptionsIndexMap();
      let option = this.optionsIndexMap.get(value);
      if (option) return option;
      if (typeof value === 'string' && /^\d+$/.test(String(value).trim())) {
        option = this.optionsIndexMap.get(Number(value));
      }
      if (!option && typeof value === 'number') {
        option = this.optionsIndexMap.get(String(value));
      }
      return option;
    }
    return undefined;
  }
  
  get adaptiveDisplayLimit(): number {
    // Adaptive initial display limit based on dataset size for better performance
    const listSize = this.filteredOptions.length || this.options.length;
    return listSize > 20000 ? 50 :
           listSize > 10000 ? 75 :
           this.initialDisplayLimit;
  }
  
  private getAdaptiveDisplayLimit(): number {
    return this.adaptiveDisplayLimit;
  }

  ngAfterViewInit(): void {
    // Set initial display text in contenteditable div
    const timeoutId = setTimeout(() => {
      if (this.searchInput?.nativeElement && !this.isOpen) {
        this.searchInput.nativeElement.textContent = this.getDisplayText();
        this.cdr.markForCheck();
      }
    }, 0);
    this.timeouts.push(timeoutId);
    
    // Setup passive touch listeners for container-level event delegation
    this.setupContainerTouchListeners();
  }
  
  private setupContainerTouchListeners(): void {
    const container = this.optionsContainer?.nativeElement;
    if (!container) return;
    
    // Use native addEventListener with passive option for smooth scrolling
    // Renderer2.listen doesn't support passive option, so we use native API
    const touchStartHandler = (event: TouchEvent) => this.onContainerTouchStart(event);
    const touchMoveHandler = (event: TouchEvent) => this.onContainerTouchMove(event);
    const touchEndHandler = (event: TouchEvent) => this.onContainerTouchEnd(event);
    
    container.addEventListener('touchstart', touchStartHandler, { passive: true });
    container.addEventListener('touchmove', touchMoveHandler, { passive: true });
    container.addEventListener('touchend', touchEndHandler, { passive: true });
    
    // Store cleanup functions
    this.containerTouchStartListener = () => container.removeEventListener('touchstart', touchStartHandler);
    this.containerTouchMoveListener = () => container.removeEventListener('touchmove', touchMoveHandler);
    this.containerTouchEndListener = () => container.removeEventListener('touchend', touchEndHandler);
  }
  
  private onContainerTouchStart(event: TouchEvent): void {
    if (!event.touches || event.touches.length === 0) return;
    
    const touch = event.touches[0];
    this.touchStartY = touch.clientY;
    this.touchStartTime = Date.now();
    this.touchStartElement = (event.target as HTMLElement)?.closest('.option') as HTMLElement;
    this.touchStartOption = null;
    
    // Find the option element
    if (this.touchStartElement) {
      const optionIndex = Array.from(this.touchStartElement.parentElement?.children || []).indexOf(this.touchStartElement);
      if (optionIndex >= 0 && optionIndex < this.displayedOptions.length) {
        // Account for virtual scroll offset
        const actualIndex = this.virtualScroll && this.filteredOptions.length > this.getAdaptiveDisplayLimit() 
          ? this.startIndex + optionIndex 
          : optionIndex;
        if (actualIndex >= 0 && actualIndex < this.filteredOptions.length) {
          this.touchStartOption = this.filteredOptions[actualIndex];
        }
      }
    }
    
    this.cancelPendingSelection();
  }
  
  private onContainerTouchMove(event: TouchEvent): void {
    if (!event.touches || event.touches.length === 0 || this.touchStartY === 0) return;
    
    const touch = event.touches[0];
    const deltaY = Math.abs(touch.clientY - this.touchStartY);
    
    // If movement exceeds 10px, it's a scroll - cancel selection
    if (deltaY > 10) {
      this.touchStartOption = null; // Mark as scrolling
    }
  }
  
  private onContainerTouchEnd(event: TouchEvent): void {
    // Only select if it was a tap (not a scroll) and we have a valid option
    if (this.touchStartOption && this.touchStartTime > 0) {
      const touchDuration = Date.now() - this.touchStartTime;
      // Only select if it was a quick tap (< 400ms) - longer duration likely means scrolling
      if (touchDuration < 400) {
        // Small delay to ensure any scroll momentum has stopped
        setTimeout(() => {
          if (this.touchStartOption) {
            this.selectOption(this.touchStartOption, event);
          }
        }, 100);
      }
    }
    
    // Reset touch state
    this.touchStartY = 0;
    this.touchStartTime = 0;
    this.touchStartElement = null;
    this.touchStartOption = null;
  }

  ngOnDestroy(): void {
    // Close dropdown first to prevent any pending operations
    this.isOpen = false;
    this.interactingWithDropdown = false;
    
    // Cancel any pending animation frames
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Remove container touch listeners
    if (this.containerTouchStartListener) {
      this.containerTouchStartListener();
      this.containerTouchStartListener = undefined;
    }
    if (this.containerTouchMoveListener) {
      this.containerTouchMoveListener();
      this.containerTouchMoveListener = undefined;
    }
    if (this.containerTouchEndListener) {
      this.containerTouchEndListener();
      this.containerTouchEndListener = undefined;
    }
    
    // Clear all timeouts
    this.timeouts.forEach(id => clearTimeout(id));
    this.timeouts = [];
    
    // Clear debounce timer
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    
    // Remove click outside listener
    if (this.clickOutsideListener) {
      this.clickOutsideListener();
      this.clickOutsideListener = null;
    }
    
    // Revert all style manipulations
    this.revertAllStyles();
    
    // Clear all arrays and references
    this.options = [];
    this.filteredOptions = [];
    this.displayedOptions = [];
    this.selectedValues = [];
    this.lastFilteredOptions = [];
    
    // Clear all caches aggressively
    this.sanitizedHtmlCache.clear();
    this.labelCache.clear();
    this.originalStyles.clear();
    this.optionsIndexMap.clear();
    this.productCodeMap.clear();
    this.endBarcodeScanCapture();
    
    // Clear all string properties
    this.searchText = '';
    this.lastSearchText = '';
    
    // Reset all state completely
    this.isPlaceholderVisible = true;
    this.isFirstClick = true;
    this.highlightedIndex = -1;
    this.selectedValue = null;
    this.selectedValues = [];

    // Cancel any pending touch selection
    this.cancelPendingSelection();
    this.touchStartTime = 0;
    this.touchStartY = 0;
    this.touchStartElement = null;
    this.touchStartOption = null;

    // Nullify callbacks
    this.onChange = () => {};
    this.onTouch = () => {};
    
    // Clear DOM references
    if (this.searchInput?.nativeElement) {
      this.searchInput.nativeElement.textContent = '';
    }
    
    // Detach change detector to prevent any lingering change detection cycles
    this.cdr.detach();
    
    // Complete EventEmitter to remove all subscribers and prevent memory leaks
    if (this.selectionChange && typeof (this.selectionChange as any).complete === 'function') {
      (this.selectionChange as any).complete();
    }
    
    // Clear ViewChild references to help garbage collection
    // Using type assertion to allow undefined assignment
    (this as any).searchInput = undefined;
    (this as any).dropdown = undefined;
    (this as any).optionsContainer = undefined;
  }
  
  private revertAllStyles(): void {
    this.originalStyles.forEach((styles, element) => {
      Object.keys(styles).forEach(prop => {
        if (styles[prop]) {
          (element.style as any)[prop] = styles[prop];
        } else {
          (element.style as any)[prop] = '';
        }
      });
      // Remove custom classes
      element.classList.remove('expanded', 'custom-width');
    });
    this.originalStyles.clear();
  }
  
  hasSelection(): boolean {
    return this.multiple ? this.selectedValues.length > 0 : !!this.selectedValue;
  }

  /** When `searchMode` is `filter` but a value is already selected (edit mode), use jump so the full list is visible. */
  private get effectiveSearchMode(): 'filter' | 'jump' {
    if (this.searchMode === 'filter' && this.hasSelection()) {
      return 'jump';
    }
    return this.searchMode;
  }
  
  onDropdownPointerDown(event?: Event): void {
    // Prevent input blur from closing dropdown prematurely on desktop
    // Only prevent default on mouse events, not touch events (to allow scrolling)
    if (event && event.type === 'mousedown') {
      event.preventDefault();
      event.stopPropagation();
    }
    this.interactingWithDropdown = true;
  }

  onInputClick(event: MouseEvent | TouchEvent): void {
    // Prevent form submission
    event.preventDefault();
    event.stopPropagation();
    
    // Clear placeholder text on first click
    if (this.isFirstClick || this.isPlaceholderVisible) {
      const currentText = this.getDisplayText();
      const isPlaceholder = !this.hasSelection() && 
        (currentText === this.placeholder || 
         (this.defaultOption && currentText === this.defaultOption.label));
      
      if (isPlaceholder) {
        this.searchText = '';
        this.isPlaceholderVisible = false;
        this.isFirstClick = false;
        
        // Clear the contenteditable div
        const timeoutId = setTimeout(() => {
          if (this.searchInput?.nativeElement) {
            this.searchInput.nativeElement.textContent = '';
            this.searchInput.nativeElement.focus();
            this.cdr.markForCheck();
          }
        }, 0);
        this.timeouts.push(timeoutId);
      }
    }
  }

  
  scrollOptions(direction: 'up' | 'down', event?: MouseEvent | TouchEvent): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    const container = this.optionsContainer?.nativeElement;
    if (!container) return;

    const scrollAmount = 160;
    const currentScroll = container.scrollTop;
    
    if (direction === 'up') {
      container.scrollTo({
        top: currentScroll - scrollAmount,
        behavior: 'smooth'
      });
      this.highlightedIndex = Math.max(this.highlightedIndex - 4, 0);
    } else {
      container.scrollTo({
        top: currentScroll + scrollAmount,
        behavior: 'smooth'
      });
      this.highlightedIndex = Math.min(
        this.highlightedIndex + 4, 
        this.filteredOptions.length - 1
      );
    }
    this.cdr.markForCheck();
  }

  writeValue(value: any): void {
    if (this.barcodeScanInProgress) {
      return;
    }
    if (this.multiple) {
      this.selectedValues = value || [];
      this.searchText = '';
      const syncId = setTimeout(() => {
        if (this.searchInput?.nativeElement) {
          this.searchInput.nativeElement.textContent = this.getDisplayText();
        }
        this.cdr.markForCheck();
      }, 0);
      this.timeouts.push(syncId);
    } else {
      this.selectedValue = value;
      if (value) {
        const selectedOption = this.getOptionByValue(value);
        if (selectedOption) {
          this.searchText = this.getOptionLabel(selectedOption);
          this.isPlaceholderVisible = false;
          this.isFirstClick = false;
          
          // Update the contenteditable div
          if (this.searchInput?.nativeElement) {
            this.searchInput.nativeElement.textContent = this.searchText;
          }
        }
      } else {
        this.isPlaceholderVisible = true;
        this.isFirstClick = true;
        this.searchText = '';
        
        // Update the contenteditable div with placeholder
        if (this.searchInput?.nativeElement) {
          this.searchInput.nativeElement.textContent = this.getDisplayText();
        }
      }
    }
    this.cdr.markForCheck();
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouch = fn;
  }

  toggleDropdown(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      if (this.options.length > this.OPTIONS_INDEX_MAP_LAZY_THRESHOLD && this.optionsIndexMap.size === 0) {
        this.buildOptionsIndexMap();
      }
      if (this.isFirstClick || this.isPlaceholderVisible) {
        const currentText = this.getDisplayText();
        const isPlaceholder = !this.hasSelection() && 
          (currentText === this.placeholder || 
           (this.defaultOption && currentText === this.defaultOption.label));
        
        if (isPlaceholder) {
          this.searchText = '';
          this.isPlaceholderVisible = false;
          this.isFirstClick = false;
        }
      }

      // Attach click outside listener when opening
      if (!this.clickOutsideListener) {
        this.clickOutsideListener = this.renderer.listen('document', 'click', (event: Event) => {
          this.onClickOutside(event);
        });
      }
      
      // Use requestAnimationFrame to avoid blocking UI
      requestAnimationFrame(() => {
        this.filterOptions();
        
        // Focus the search input when dropdown opens
        setTimeout(() => {
          if (this.searchInput?.nativeElement) {
            this.searchInput.nativeElement.textContent = this.searchText;
            this.searchInput.nativeElement.focus();
            this.cdr.markForCheck();
          }
        }, 0);
        
        // Adjust dropdown position for mobile viewport
        this.adjustDropdownPosition();
        
        // Setup virtual scrolling if enabled
        if (this.virtualScroll && this.filteredOptions.length > this.getAdaptiveDisplayLimit()) {
          this.setupVirtualScroll();
        }
      });
    } else {
      // Remove click outside listener when closing
      if (this.clickOutsideListener) {
        this.clickOutsideListener();
        this.clickOutsideListener = null;
      }
      
      if (this.options.length > this.OPTIONS_INDEX_MAP_LAZY_THRESHOLD && this.filteredOptions.length > 5000) {
        this.filteredOptions = [];
        this.displayedOptions = [];
        this.lastFilteredOptions = [];
      }
      if (this.options.length > this.OPTIONS_INDEX_MAP_LAZY_THRESHOLD) {
        this.optionsIndexMap.clear();
      }
    }
    this.cdr.markForCheck();
  }

  /** Programmatic focus: focuses the trigger so user can type (e.g. after adding a new row). */
  focus(): void {
    if (this.searchInput?.nativeElement) {
      this.searchInput.nativeElement.focus();
    }
  }

  onFocus(): void {
    if (this.enableProductCodeScan) {
      this.resetBarcodeKeyCaptureState();
    }

    // Clear placeholder text on first focus
    if (this.isFirstClick || this.isPlaceholderVisible) {
      const currentText = this.searchInput?.nativeElement?.textContent || this.getDisplayText();
      const isPlaceholder = !this.hasSelection() && 
        (currentText === this.placeholder || 
         (this.defaultOption && currentText === this.defaultOption.label) ||
         !currentText.trim());
      
      if (isPlaceholder) {
        this.searchText = '';
        this.isPlaceholderVisible = false;
        this.isFirstClick = false;
        
        // Clear the contenteditable div
        const timeoutId = setTimeout(() => {
          if (this.searchInput?.nativeElement) {
            this.searchInput.nativeElement.textContent = '';
            this.cdr.markForCheck();
          }
        }, 0);
        this.timeouts.push(timeoutId);
      } else if (this.searchInput?.nativeElement && this.searchText) {
        // Set the search text if it exists
        this.searchInput.nativeElement.textContent = this.searchText;
      }
    }
    
    this.isOpen = true;
    this.highlightedIndex = -1;

    // Attach click outside listener when opening
    if (!this.clickOutsideListener) {
      this.clickOutsideListener = this.renderer.listen('document', 'click', (event: Event) => {
        this.onClickOutside(event);
      });
    }
    
    // Use requestAnimationFrame to avoid blocking UI
    requestAnimationFrame(() => {
      this.filterOptions();
      
      // Apply custom width on focus if specified
      if (this.focusWidthPx) {
        this.applyFocusWidth();
      }
      
      // Adjust dropdown position for mobile viewport
      this.adjustDropdownPosition();
      
      // Setup virtual scrolling if enabled
      if (this.virtualScroll && this.filteredOptions.length > this.getAdaptiveDisplayLimit()) {
        this.setupVirtualScroll();
      }
    });
    
    this.searchFocus.emit();
    this.cdr.markForCheck();
  }
  
  private adjustDropdownPosition(): void {
    // Wait for dropdown to render
    const timeoutId = setTimeout(() => {
      if (!this.dropdown?.nativeElement || !this.isOpen) return;
      
      const dropdown = this.dropdown.nativeElement.querySelector('.select-dropdown') as HTMLElement;
      if (!dropdown) return;
      
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        // On mobile, use fixed positioning (handled by CSS)
        // Just ensure it's visible
        const viewportHeight = window.innerHeight;
        const maxHeight = Math.min(parseInt(this.maxHeight) || 200, viewportHeight * 0.6);
        dropdown.style.maxHeight = `${maxHeight}px`;
      } else {
        // On desktop: ensure dropdown shows many options (min 260px) and position so it is not clipped
        const rect = this.elementRef.nativeElement.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom;
        const spaceAbove = rect.top;
        const requestedMax = parseInt(this.maxHeight, 10) || 300;
        const minDropdownHeight = 260;
        const maxHeightBelow = Math.min(requestedMax, Math.max(spaceBelow - 16, minDropdownHeight));
        const maxHeightAbove = Math.min(requestedMax, Math.max(spaceAbove - 16, minDropdownHeight));

        if (spaceBelow < minDropdownHeight && spaceAbove >= minDropdownHeight) {
          dropdown.style.maxHeight = `${maxHeightAbove}px`;
          dropdown.style.top = 'auto';
          dropdown.style.bottom = 'calc(100% + 6px)';
          dropdown.style.transform = 'translateY(100%)';
        } else {
          dropdown.style.maxHeight = `${maxHeightBelow}px`;
          dropdown.style.top = 'calc(100% + 6px)';
          dropdown.style.bottom = 'auto';
          dropdown.style.transform = 'none';
        }
      }

      // Container clientHeight may have changed; keep virtual window in sync with DOM scroll (no second setupVirtualScroll).
      if (this.isOpen && this.virtualScroll && this.filteredOptions.length > this.getAdaptiveDisplayLimit()) {
        const oc = this.optionsContainer?.nativeElement;
        if (oc) {
          const st = Math.max(0, oc.scrollTop);
          this.scrollTop = this.lastScrollTop = st;
          this.updateDisplayedOptions();
        }
      }

      this.cdr.markForCheck();
    }, 0);
    this.timeouts.push(timeoutId);
  }
  
  private applyFocusWidth(): void {
    const element = this.elementRef.nativeElement as HTMLElement;
    
    // Store and apply styles to parent container
    const parentContainer = element.closest('.select-group') as HTMLElement;
    if (parentContainer && !this.originalStyles.has(parentContainer)) {
      this.originalStyles.set(parentContainer, {
        minWidth: parentContainer.style.minWidth,
        width: parentContainer.style.width
      });
      parentContainer.style.minWidth = `${this.focusWidthPx}px`;
      parentContainer.style.width = `${this.focusWidthPx}px`;
      parentContainer.style.transition = 'all 0.3s ease';
      parentContainer.classList.add('expanded');
    }
    
    // Store and apply styles to component element
    if (!this.originalStyles.has(element)) {
      this.originalStyles.set(element, {
        width: element.style.width,
        minWidth: element.style.minWidth,
        maxWidth: element.style.maxWidth
      });
      element.style.width = `${this.focusWidthPx}px`;
      element.style.minWidth = `${this.focusWidthPx}px`;
      element.style.maxWidth = `${this.focusWidthPx}px`;
      element.classList.add('custom-width');
    }
    
    // Store and apply styles to inner div
    const innerDiv = element.querySelector('.searchable-select') as HTMLElement;
    if (innerDiv && !this.originalStyles.has(innerDiv)) {
      this.originalStyles.set(innerDiv, {
        width: innerDiv.style.width,
        minWidth: innerDiv.style.minWidth,
        maxWidth: innerDiv.style.maxWidth
      });
      innerDiv.style.width = `${this.focusWidthPx}px`;
      innerDiv.style.minWidth = `${this.focusWidthPx}px`;
      innerDiv.style.maxWidth = `${this.focusWidthPx}px`;
    }
  }

  onBlur(): void {
    const timeoutId = setTimeout(() => {
      if (this.interactingWithDropdown) {
        return;
      }
      if (!this.multiple) {
        this.isOpen = false;
        this.highlightedIndex = -1;
        if (this.options.length > this.OPTIONS_INDEX_MAP_LAZY_THRESHOLD) {
          this.optionsIndexMap.clear();
        }
        const selected = this.getOptionByValue(this.selectedValue);
        this.searchText = selected ? this.getOptionLabel(selected) : '';
        
        // Update the contenteditable div with the display text
        if (this.searchInput?.nativeElement) {
          const displayText = this.getDisplayText();
          this.searchInput.nativeElement.textContent = displayText;
        }
        
        // Reset placeholder visibility if no selection
        if (!this.selectedValue) {
          this.isPlaceholderVisible = true;
          this.isFirstClick = true;
        }
        
        // Reset width on blur
        if (this.focusWidthPx) {
          this.revertFocusWidth();
        }
        this.searchBlur.emit();
        this.cdr.markForCheck();
      }
    }, 200);
    this.timeouts.push(timeoutId);
  }

  private buildProductCodeLookupMap(): void {
    this.productCodeMap.clear();
    if (!this.enableProductCodeScan || !this.options.length) {
      return;
    }
    this.productCodeMap = buildProductCodeMap(this.options, this.productCodeField);
  }

  private syncSearchTextFromInput(): void {
    const el = this.searchInput?.nativeElement;
    if (el) {
      this.searchText = (el.textContent || el.innerText || '').trim();
    }
  }

  private recordBarcodeKeyTime(): void {
    this.barcodeKeyTimes.push(Date.now());
    if (this.barcodeKeyTimes.length > 50) {
      this.barcodeKeyTimes.shift();
    }
  }

  private endBarcodeScanCapture(): void {
    this.barcodeScanInProgress = false;
    this.barcodeScanBuffer = '';
    this.barcodeScanRestoreValue = null;
    this.barcodeKeyTimes = [];
    this.barcodePendingFirstChar = '';
  }

  private resetBarcodeKeyCaptureState(): void {
    this.endBarcodeScanCapture();
  }

  private applyBarcodeScanBufferToDisplay(): void {
    this.searchText = this.barcodeScanBuffer;
    if (this.searchInput?.nativeElement) {
      this.searchInput.nativeElement.textContent = this.barcodeScanBuffer;
    }
  }

  /**
   * Starts buffered barcode capture. When replacing an existing selection, clears display only
   * (does not emit null to the form) so writeValue cannot overwrite mid-scan.
   */
  private beginBarcodeScanCapture(initialText: string, replacingSelection: boolean): void {
    if (replacingSelection) {
      this.barcodeScanRestoreValue = this.selectedValue;
      this.isPlaceholderVisible = false;
      this.isFirstClick = false;
      this.lastSearchText = '';
      this.lastFilteredOptions = [];
      this.highlightedIndex = -1;
    } else {
      this.barcodeScanRestoreValue = null;
      this.clearPlaceholderForBarcodeScan();
    }
    this.barcodeScanInProgress = true;
    this.barcodeScanBuffer = initialText;
    this.barcodePendingFirstChar = '';
    this.applyBarcodeScanBufferToDisplay();
    this.isOpen = true;
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    this.filterOptions();
  }

  private appendBarcodeScanChar(char: string): void {
    this.barcodeScanBuffer += char;
    this.applyBarcodeScanBufferToDisplay();
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    this.filterOptions();
  }

  private restoreAfterFailedBarcodeScan(): void {
    const restoreValue = this.barcodeScanRestoreValue;
    this.endBarcodeScanCapture();
    if (restoreValue != null) {
      this.writeValue(restoreValue);
    } else {
      this.clearSearchInputAfterFailedScan();
    }
  }

  private clearSearchInputAfterFailedScan(): void {
    this.searchText = '';
    this.isPlaceholderVisible = true;
    this.isFirstClick = true;
    if (this.searchInput?.nativeElement) {
      this.searchInput.nativeElement.textContent = this.getDisplayText();
    }
    this.filteredOptions = this.options;
    this.lastSearchText = '';
    this.lastFilteredOptions = [];
    this.highlightedIndex = -1;
  }

  private isShowingPlaceholder(): boolean {
    if (this.hasSelection()) {
      return false;
    }
    if (this.isPlaceholderVisible || this.isFirstClick) {
      return true;
    }
    const currentText = (this.searchInput?.nativeElement?.textContent || this.searchText || '').trim();
    const labels = [this.placeholder, this.defaultOption?.label].filter(Boolean) as string[];
    return labels.some(label => currentText === label.trim());
  }

  /** Synchronously clears placeholder text before the first barcode character is applied. */
  private clearPlaceholderForBarcodeScan(): void {
    this.searchText = '';
    this.isPlaceholderVisible = false;
    this.isFirstClick = false;
    this.lastSearchText = '';
    this.lastFilteredOptions = [];
    if (this.searchInput?.nativeElement) {
      this.searchInput.nativeElement.textContent = '';
    }
  }

  private getBarcodePlaceholderLabels(): string[] {
    const labels = [this.placeholder];
    if (this.defaultOption?.label) {
      labels.push(this.defaultOption.label);
    }
    return labels;
  }

  /** Returns true when the Enter key was fully handled by product code scan logic. */
  private tryProductCodeScan(event: KeyboardEvent): boolean {
    if (!this.enableProductCodeScan) {
      return false;
    }

    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }

    if (!this.barcodeScanInProgress) {
      this.syncSearchTextFromInput();
    }
    const rawText = this.barcodeScanInProgress ? this.barcodeScanBuffer : this.searchText;
    const text = normalizeScannedProductCodeText(
      rawText.trim(),
      this.getBarcodePlaceholderLabels()
    );
    if (!text) {
      return false;
    }

    const match = findProductByProductCode(
      text,
      this.options,
      this.productCodeMap,
      this.productCodeField
    );

    if (match) {
      this.isOpen = false;
      this.endBarcodeScanCapture();
      this.productCodeMatched.emit({ code: text, value: match[this.valueKey] });
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    if (isLikelyBarcodeInput(this.barcodeKeyTimes, text)) {
      this.productCodeNotFound.emit(text);
      this.isOpen = false;
      this.restoreAfterFailedBarcodeScan();
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    return false;
  }
  
  private revertFocusWidth(): void {
    const element = this.elementRef.nativeElement as HTMLElement;
    
    // Revert parent container styles
    const parentContainer = element.closest('.select-group') as HTMLElement;
    if (parentContainer && this.originalStyles.has(parentContainer)) {
      const styles = this.originalStyles.get(parentContainer)!;
      parentContainer.style.minWidth = styles['minWidth'] || '';
      parentContainer.style.width = styles['width'] || '';
      parentContainer.classList.remove('expanded');
      this.originalStyles.delete(parentContainer);
    }
    
    // Revert component element styles
    if (this.originalStyles.has(element)) {
      const styles = this.originalStyles.get(element)!;
      element.style.width = styles['width'] || '';
      element.style.minWidth = styles['minWidth'] || '';
      element.style.maxWidth = styles['maxWidth'] || '';
      element.classList.remove('custom-width');
      this.originalStyles.delete(element);
    }
    
    // Revert inner div styles
    const innerDiv = element.querySelector('.searchable-select') as HTMLElement;
    if (innerDiv && this.originalStyles.has(innerDiv)) {
      const styles = this.originalStyles.get(innerDiv)!;
      innerDiv.style.width = styles['width'] || '';
      innerDiv.style.minWidth = styles['minWidth'] || '';
      innerDiv.style.maxWidth = styles['maxWidth'] || '';
      this.originalStyles.delete(innerDiv);
    }
  }

  onSearch(event: Event): void {
    if (this.barcodeScanInProgress) {
      return;
    }

    // Prevent form submission
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.type === 'keydown' && (keyboardEvent.key === 'Enter' || keyboardEvent.keyCode === 13)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    
    // Get the current text content from the contenteditable div
    const target = event.target as HTMLElement;
    const value = (target.textContent || target.innerText || '').trim();
    
    // If multiple selection and has selected values, don't update search text
    if (this.multiple && this.selectedValues.length > 0 && !this.isOpen) {
      this.searchText = this.getDisplayText();
      return;
    }
    
    // Mark that placeholder is no longer visible once user starts typing
    if (this.isPlaceholderVisible || this.isFirstClick) {
      this.isPlaceholderVisible = false;
      this.isFirstClick = false;
    }
    
    this.searchText = value;
    
    // Implement search debouncing with caching
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    
    // Adaptive debounce: longer for large datasets to improve performance
    const adaptiveDebounce = this.options.length > 10000 ? 500 : 
                            this.options.length > 5000 ? 400 : 
                            this.searchDebounceMs;
    
    this.searchDebounceTimer = setTimeout(() => {
      this.filterOptions();
      this.isOpen = true;
      this.cdr.markForCheck();
    }, adaptiveDebounce);
  }

  filterOptions(): void {
    if (this.effectiveSearchMode === 'jump') {
      this.applyJumpSearch();
      return;
    }

    // Cache check - if search text hasn't changed, return cached results
    if (this.searchText === this.lastSearchText && this.lastFilteredOptions.length > 0) {
      this.filteredOptions = this.lastFilteredOptions;
      this.scrollTop = 0;
      this.lastScrollTop = 0;
      this.updateDisplayedOptions();
      this.highlightedIndex = this.filteredOptions.length > 0 ? 0 : -1;
      if (this.highlightedIndex >= 0) {
        this.scrollToIndex(this.highlightedIndex);
      }
      return;
    }
    
    const searchLower = this.searchText.toLowerCase().trim();
    
    if (!searchLower) {
      this.filteredOptions = this.options;
    } else {
      // Bucket matches so prefix matches always appear first, then contains matches.
      const startsWithMatches: SelectOption[] = [];
      const containsMatches: SelectOption[] = [];
      const optionsLength = this.options.length;
      
      // For very large datasets, use optimized filtering
      if (optionsLength > 10000) {
        // Process in chunks to avoid blocking UI
        const chunkSize = 1000;
        let processed = 0;
        
        const processChunk = () => {
          const endIndex = Math.min(processed + chunkSize, optionsLength);
          
          for (let i = processed; i < endIndex; i++) {
            const option = this.options[i];
            const label = this.getSearchableText(option);
            
            // Prefix matches should stay on top.
            if (label.startsWith(searchLower)) {
              startsWithMatches.push(option);
              continue;
            }
            
            // Contains-only matches follow prefix matches.
            if (label.includes(searchLower)) {
              containsMatches.push(option);
            }
          }
          
          processed = endIndex;
          
          if (processed < optionsLength) {
            // Process next chunk asynchronously
            requestAnimationFrame(processChunk);
          } else {
            // Finished processing
            this.filteredOptions = startsWithMatches.length + containsMatches.length > 0
              ? [...startsWithMatches, ...containsMatches]
              : [];
            this.lastSearchText = this.searchText;
            this.lastFilteredOptions = [...this.filteredOptions];
            this.highlightedIndex = this.filteredOptions.length > 0 ? 0 : -1;
            this.scrollTop = 0;
            this.lastScrollTop = 0;
            this.updateDisplayedOptions();
            if (this.highlightedIndex >= 0) {
              this.scrollToIndex(this.highlightedIndex);
            }
            this.cdr.markForCheck();
          }
        };
        
        processChunk();
        return; // Exit early, will continue asynchronously
      } else {
        // For smaller datasets, use direct filtering
        for (const option of this.options) {
          const label = this.getSearchableText(option);
          
          // Prefix matches should stay on top.
          if (label.startsWith(searchLower)) {
            startsWithMatches.push(option);
            continue;
          }
          
          // Contains-only matches follow prefix matches.
          if (label.includes(searchLower)) {
            containsMatches.push(option);
          }
        }
        
        this.filteredOptions = startsWithMatches.length + containsMatches.length > 0
          ? [...startsWithMatches, ...containsMatches]
          : [];
      }
    }
    
    this.lastSearchText = this.searchText;
    this.lastFilteredOptions = this.filteredOptions === this.options ? this.filteredOptions : [...this.filteredOptions];
    this.highlightedIndex = this.filteredOptions.length > 0 ? 0 : -1;
    this.scrollTop = 0;
    this.lastScrollTop = 0;
    
    // Update displayed options based on virtual scrolling
    // This will limit what's rendered in the DOM
    this.updateDisplayedOptions();
    if (this.highlightedIndex >= 0) {
      this.scrollToIndex(this.highlightedIndex);
    }
    
    this.cdr.markForCheck();
  }

  private applyJumpSearch(): void {
    // Keep ALL options visible; only jump/scroll to the first match.
    this.filteredOptions = this.options;
    this.updateDisplayedOptions();

    const searchLower = this.searchText.toLowerCase().trim();
    const token = ++this.jumpSearchToken;

    if (!searchLower) {
      this.lastJumpSearchText = '';
      this.lastJumpMatchIndex = -1;
      this.highlightedIndex = this.filteredOptions.length > 0 ? 0 : -1;
      this.scrollToIndex(0);
      this.cdr.markForCheck();
      return;
    }

    if (this.lastJumpSearchText === searchLower) {
      this.highlightedIndex = this.lastJumpMatchIndex >= 0 ? this.lastJumpMatchIndex : 0;
      this.scrollToIndex(this.highlightedIndex);
      this.cdr.markForCheck();
      return;
    }

    const optionsLength = this.options.length;
    const resolve = (matchIndex: number) => {
      if (token !== this.jumpSearchToken) return;
      this.lastJumpSearchText = searchLower;
      this.lastJumpMatchIndex = matchIndex;
      this.highlightedIndex = matchIndex >= 0 ? matchIndex : 0;
      this.scrollToIndex(this.highlightedIndex);
      this.cdr.markForCheck();
    };

    // For very large lists, search in chunks and stop early on first match.
    if (optionsLength > 10000) {
      const chunkSize = 1200;
      let processed = 0;

      const processChunk = () => {
        if (token !== this.jumpSearchToken) return;
        const endIndex = Math.min(processed + chunkSize, optionsLength);

        for (let i = processed; i < endIndex; i++) {
          const option = this.options[i];
          const label = this.getSearchableText(option);
          if (label.includes(searchLower)) {
            resolve(i);
            return;
          }
        }

        processed = endIndex;
        if (processed < optionsLength) {
          requestAnimationFrame(processChunk);
        } else {
          resolve(-1);
        }
      };

      processChunk();
      return;
    }

    for (let i = 0; i < optionsLength; i++) {
      const option = this.options[i];
      const label = this.getSearchableText(option);
      if (label.includes(searchLower)) {
        resolve(i);
        return;
      }
    }
    resolve(-1);
  }

  private scrollToIndex(index: number): void {
    const container = this.optionsContainer?.nativeElement;
    if (!container || index < 0) {
      return;
    }

    requestAnimationFrame(() => {
      const c = this.optionsContainer?.nativeElement;
      if (!c) return;

      if (this.virtualScroll && this.filteredOptions.length > this.getAdaptiveDisplayLimit()) {
        const viewportHeight = Math.max(c.clientHeight || this.containerHeight || parseInt(this.maxHeight, 10) || 300, 1);
        const targetScrollTop = (index * this.virtualScrollItemHeight) - ((viewportHeight - this.virtualScrollItemHeight) / 2);
        const maxScroll = Math.max(0, this.totalHeight - viewportHeight);
        c.scrollTop = Math.max(0, Math.min(targetScrollTop, maxScroll));
        this.scrollTop = c.scrollTop;
        this.lastScrollTop = c.scrollTop;
        this.updateDisplayedOptions();
        this.scheduleAlignOptionIntoView(index);
        return;
      }

      const optionElements = c.querySelectorAll('.option');
      const targetOption = optionElements[index] as HTMLElement | undefined;
      if (!targetOption) return;
      const targetOffset = targetOption.offsetTop - ((c.clientHeight - targetOption.offsetHeight) / 2);
      const maxScroll = Math.max(0, c.scrollHeight - c.clientHeight);
      c.scrollTop = Math.max(0, Math.min(targetOffset, maxScroll));
    });
  }
  
  private getCachedLabel(option: SelectOption): string {
    if (this.labelCache.has(option)) {
      return this.labelCache.get(option)!;
    }
    const label = this.getOptionLabel(option);
    this.labelCache.set(option, label);
    return label;
  }

  /** Lowercase text used for filter/jump search: display label plus optional searchKeys fields. */
  private getSearchableText(option: SelectOption): string {
    const parts: string[] = [this.getCachedLabel(option)];
    for (const key of this.searchKeys) {
      const value = option[key];
      if (value == null) continue;
      const text = typeof value === 'string' ? value.trim() : String(value).trim();
      if (text) {
        parts.push(text);
      }
    }
    return parts.join(' ').toLowerCase();
  }
  
  private updateDisplayedOptions(): void {
    const adaptiveDisplayLimit = this.getAdaptiveDisplayLimit();
    
    if (!this.virtualScroll || this.filteredOptions.length <= adaptiveDisplayLimit) {
      // Don't use virtual scrolling for small lists
      this.displayedOptions = this.filteredOptions;
      this.totalHeight = this.filteredOptions.length * this.virtualScrollItemHeight;
      this.offsetY = 0;
      return;
    }
    
    // Calculate visible range
    const container = this.optionsContainer?.nativeElement;
    if (!container) {
      this.displayedOptions = this.filteredOptions.slice(0, this.getAdaptiveDisplayLimit());
      return;
    }
    
    // Use actual container height with fallback, ensure minimum height
    this.containerHeight = Math.max(container.clientHeight || parseInt(this.maxHeight) || 300, 200);
    const visibleCount = Math.ceil(this.containerHeight / this.virtualScrollItemHeight);
    
    // Adaptive buffer: smaller for very large lists to reduce DOM elements
    const adaptiveBuffer = this.filteredOptions.length > 10000 ? 10 :
                          this.filteredOptions.length > 5000 ? 15 :
                          this.virtualScrollBuffer;
    
    // Calculate start/end with adaptive buffer to prevent white background
    const rawStartIndex = Math.floor(this.scrollTop / this.virtualScrollItemHeight);
    this.startIndex = Math.max(0, rawStartIndex - adaptiveBuffer);
    
    // Ensure we always render enough items to fill the viewport plus buffer
    const minItems = visibleCount + (adaptiveBuffer * 2); // Reduced multiplier for large lists
    this.endIndex = Math.min(
      this.filteredOptions.length,
      this.startIndex + minItems
    );
    
    // Ensure we always have items to display
    if (this.endIndex - this.startIndex < visibleCount && this.filteredOptions.length > 0) {
      // Adjust startIndex if we're near the end
      this.startIndex = Math.max(0, this.filteredOptions.length - minItems);
      this.endIndex = this.filteredOptions.length;
    }
    
    this.displayedOptions = this.filteredOptions.slice(this.startIndex, this.endIndex);
    this.totalHeight = this.filteredOptions.length * this.virtualScrollItemHeight;
    this.offsetY = this.startIndex * this.virtualScrollItemHeight;
  }
  
  /**
   * Sync virtual-scroll state with the real container. Scroll handling uses the template `(scroll)` binding only.
   */
  private setupVirtualScroll(): void {
    const container = this.optionsContainer?.nativeElement;
    if (!container || !this.virtualScroll || this.filteredOptions.length <= this.getAdaptiveDisplayLimit()) {
      return;
    }

    const st = Math.max(0, container.scrollTop);
    this.scrollTop = st;
    this.lastScrollTop = st;
    this.updateDisplayedOptions();
    this.cdr.markForCheck();
  }

  /** After virtual window updates, nudge scroll so the row matches real DOM heights (multi-line labels, touch min-heights). */
  private scheduleAlignOptionIntoView(index: number): void {
    if (index < 0) {
      return;
    }
    if (!this.virtualScroll || this.filteredOptions.length <= this.getAdaptiveDisplayLimit()) {
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this.alignOptionRowIntoView(index, 0));
    });
  }

  private alignOptionRowIntoView(index: number, attempt: number): void {
    const c = this.optionsContainer?.nativeElement;
    if (!c || index < 0 || attempt > 3) {
      return;
    }

    const el = c.querySelector(`[data-option-index="${index}"]`) as HTMLElement | null;
    if (el) {
      const pad = 8;
      const elTop = el.offsetTop;
      const elBottom = elTop + el.offsetHeight;
      let nextTop = c.scrollTop;
      if (elTop < c.scrollTop + pad) {
        nextTop = elTop - pad;
      } else if (elBottom > c.scrollTop + c.clientHeight - pad) {
        nextTop = elBottom - c.clientHeight + pad;
      }
      const maxS = Math.max(0, c.scrollHeight - c.clientHeight);
      nextTop = Math.max(0, Math.min(nextTop, maxS));
      if (Math.abs(nextTop - c.scrollTop) > 1) {
        this.isUpdatingScroll = true;
        c.scrollTop = nextTop;
        this.scrollTop = this.lastScrollTop = c.scrollTop;
        this.updateDisplayedOptions();
        this.cdr.markForCheck();
        setTimeout(() => {
          this.isUpdatingScroll = false;
        }, 0);
      }
      return;
    }

    const viewportHeight = Math.max(c.clientHeight || this.containerHeight || parseInt(this.maxHeight, 10) || 300, 1);
    const targetScrollTop = index * this.virtualScrollItemHeight - (viewportHeight - this.virtualScrollItemHeight) / 2;
    const maxScroll = Math.max(0, this.totalHeight - viewportHeight);
    c.scrollTop = Math.max(0, Math.min(targetScrollTop, maxScroll));
    this.scrollTop = this.lastScrollTop = c.scrollTop;
    this.updateDisplayedOptions();
    this.cdr.markForCheck();
    requestAnimationFrame(() => this.alignOptionRowIntoView(index, attempt + 1));
  }
  
  onOptionsContainerScroll(event: Event): void {
    // Prevent feedback loop - ignore scroll events triggered by DOM updates
    if (this.isUpdatingScroll) {
      return;
    }
    
    const container = event.target as HTMLElement;
    const newScrollTop = container.scrollTop;
    
    // Single threshold (was 5 vs 15 on duplicate listeners)
    if (Math.abs(newScrollTop - this.lastScrollTop) < 10) {
      return;
    }
    
    this.scrollTop = newScrollTop;
    this.lastScrollTop = newScrollTop;
    
    if (this.virtualScroll && this.filteredOptions.length > this.getAdaptiveDisplayLimit()) {
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
      }
      this.animationFrameId = requestAnimationFrame(() => {
        this.isUpdatingScroll = true;
        this.updateDisplayedOptions();
        this.cdr.markForCheck();
        
        // Reset flag after a short delay to allow DOM to settle
        setTimeout(() => {
          this.isUpdatingScroll = false;
          this.animationFrameId = null;
        }, 50);
      });
    }
  }

  onOptionsContainerWheel(event: WheelEvent): void {
    const container = this.optionsContainer?.nativeElement;
    if (!container || event.deltaY === 0) {
      return;
    }

    // Normalize wheel units (pixel/line/page) into pixels, then dampen and clamp.
    const lineHeightPx = this.virtualScrollItemHeight;
    const pageHeightPx = Math.max(container.clientHeight, this.virtualScrollItemHeight * 10);
    let normalizedDelta = event.deltaY;

    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      normalizedDelta = event.deltaY * lineHeightPx;
    } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      normalizedDelta = event.deltaY * pageHeightPx;
    }

    const reducedDelta = normalizedDelta * this.mouseWheelScrollFactor;
    const maxDeltaPerEvent = this.virtualScrollItemHeight * this.maxWheelItemsPerEvent;
    const clampedDelta = Math.max(-maxDeltaPerEvent, Math.min(maxDeltaPerEvent, reducedDelta));

    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const nextScrollTop = Math.max(0, Math.min(maxScrollTop, container.scrollTop + clampedDelta));

    if (nextScrollTop === container.scrollTop) {
      return;
    }

    event.preventDefault();
    container.scrollTop = nextScrollTop;
  }

  selectOption(option: SelectOption, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    if (this.multiple) {
      const value = option[this.valueKey];
      const index = this.selectedValues.indexOf(value);
      
      if (index === -1) {
        this.selectedValues = [...this.selectedValues, value];
      } else {
        this.selectedValues = this.selectedValues.filter(v => v !== value);
      }
      
      this.onChange(this.selectedValues);
      // Do not let filter typing override "N items selected" / single name in the closed field
      this.searchText = '';
      if (this.searchInput?.nativeElement) {
        this.searchInput.nativeElement.textContent = this.getDisplayText();
      }
    } else {
      this.selectedValue = option[this.valueKey];
      this.searchText = this.getOptionLabel(option);
      this.isPlaceholderVisible = false;
      this.isFirstClick = false;
      this.onChange(this.selectedValue);
      this.isOpen = false;
      
      // Update the contenteditable div with selected text
      if (this.searchInput?.nativeElement) {
        this.searchInput.nativeElement.textContent = this.searchText;
      }
    }
    this.onTouch();
    this.selectionChange.emit({ value: this.selectedValue });
    this.interactingWithDropdown = false;
    this.cdr.markForCheck();
  }

  cancelPendingSelection(): void {
    if (this.pendingSelection) {
      clearTimeout(this.pendingSelection.timeoutId);
      this.pendingSelection = null;
    }
  }

  clearSelection(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.multiple) {
      this.selectedValues = [];
      this.searchText = '';
      this.onChange([]);
      if (this.searchInput?.nativeElement) {
        this.searchInput.nativeElement.textContent = this.getDisplayText();
      }
    } else {
      this.selectedValue = null;
      this.searchText = '';
      this.isPlaceholderVisible = true;
      this.isFirstClick = true;
      this.onChange(null);
      if (this.searchInput?.nativeElement) {
        this.searchInput.nativeElement.textContent = this.getDisplayText();
      }
    }
    this.onTouch();
    this.selectionChange.emit({ value: this.multiple ? [] : null });
    this.cdr.markForCheck();
  }

  isSelected(option: SelectOption): boolean {
    const value = option[this.valueKey];
    return this.multiple 
      ? this.selectedValues.includes(value)
      : this.selectedValue === value;
  }
  
  trackByOptionId(index: number, option: SelectOption): any {
    return option[this.valueKey] ?? index;
  }
  
  getOptionLabel(option: SelectOption): string {
    // Check cache first
    if (this.labelCache.has(option)) {
      return this.labelCache.get(option)!;
    }
    
    const label = option[this.labelKey];
    let result: string;
    if (typeof label === 'string') {
      result = this.formatText(label);
    } else {
      result = String(label || '');
    }
    
    // Cache the result
    this.labelCache.set(option, result);
    return result;
  }

  getSelectedLabel(): string {
    if (this.multiple) {
      return this.selectedValues.length 
        ? `${this.selectedValues.length} selected`
        : this.placeholder;
    }
    
    if (!this.selectedValue && this.defaultOption) {
      return this.defaultOption.label;
    }
    const selected = this.getOptionByValue(this.selectedValue);
    return selected ? this.getOptionLabel(selected) : this.placeholder;
  }

  handleKeydown(event: KeyboardEvent): void {
    const barcodeChar = this.enableProductCodeScan ? getBarcodeKeyChar(event) : null;
    if (barcodeChar) {
      if (this.barcodeScanInProgress) {
        this.appendBarcodeScanChar(barcodeChar);
        this.recordBarcodeKeyTime();
        event.preventDefault();
        event.stopPropagation();
        this.cdr.markForCheck();
        return;
      }

      const now = Date.now();
      const lastKeyTime = this.barcodeKeyTimes.length > 0
        ? this.barcodeKeyTimes[this.barcodeKeyTimes.length - 1]
        : 0;
      const gap = this.barcodeKeyTimes.length === 0 ? Infinity : now - lastKeyTime;

      if (gap > BARCODE_INPUT_MAX_DURATION_MS) {
        this.barcodeKeyTimes = [];
        this.barcodePendingFirstChar = '';
      }

      const isFirstKey = this.barcodeKeyTimes.length === 0;

      if (isFirstKey && (this.hasSelection() || this.isShowingPlaceholder())) {
        this.beginBarcodeScanCapture(barcodeChar, this.hasSelection());
        this.recordBarcodeKeyTime();
        event.preventDefault();
        event.stopPropagation();
        this.cdr.markForCheck();
        return;
      }

      if (!isFirstKey && gap <= BARCODE_INPUT_MAX_DURATION_MS) {
        const initialText = this.barcodePendingFirstChar + barcodeChar;
        this.beginBarcodeScanCapture(initialText, this.hasSelection());
        this.recordBarcodeKeyTime();
        event.preventDefault();
        event.stopPropagation();
        this.cdr.markForCheck();
        return;
      }

      this.barcodePendingFirstChar = barcodeChar;
      this.recordBarcodeKeyTime();
    }

    // Prevent form submission on Enter; try barcode scan when dropdown is closed
    if (event.key === 'Enter' && !this.isOpen) {
      if (this.tryProductCodeScan(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    
    if (!this.isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        this.isOpen = true;
        this.highlightedIndex = 0;
        requestAnimationFrame(() => {
          this.filterOptions();
          this.cdr.markForCheck();
        });
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        if (this.filteredOptions.length === 0) {
          break;
        }
        this.highlightedIndex = this.highlightedIndex < 0
          ? 0
          : Math.min(this.highlightedIndex + 1, this.filteredOptions.length - 1);
        event.preventDefault();
        event.stopPropagation();
        this.scrollToHighlighted();
        break;

      case 'ArrowUp':
        if (this.filteredOptions.length === 0) {
          break;
        }
        this.highlightedIndex = this.highlightedIndex <= 0 ? 0 : this.highlightedIndex - 1;
        event.preventDefault();
        event.stopPropagation();
        this.scrollToHighlighted();
        break;

      case 'Enter':
        if (this.tryProductCodeScan(event)) {
          break;
        }
        if (this.highlightedIndex >= 0 && this.filteredOptions[this.highlightedIndex]) {
          this.selectOption(this.filteredOptions[this.highlightedIndex], event);
          (event.target as HTMLElement).blur();
        }
        // Always prevent form submission
        event.preventDefault();
        event.stopPropagation();
        break;

      case 'Escape':
        this.isOpen = false;
        this.highlightedIndex = -1;
        event.preventDefault();
        event.stopPropagation();
        this.cdr.markForCheck();
        break;
    }
  }

  private scrollToHighlighted(): void {
    requestAnimationFrame(() => {
      const container = this.optionsContainer?.nativeElement;
      if (!container) return;
      if (this.highlightedIndex < 0) return;
      this.scrollToIndex(this.highlightedIndex);
      this.cdr.markForCheck();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options'] || changes['enableProductCodeScan'] || changes['productCodeField']) {
      this.buildProductCodeLookupMap();
    }

    if (changes['options']) {
      if (this.options.length <= this.OPTIONS_INDEX_MAP_LAZY_THRESHOLD) {
        this.buildOptionsIndexMap();
      } else if (this.options.length > this.OPTIONS_INDEX_MAP_LAZY_THRESHOLD) {
        this.optionsIndexMap.clear();
      }
      if (!changes['options'].firstChange) {
        this.lastSearchText = '';
        this.lastFilteredOptions = [];
        this.labelCache.clear();
      }

      if (this.options.length > 10000) {
        if (this.sanitizedHtmlCache.size > 50) this.sanitizedHtmlCache.clear();
        if (this.labelCache.size > 5000) {
          const entries = Array.from(this.labelCache.entries()).slice(-2000);
          this.labelCache.clear();
          entries.forEach(([key, value]) => this.labelCache.set(key, value));
        }
      }

      // Sync display when value was set before options loaded (including first change so first row shows product name)
      if (!this.multiple && this.selectedValue) {
        const selectedOption = this.getOptionByValue(this.selectedValue);
        if (selectedOption) {
          this.searchText = this.getOptionLabel(selectedOption);
          this.isPlaceholderVisible = false;
          this.isFirstClick = false;
          const timeoutId = setTimeout(() => {
            if (this.searchInput?.nativeElement) {
              this.searchInput.nativeElement.textContent = this.searchText;
              this.cdr.markForCheck();
            }
          }, 0);
          this.timeouts.push(timeoutId);
        }
      }

      requestAnimationFrame(() => {
        this.filterOptions();
        this.cdr.markForCheck();
      });
    }
  }

  private onClickOutside(event: Event): void {
    const target = event.target as Node;
    if (!this.elementRef.nativeElement.contains(target)) {
      this.isOpen = false;
      this.interactingWithDropdown = false;
      if (this.options.length > this.OPTIONS_INDEX_MAP_LAZY_THRESHOLD) {
        this.optionsIndexMap.clear();
      }
      if (!this.multiple) {
        const selected = this.getOptionByValue(this.selectedValue);
        this.searchText = selected ? this.getOptionLabel(selected) : '';
        
        // Update the contenteditable div with display text
        if (this.searchInput?.nativeElement) {
          this.searchInput.nativeElement.textContent = this.getDisplayText();
        }
        
        // Reset placeholder visibility if no selection
        if (!this.selectedValue) {
          this.isPlaceholderVisible = true;
          this.isFirstClick = true;
        }
        
        // Reset width when closing dropdown
        if (this.focusWidthPx) {
          this.revertFocusWidth();
        }
      }
      this.cdr.markForCheck();
    }
  }

  sanitizeHtml(html: string): SafeHtml {
    // Cache sanitized HTML to avoid repeated sanitization
    if (this.sanitizedHtmlCache.has(html)) {
      return this.sanitizedHtmlCache.get(html)!;
    }
    
    const sanitized = this.sanitizer.bypassSecurityTrustHtml(html);
    // Limit cache size to prevent memory issues (reduced for large datasets)
    const maxCacheSize = this.options.length > 10000 ? 50 : 100;
    if (this.sanitizedHtmlCache.size > maxCacheSize) {
      const firstKey = this.sanitizedHtmlCache.keys().next().value;
      if (firstKey) {
        this.sanitizedHtmlCache.delete(firstKey);
      }
    }
    this.sanitizedHtmlCache.set(html, sanitized);
    return sanitized;
  }

  getDisplayText(): string {
    // Multiple: always show selection summary when anything is selected (create mode
    // otherwise keeps stale filter text and hides "N items selected").
    if (this.multiple) {
      const selectedCount = this.selectedValues.length;
      if (selectedCount === 0) {
        if (this.searchText && !this.isPlaceholderVisible && !this.isFirstClick) {
          return this.searchText;
        }
        return this.placeholder;
      }

      const selectedOptions = this.options.filter((opt) =>
        this.selectedValues.some(
          (sv) =>
            sv === opt[this.valueKey] ||
            sv === Number(opt[this.valueKey]) ||
            String(sv) === String(opt[this.valueKey])
        )
      );

      if (selectedCount === 1 && selectedOptions[0]) {
        return this.getOptionLabel(selectedOptions[0]);
      }

      return `${selectedCount} items selected`;
    }

    // Single: if search text is set and not a placeholder, return it
    if (this.searchText && !this.isPlaceholderVisible && !this.isFirstClick) {
      return this.searchText;
    }
    
    if (!this.selectedValue) {
      if (this.defaultOption) {
        return this.defaultOption.label;
      }
      return this.placeholder;
    }
    
    const selected = this.getOptionByValue(this.selectedValue);
    return selected ? this.getOptionLabel(selected) : this.placeholder;
  }

  formatText(input: string): string {
    if (!input) return '';
    let text = input.replace(/&nbsp;/g, ' ');
    text = text.replace(/<(?!\/?b\b)[^>]*>/gi, '');
    text = text.replace(/\s{2,}/g, ' ').trim();
    return text;
  }
}