import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PurchaseOrderComponent } from './purchase-order/purchase-order.component';
import { AddPurchaseOrderComponent } from './add-purchase-order/add-purchase-order.component';
import { PurchaseOrderItemPendingComponent } from './purchase-order-item-pending/purchase-order-item-pending.component';

const routes: Routes = [
  { path: '', component: PurchaseOrderComponent },
  { path: 'create', component: AddPurchaseOrderComponent },
  { path: 'edit/:id', component: AddPurchaseOrderComponent },
  { path: 'pending-item', component: PurchaseOrderItemPendingComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PurchaseOrderRoutingModule { }

