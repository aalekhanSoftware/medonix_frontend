import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PurchaseChallanComponent } from './purchase-challan/purchase-challan.component';
import { AddPurchaseChallanComponent } from './add-purchase-challan/add-purchase-challan.component';
import { QcPurchaseChallanComponent } from './qc-purchase-challan/qc-purchase-challan.component';

const routes: Routes = [
  { path: '', component: PurchaseChallanComponent },
  { path: 'create', component: AddPurchaseChallanComponent },
  { path: 'edit/:id', component: AddPurchaseChallanComponent },
  { path: 'qc/:id', component: QcPurchaseChallanComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PurchaseChallanRoutingModule { }

