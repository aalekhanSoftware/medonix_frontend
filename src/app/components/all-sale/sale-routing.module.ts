import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SaleComponent } from './sale/sale.component';
import { AddSaleComponent } from './add-sale/add-sale.component';
import { AddSaleReturnComponent } from './add-sale-return/add-sale-return.component';
import { SaleReturnListComponent } from './sale-return-list/sale-return-list.component';

const routes: Routes = [
  { path: '', component: SaleComponent },
  { path: 'create', component: AddSaleComponent },
  { path: 'edit/:id', component: AddSaleComponent },
  { path: 'return', component: SaleReturnListComponent },
  { path: 'return/create', component: AddSaleReturnComponent },
  { path: 'return/:id', component: AddSaleReturnComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SaleRoutingModule { }

