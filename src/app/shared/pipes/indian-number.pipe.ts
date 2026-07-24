import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'indianNumber',
  standalone: true,
  pure: true
})
export class IndianNumberPipe implements PipeTransform {
  transform(value: any): string {
    if (value === null || value === undefined || value === '') return '';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return String(value);
    const parts = num.toFixed(2).split('.');
    const intPart = parts[0];
    const decPart = parts[1];
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    const groups: string[] = [last3];
    let remaining = rest;
    while (remaining.length > 0) {
      const take = remaining.length > 2 ? 2 : remaining.length;
      groups.unshift(remaining.slice(-take));
      remaining = remaining.slice(0, -take);
    }
    return groups.join(',') + '.' + decPart;
  }
}
