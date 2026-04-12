import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ProductBatchStockListComponent } from './product-batch-stock-list/product-batch-stock-list.component';
import { AddProductBatchStockComponent } from './add-product-batch-stock/add-product-batch-stock.component';

const routes: Routes = [
  { path: '', component: ProductBatchStockListComponent },
  { path: 'create', component: AddProductBatchStockComponent },
  { path: 'edit/:id', component: AddProductBatchStockComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ProductBatchStockRoutingModule { }
