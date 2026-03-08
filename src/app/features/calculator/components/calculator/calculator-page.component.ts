import { Component, signal } from '@angular/core';
import { DerivativeResponse } from '../../../../models/derivative-response.model';
import { CalculatorApiService } from '../../../../core/services/calculator-api.service';

interface ButtonGroup {
  label: string;
  buttons: CalcButton[];
}

interface CalcButton {
  display: string;
  value: string;
  tooltip?: string;
  variant?: 'primary' | 'operator' | 'function' | 'control' | 'number';
}

@Component({
  selector: 'app-calculator-page',
  standalone: false,
  templateUrl: './calculator-page.component.html',
  styleUrls: ['./calculator-page.component.scss']
})
export class CalculatorPageComponent {
  expression = '';
  result = signal<DerivativeResponse | null>(null);
  derivatives = signal<DerivativeResponse[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  readonly buttonGroups: ButtonGroup[] = [
    {
      label: 'Variables',
      buttons: [
        { display: 'x', value: 'x', variant: 'primary', tooltip: 'Variable x' },
        { display: 'e', value: 'e', variant: 'primary', tooltip: "Euler's number" },
        { display: 'π', value: 'pi', variant: 'primary', tooltip: 'Pi' },
      ]
    },
    {
      label: 'Numbers',
      buttons: [
        { display: '7', value: '7', variant: 'number' },
        { display: '8', value: '8', variant: 'number' },
        { display: '9', value: '9', variant: 'number' },
        { display: '4', value: '4', variant: 'number' },
        { display: '5', value: '5', variant: 'number' },
        { display: '6', value: '6', variant: 'number' },
        { display: '1', value: '1', variant: 'number' },
        { display: '2', value: '2', variant: 'number' },
        { display: '3', value: '3', variant: 'number' },
        { display: '0', value: '0', variant: 'number' },
        { display: '.', value: '.', variant: 'number' },
      ]
    },
    {
      label: 'Operators',
      buttons: [
        { display: '+', value: '+', variant: 'operator' },
        { display: '−', value: '-', variant: 'operator' },
        { display: '×', value: '*', variant: 'operator' },
        { display: '÷', value: '/', variant: 'operator' },
        { display: '^', value: '^', variant: 'operator', tooltip: 'Power' },
        { display: '(', value: '(', variant: 'operator' },
        { display: ')', value: ')', variant: 'operator' },
      ]
    },
    {
      label: 'Trigonometric',
      buttons: [
        { display: 'sin', value: 'sin(', variant: 'function' },
        { display: 'cos', value: 'cos(', variant: 'function' },
        { display: 'tan', value: 'tan(', variant: 'function' },
        { display: 'cot', value: 'cot(', variant: 'function' },
        { display: 'sec', value: 'sec(', variant: 'function' },
        { display: 'csc', value: 'csc(', variant: 'function' },
      ]
    },
    {
      label: 'Inverse Trig',
      buttons: [
        { display: 'arcsin', value: 'arcsin(', variant: 'function' },
        { display: 'arccos', value: 'arccos(', variant: 'function' },
        { display: 'arctan', value: 'arctan(', variant: 'function' },
      ]
    },
    {
      label: 'Hyperbolic',
      buttons: [
        { display: 'sinh', value: 'sinh(', variant: 'function' },
        { display: 'cosh', value: 'cosh(', variant: 'function' },
        { display: 'tanh', value: 'tanh(', variant: 'function' },
        { display: 'coth', value: 'coth(', variant: 'function' },
        { display: 'sech', value: 'sech(', variant: 'function' },
        { display: 'csch', value: 'csch(', variant: 'function' },
      ]
    },
    {
      label: 'Logarithmic',
      buttons: [
        { display: 'ln', value: 'ln(', variant: 'function', tooltip: 'Natural log' },
        { display: 'log', value: 'log(', variant: 'function', tooltip: 'Log base 10' },
        { display: '√', value: 'sqrt(', variant: 'function', tooltip: 'Square root' },
        { display: '|x|', value: 'abs(', variant: 'function', tooltip: 'Absolute value' },
      ]
    },
  ];

  constructor(private calculatorApi: CalculatorApiService) {}

  appendToExpression(value: string): void {
    this.expression += value;
  }

  backspace(): void {
    this.expression = this.expression.slice(0, -1);
  }

  derivativeLabel(order: number): string {
    const primes = ["'", "''", "'''"];
    return order <= 3 ? `f${'\''.repeat(order)}(x)` : `f⁽${order}⁾(x)`;
  }

  clear(): void {
    this.expression = '';
    this.result.set(null);
    this.derivatives.set([]);
    this.error.set(null);
  }

  calculate(): void {
    if (!this.expression.trim()) return;
    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);
    this.derivatives.set([]);

    this.calculatorApi.getDerivative({ expression: this.expression, points: [0] }).subscribe({
      next: (response) => {
        this.result.set(response);
        this.derivatives.set([response]);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to compute derivative. Check your expression.');
        this.loading.set(false);
      }
    });
  }

  calculateNext(): void {
    const current = this.derivatives();
    if (!current.length) return;
    const nextInput = current[current.length - 1].antiderivative;

    this.loading.set(true);
    this.error.set(null);

    this.calculatorApi.getDerivative({ expression: nextInput, points: [0] }).subscribe({
      next: (response) => {
        this.derivatives.update(prev => [...prev, response]);
        this.result.set(response);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to compute derivative. Check your expression.');
        this.loading.set(false);
      }
    });
  }
}
