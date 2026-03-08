import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  { path: '', redirectTo: 'calculator', pathMatch: 'full' },
  {
    path: 'calculator',
    loadChildren: () => import('./features/calculator/calculator.module').then(m => m.CalculatorModule)
  },
  { path: '**', redirectTo: 'calculator' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
