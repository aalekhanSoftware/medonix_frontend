import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SaleComponent } from './sale/sale.component';
import { AddSaleComponent } from './add-sale/add-sale.component';
import { AddSaleReturnComponent } from './add-sale-return/add-sale-return.component';
import { SaleReturnListComponent } from './sale-return-list/sale-return-list.component';
import { SaleBillByProductComponent } from './sale-bill-by-product/sale-bill-by-product.component';

const routes: Routes = [
  { path: '', component: SaleComponent },
  { path: 'create', component: AddSaleComponent },
  { path: 'edit/:id', component: AddSaleComponent },
  { path: 'return', component: SaleReturnListComponent },
  { path: 'return/create', component: AddSaleReturnComponent },
  { path: 'return/:id', component: AddSaleReturnComponent },
  { path: 'by-product', component: SaleBillByProductComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SaleRoutingModule { }

