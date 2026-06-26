import { Pipe, PipeTransform } from '@angular/core';
import { TransactionLabelService } from '../services/transaction-label.service';

@Pipe({
  name: 'txLabel',
  standalone: true,
  pure: true
})
export class TransactionLabelPipe implements PipeTransform {
  constructor(private txLabel: TransactionLabelService) {}

  transform(value: string | null | undefined): string {
    if (value == null || value === '') {
      return value ?? '';
    }
    return this.txLabel.swap(value);
  }
}
