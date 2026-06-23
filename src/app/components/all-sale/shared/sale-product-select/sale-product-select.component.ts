import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  forwardRef,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { SearchableSelectComponent } from '../../../../shared/components/searchable-select/searchable-select.component';
import {
  buildProductCodeMap,
  getBarcodeKeyChar,
  tryProductFieldBarcodeEnter
} from '../../../../shared/utils/product-barcode-scan.util';

@Component({
  selector: 'app-sale-product-select',
  standalone: true,
  imports: [CommonModule, FormsModule, SearchableSelectComponent],
  templateUrl: './sale-product-select.component.html',
  styleUrls: ['./sale-product-select.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SaleProductSelectComponent),
      multi: true
    }
  ]
})
export class SaleProductSelectComponent implements ControlValueAccessor, OnChanges, AfterViewInit, OnDestroy {
  @Input() options: any[] = [];
  @Input() labelKey = 'name';
  @Input() searchKeys: string[] = [];
  @Input() valueKey = 'id';
  @Input() placeholder = 'Select an option';
  @Input() searchPlaceholder = 'Search...';
  @Input() searchMode: 'filter' | 'jump' = 'filter';
  @Input() focusWidthPx?: number;
  @Input() maxHeight = '420px';
  @Input() virtualScroll = true;
  @Input() initialDisplayLimit = 100;
  @Input() productCodeField = 'productCode';

  @Output() searchFocus = new EventEmitter<void>();
  @Output() searchBlur = new EventEmitter<void>();
  @Output() productCodeMatched = new EventEmitter<{ code: string; value: any }>();
  @Output() productCodeNotFound = new EventEmitter<string>();

  @ViewChild('innerSelect') innerSelect?: SearchableSelectComponent;

  internalValue: any = null;
  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};
  private productCodeMap = new Map<string, any>();
  private barcodeKeyTimes: number[] = [];
  private keydownCaptureHandler = (event: KeyboardEvent) => this.onKeydownCapture(event);

  constructor(private elementRef: ElementRef<HTMLElement>) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options']) {
      this.productCodeMap = buildProductCodeMap(this.options, this.productCodeField);
    }
  }

  ngAfterViewInit(): void {
    this.elementRef.nativeElement.addEventListener('keydown', this.keydownCaptureHandler, true);
  }

  ngOnDestroy(): void {
    this.elementRef.nativeElement.removeEventListener('keydown', this.keydownCaptureHandler, true);
    this.barcodeKeyTimes = [];
  }

  writeValue(value: any): void {
    this.internalValue = value ?? null;
  }

  registerOnChange(fn: (value: any) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(_isDisabled: boolean): void {
    // SearchableSelectComponent does not expose disabled input.
  }

  get hostElement(): HTMLElement {
    return this.elementRef.nativeElement;
  }

  focus(): void {
    this.innerSelect?.focus();
  }

  focusAndOpen(): boolean {
    if (!this.innerSelect) {
      return false;
    }
    this.innerSelect.focusAndOpen();
    return true;
  }

  onInnerValueChange(value: any): void {
    this.internalValue = value;
    this.onChange(value);
    this.onTouched();
  }

  onInnerSelectionChange(_event: { value: any }): void {
    this.resetBarcodeKeyTimes();
  }

  private onKeydownCapture(event: KeyboardEvent): void {
    if (!this.isFocusInSearchInput()) {
      return;
    }

    if (event.key === 'Enter') {
      this.handleEnterKey(event);
      return;
    }

    const char = getBarcodeKeyChar(event);
    if (char) {
      this.barcodeKeyTimes.push(Date.now());
      if (this.barcodeKeyTimes.length > 50) {
        this.barcodeKeyTimes.shift();
      }
    }
  }

  private handleEnterKey(event: KeyboardEvent): void {
    const rawText = this.readSearchInputText();
    const result = tryProductFieldBarcodeEnter(
      rawText,
      this.barcodeKeyTimes,
      this.options,
      this.productCodeMap,
      [this.placeholder],
      this.productCodeField
    );

    if (!result) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.resetBarcodeKeyTimes();

    if (result.matched) {
      this.productCodeMatched.emit({
        code: result.code,
        value: result.matched[this.valueKey]
      });
      return;
    }

    this.productCodeNotFound.emit(result.code);
  }

  private isFocusInSearchInput(): boolean {
    const active = document.activeElement as HTMLElement | null;
    if (!active || !this.elementRef.nativeElement.contains(active)) {
      return false;
    }
    return active.classList.contains('search-input') || !!active.closest('.search-input');
  }

  private readSearchInputText(): string {
    const active = document.activeElement as HTMLElement | null;
    if (!active || !this.elementRef.nativeElement.contains(active)) {
      return '';
    }
    const inputEl = active.classList.contains('search-input')
      ? active
      : (active.closest('.search-input') as HTMLElement | null);
    if (!inputEl) {
      return '';
    }
    return (inputEl.textContent || inputEl.innerText || '').replace(/\u00a0/g, ' ');
  }

  private resetBarcodeKeyTimes(): void {
    this.barcodeKeyTimes = [];
  }
}
