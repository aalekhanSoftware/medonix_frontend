import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { QuotationComponent } from './quotation/quotation.component';
import { AddQuotationComponent } from './add-quotation/add-quotation.component';
import { DealerAddQuotationComponent } from './dealer-add-quotation/dealer-add-quotation.component';
import { OrderComponent } from './order/order.component';
import { DispatchQuotationComponent } from './dispatch-quotation/dispatch-quotation.component';
import { DispatchQuotationListComponent } from './dispatch-quotation-list/dispatch-quotation-list.component';
import { PendingItemComponent } from './pending-item/pending-item.component';

const routes: Routes = [
  { path: '', component: QuotationComponent },
  { path: 'create', component: AddQuotationComponent },
  { path: 'edit/:id', component: AddQuotationComponent },
  { path: 'dealer-order', component: DealerAddQuotationComponent },
  { path: 'order', component: OrderComponent },
  { path: 'dispatch', component: DispatchQuotationComponent },
  { path: 'dispatch-list', component: DispatchQuotationListComponent },
  { path: 'pending-item', component: PendingItemComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class QuotationRoutingModule { }