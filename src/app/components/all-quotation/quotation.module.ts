import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { QuotationComponent } from './quotation/quotation.component';
import { AddQuotationComponent } from './add-quotation/add-quotation.component';
import { OrderComponent } from './order/order.component';
import { QuotationRoutingModule } from './quotation-routing.module';
import { PendingItemComponent } from './pending-item/pending-item.component';
import { DealerAddQuotationComponent } from './dealer-add-quotation/dealer-add-quotation.component';

@NgModule({
  declarations: [
  ],
  imports: [
    CommonModule,
    QuotationRoutingModule,
    QuotationComponent,
    AddQuotationComponent,
    DealerAddQuotationComponent,
    OrderComponent,
    PendingItemComponent
  ]
})
export class QuotationModule { }