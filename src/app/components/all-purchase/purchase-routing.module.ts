import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PurchaseComponent } from './purchase/purchase.component';
import { AddPurchaseComponent } from './add-purchase/add-purchase.component';
import { QcPurchaseComponent } from './qc-purchase/qc-purchase.component';
import { AddPurchaseReturnComponent } from './add-purchase-return/add-purchase-return.component';
import { AddStandalonePurchaseReturnComponent } from './add-standalone-purchase-return/add-standalone-purchase-return.component';
import { PurchaseReturnListComponent } from './purchase-return-list/purchase-return-list.component';

const routes: Routes = [
  { path: '', component: PurchaseComponent },
  { path: 'create', component: AddPurchaseComponent },
  { path: 'edit/:id', component: AddPurchaseComponent },
  { path: 'qc/:id', component: QcPurchaseComponent },
  { path: 'standalone-purchase-return/create', component: AddStandalonePurchaseReturnComponent },
  { path: 'standalone-purchase-return/:id', component: AddStandalonePurchaseReturnComponent },
  { path: 'return/:id', component: AddPurchaseReturnComponent },
  { path: 'return', component: PurchaseReturnListComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PurchaseRoutingModule { }