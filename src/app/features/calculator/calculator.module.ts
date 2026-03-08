import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { CalculatorPageComponent } from './components/calculator/calculator-page.component';
import { ResultsComponent } from './components/results/results.component';
import { GraphComponent } from './components/graph/graph.component';

const routes: Routes = [
  { path: '', component: CalculatorPageComponent }
];

@NgModule({
  declarations: [
    CalculatorPageComponent,
    ResultsComponent,
    GraphComponent,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild(routes),
  ]
})
export class CalculatorModule {}
