import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'round',
  standalone: true
})
export class RoundPipe implements PipeTransform {

  transform(value: number | undefined | null): number {
    if (value === undefined || value === null) {
      return 0; // or return any default value you prefer
    }
    return Math.round(value);
  }
}
