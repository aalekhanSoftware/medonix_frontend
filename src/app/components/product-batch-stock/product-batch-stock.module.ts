import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { ProductBatchStockRoutingModule } from './product-batch-stock-routing.module';
import { ProductBatchStockListComponent } from './product-batch-stock-list/product-batch-stock-list.component';
import { AddProductBatchStockComponent } from './add-product-batch-stock/add-product-batch-stock.component';

import { LoaderComponent } from '../../shared/components/loader/loader.component';
import { SearchableSelectComponent } from '../../shared/components/searchable-select/searchable-select.component';
import { PaginationComponent } from '../../shared/components/pagination/pagination.component';

@NgModule({
  declarations: [
    ProductBatchStockListComponent,
    AddProductBatchStockComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    ProductBatchStockRoutingModule,
    LoaderComponent,
    SearchableSelectComponent,
    PaginationComponent
  ]
})
export class ProductBatchStockModule { }
