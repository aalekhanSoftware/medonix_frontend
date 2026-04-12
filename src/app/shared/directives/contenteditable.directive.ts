import { Directive, ElementRef, forwardRef, HostListener, Renderer2, OnInit } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Directive({
  selector: '[contenteditable][formControlName]',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ContentEditableDirective),
      multi: true
    }
  ]
})
export class ContentEditableDirective implements ControlValueAccessor, OnInit {
  private onChange!: (value: string) => void;
  private onTouched!: () => void;
  private lastValue: string = '';

  constructor(
    private elementRef: ElementRef,
    private renderer: Renderer2
  ) {}

  ngOnInit() {
    this.renderer.setAttribute(this.elementRef.nativeElement, 'contenteditable', 'true');
  }

  @HostListener('input')
  onInput(): void {
    const value = this.elementRef.nativeElement.innerHTML;
    if (value !== this.lastValue) {
      this.lastValue = value;
      this.onChange(value);
      this.onTouched();
    }
  }

  @HostListener('blur')
  onBlur(): void {
    this.onTouched();
  }

  writeValue(value: string): void {
    this.lastValue = value || '';
    this.renderer.setProperty(
      this.elementRef.nativeElement, 
      'innerHTML', 
      this.lastValue
    );
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.renderer.setProperty(
      this.elementRef.nativeElement, 
      'contentEditable', 
      !isDisabled
    );
  }
} 