import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'serialNumber',
  standalone: true,
  pure: true
})
export class SerialNumberPipe implements PipeTransform {
  transform(index: number): number {
    return index + 1;
  }
}
