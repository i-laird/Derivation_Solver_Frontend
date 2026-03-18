import { Component, signal, AfterViewChecked, OnDestroy, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { DerivativeResponse } from '../../../../models/derivative-response.model';
import { CalculatorApiService } from '../../../../core/services/calculator-api.service';
import { Chart, registerables } from 'chart.js';
import { evaluate } from 'mathjs';

Chart.register(...registerables);

interface VariableEntry {
  key: string;
  value: number;
}

interface EquationEntry {
  expression: string;
  withRespectTo: string;
  variables: VariableEntry[];
  result: DerivativeResponse | null;
  derivatives: DerivativeResponse[];
  loading: boolean;
  error: string | null;
  withRespectToError: string | null;
}

interface JacobianCell {
  expression: string;
  value: number | null;
  loading: boolean;
  error: string | null;
}

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

const JAC_COLORS = ['#e91e63', '#4caf50', '#ff9800', '#9c27b0', '#00bcd4', '#795548'];

@Component({
  selector: 'app-calculator-page',
  standalone: false,
  templateUrl: './calculator-page.component.html',
  styleUrls: ['./calculator-page.component.scss']
})
export class CalculatorPageComponent implements AfterViewChecked, OnDestroy {
  @ViewChildren('jacobianCanvas') jacobianCanvases!: QueryList<ElementRef<HTMLCanvasElement>>;
  private jacobianChartInstances: Chart[] = [];
  private pendingJacobianRender = false;
  equations = signal<EquationEntry[]>([this.createEquation()]);
  activeEquationIndex = signal(0);
  jacobianMatrix = signal<JacobianCell[][] | null>(null);
  jacobianVariables = signal<string[]>([]);
  jacobianLoading = signal(false);

  readonly buttonGroups: ButtonGroup[] = [
    {
      label: 'Variables',
      buttons: [
        { display: 'x', value: 'x', variant: 'primary', tooltip: 'Variable x' },
        { display: 'y', value: 'y', variant: 'primary', tooltip: 'Variable y' },
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

  private createEquation(): EquationEntry {
    return {
      expression: '',
      withRespectTo: 'x',
      variables: [{ key: 'x', value: 0 }],
      result: null,
      derivatives: [],
      loading: false,
      error: null,
      withRespectToError: null,
    };
  }

  addEquation(): void {
    this.equations.update(eqs => [...eqs, this.createEquation()]);
    this.activeEquationIndex.set(this.equations().length - 1);
  }

  removeEquation(index: number): void {
    this.equations.update(eqs => eqs.filter((_, i) => i !== index));
    const current = this.activeEquationIndex();
    if (current >= this.equations().length) {
      this.activeEquationIndex.set(this.equations().length - 1);
    } else if (current === index && index > 0) {
      this.activeEquationIndex.set(index - 1);
    }
  }

  setActiveEquation(index: number): void {
    this.activeEquationIndex.set(index);
  }

  appendToExpression(value: string): void {
    const idx = this.activeEquationIndex();
    this.equations.update(eqs => {
      const updated = [...eqs];
      updated[idx] = { ...updated[idx], expression: updated[idx].expression + value };
      return updated;
    });
    this.syncVariables(idx, this.equations()[idx].expression);
  }

  backspaceForIndex(index: number): void {
    this.equations.update(eqs => {
      const updated = [...eqs];
      updated[index] = { ...updated[index], expression: updated[index].expression.slice(0, -1) };
      return updated;
    });
  }

  clearForIndex(index: number): void {
    this.equations.update(eqs => {
      const updated = [...eqs];
      updated[index] = {
        ...updated[index],
        expression: '',
        result: null,
        derivatives: [],
        error: null,
        withRespectToError: null,
      };
      return updated;
    });
  }

  addVariable(equationIndex: number): void {
    this.equations.update(eqs => {
      const updated = [...eqs];
      const eq = { ...updated[equationIndex] };
      eq.variables = [...eq.variables, { key: '', value: 0 }];
      updated[equationIndex] = eq;
      return updated;
    });
  }

  removeVariable(equationIndex: number, varIndex: number): void {
    this.equations.update(eqs => {
      const updated = [...eqs];
      const eq = { ...updated[equationIndex] };
      eq.variables = eq.variables.filter((_, i) => i !== varIndex);
      updated[equationIndex] = eq;
      return updated;
    });
  }

  updateVariableKey(equationIndex: number, varIndex: number, key: string): void {
    this.equations.update(eqs => {
      const updated = [...eqs];
      const eq = { ...updated[equationIndex] };
      const vars = [...eq.variables];
      vars[varIndex] = { ...vars[varIndex], key };
      eq.variables = vars;
      updated[equationIndex] = eq;
      return updated;
    });
  }

  updateVariableValue(equationIndex: number, varIndex: number, value: number): void {
    this.equations.update(eqs => {
      const updated = [...eqs];
      const eq = { ...updated[equationIndex] };
      const vars = [...eq.variables];
      vars[varIndex] = { ...vars[varIndex], value };
      eq.variables = vars;
      updated[equationIndex] = eq;
      return updated;
    });
  }

  updateWithRespectTo(equationIndex: number, value: string): void {
    this.equations.update(eqs => {
      const updated = [...eqs];
      const eq = { ...updated[equationIndex] };
      eq.withRespectTo = value;
      eq.withRespectToError = value.length > 0 && !/^[a-zA-Z]$/.test(value)
        ? 'Must be a single letter (e.g. x, y)'
        : null;
      updated[equationIndex] = eq;
      return updated;
    });
  }

  updateExpression(equationIndex: number, value: string): void {
    this.equations.update(eqs => {
      const updated = [...eqs];
      updated[equationIndex] = { ...updated[equationIndex], expression: value };
      return updated;
    });
    this.syncVariables(equationIndex, value);
  }

  private static readonly KNOWN_FUNCTIONS =
    /\b(sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|sech|csch|coth|arcsin|arccos|arctan|arcsec|arccsc|arccot|ln|log|sqrt|abs)\b/g;

  private extractVariables(expression: string): string[] {
    const cleaned = expression.replace(CalculatorPageComponent.KNOWN_FUNCTIONS, '');
    const matches = cleaned.match(/[a-z]/g);
    return matches ? [...new Set(matches)] : [];
  }

  private syncVariables(equationIndex: number, expression: string): void {
    const detected = this.extractVariables(expression);
    this.equations.update(eqs => {
      const updated = [...eqs];
      const eq = { ...updated[equationIndex] };
      const existingKeys = new Set(eq.variables.map(v => v.key.trim()));
      const toAdd = detected.filter(v => !existingKeys.has(v));
      if (toAdd.length > 0) {
        eq.variables = [...eq.variables, ...toAdd.map(k => ({ key: k, value: 0 }))];
        updated[equationIndex] = eq;
      }
      return updated;
    });
  }

  private buildPoints(variables: VariableEntry[]): { [key: string]: number } {
    const points: { [key: string]: number } = {};
    for (const v of variables) {
      if (v.key.trim()) {
        points[v.key.trim()] = v.value;
      }
    }
    return points;
  }

  calculateForIndex(index: number): void {
    const eq = this.equations()[index];
    if (!eq.expression.trim()) return;
    if (!/^[a-zA-Z]$/.test(eq.withRespectTo)) {
      this.equations.update(eqs => {
        const updated = [...eqs];
        updated[index] = {
          ...updated[index],
          withRespectToError: 'Must be a single letter (e.g. x, y)',
        };
        return updated;
      });
      return;
    }

    this.equations.update(eqs => {
      const updated = [...eqs];
      updated[index] = {
        ...updated[index],
        loading: true,
        error: null,
        result: null,
        derivatives: [],
      };
      return updated;
    });

    const request = {
      expression: eq.expression,
      withRespectTo: eq.withRespectTo,
      points: this.buildPoints(eq.variables),
    };

    this.calculatorApi.getDerivative(request).subscribe({
      next: (response) => {
        this.equations.update(eqs => {
          const updated = [...eqs];
          updated[index] = {
            ...updated[index],
            result: response,
            derivatives: [response],
            loading: false,
          };
          return updated;
        });
      },
      error: (err) => {
        this.equations.update(eqs => {
          const updated = [...eqs];
          updated[index] = {
            ...updated[index],
            error: err?.error?.message || 'Failed to compute derivative. Check your expression.',
            loading: false,
          };
          return updated;
        });
      }
    });
  }

  calculateNextForIndex(index: number): void {
    const eq = this.equations()[index];
    if (!eq.derivatives.length) return;
    const nextInput = eq.derivatives[eq.derivatives.length - 1].antiderivative;

    this.equations.update(eqs => {
      const updated = [...eqs];
      updated[index] = { ...updated[index], loading: true, error: null };
      return updated;
    });

    const request = {
      expression: nextInput,
      withRespectTo: eq.withRespectTo,
      points: this.buildPoints(eq.variables),
    };

    this.calculatorApi.getDerivative(request).subscribe({
      next: (response) => {
        this.equations.update(eqs => {
          const updated = [...eqs];
          const prevDerivatives = updated[index].derivatives;
          updated[index] = {
            ...updated[index],
            result: response,
            derivatives: [...prevDerivatives, response],
            loading: false,
          };
          return updated;
        });
      },
      error: (err) => {
        this.equations.update(eqs => {
          const updated = [...eqs];
          updated[index] = {
            ...updated[index],
            error: err?.error?.message || 'Failed to compute derivative. Check your expression.',
            loading: false,
          };
          return updated;
        });
      }
    });
  }

  derivativeLabel(order: number): string {
    return order <= 3 ? `f${'\''.repeat(order)}(x)` : `f⁽${order}⁾(x)`;
  }

  trackByIndex(index: number): number {
    return index;
  }

  computeJacobian(): void {
    const eqs = this.equations();
    const validEqs = eqs.filter(eq => eq.expression.trim());
    if (!validEqs.length) return;

    // Collect all unique variables across all equations
    const allVars = [...new Set(
      validEqs.flatMap(eq => this.extractVariables(eq.expression))
    )].sort();

    if (!allVars.length) return;

    this.jacobianVariables.set(allVars);
    this.jacobianLoading.set(true);

    // Initialise all cells as loading
    const matrix: JacobianCell[][] = validEqs.map(() =>
      allVars.map(() => ({ expression: '', value: null, loading: true, error: null }))
    );
    this.jacobianMatrix.set(matrix);

    // Fire one request per cell
    let pending = validEqs.length * allVars.length;
    validEqs.forEach((eq, row) => {
      allVars.forEach((variable, col) => {
        const request = {
          expression: eq.expression,
          withRespectTo: variable,
          points: this.buildPoints(eq.variables),
        };
        this.calculatorApi.getDerivative(request).subscribe({
          next: (response) => {
            this.jacobianMatrix.update(m => {
              if (!m) return m;
              const updated = m.map(r => [...r]);
              updated[row][col] = {
                expression: response.antiderivative,
                value: response.result,
                loading: false,
                error: null,
              };
              return updated;
            });
            if (--pending === 0) { this.jacobianLoading.set(false); this.pendingJacobianRender = true; }
          },
          error: (err) => {
            this.jacobianMatrix.update(m => {
              if (!m) return m;
              const updated = m.map(r => [...r]);
              updated[row][col] = {
                expression: '',
                value: null,
                loading: false,
                error: err?.error?.message || 'Error',
              };
              return updated;
            });
            if (--pending === 0) { this.jacobianLoading.set(false); this.pendingJacobianRender = true; }
          }
        });
      });
    });
  }

  clearJacobian(): void {
    this.destroyJacobianCharts();
    this.jacobianMatrix.set(null);
    this.jacobianVariables.set([]);
  }

  ngAfterViewChecked(): void {
    if (this.pendingJacobianRender && this.jacobianCanvases?.length) {
      this.pendingJacobianRender = false;
      this.renderJacobianCharts();
    }
  }

  ngOnDestroy(): void {
    this.destroyJacobianCharts();
  }

  private destroyJacobianCharts(): void {
    this.jacobianChartInstances.forEach(c => c.destroy());
    this.jacobianChartInstances = [];
  }

  private renderJacobianCharts(): void {
    this.destroyJacobianCharts();
    const matrix = this.jacobianMatrix();
    const variables = this.jacobianVariables();
    const eqs = this.equations().filter(eq => eq.expression.trim());
    if (!matrix || !variables.length || !this.jacobianCanvases.length) return;

    const xValues: number[] = [];
    for (let i = -50; i <= 50; i++) xValues.push(i / 10);

    this.jacobianCanvases.forEach((canvasRef, colIdx) => {
      const variable = variables[colIdx];
      const datasets = matrix.map((row, rowIdx) => {
        const cell = row[colIdx];
        if (cell.error || cell.loading || !cell.expression) return null;
        const eq = eqs[rowIdx];
        const fixedScope: { [key: string]: number } = {};
        for (const v of eq.variables) {
          if (v.key.trim() && v.key.trim() !== variable) fixedScope[v.key.trim()] = v.value;
        }
        const expr = this.repairExprForMathjs(cell.expression);
        const data = xValues.map(t => {
          try {
            const result = evaluate(expr, { ...fixedScope, [variable]: t });
            if (typeof result !== 'number' || !isFinite(result) || Math.abs(result) > 50) return null;
            return result;
          } catch { return null; }
        });
        const color = JAC_COLORS[rowIdx % JAC_COLORS.length];
        return { label: `∂f${rowIdx + 1}/∂${variable}`, data, borderColor: color,
          backgroundColor: color + '14', borderWidth: 2, tension: 0.3, pointRadius: 0, spanGaps: false };
      }).filter(Boolean);

      if (!datasets.length) return;
      this.jacobianChartInstances.push(new Chart(canvasRef.nativeElement, {
        type: 'line',
        data: { labels: xValues.map(x => x.toFixed(1)), datasets: datasets as any },
        options: {
          responsive: true, maintainAspectRatio: true, animation: { duration: 300 },
          plugins: {
            legend: { position: 'top', labels: { font: { family: 'Roboto', size: 12 }, usePointStyle: true } },
            title: { display: true, text: `∂f / ∂${variable}`, font: { size: 14 } },
          },
          scales: {
            x: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { maxTicksLimit: 11,
              callback: (_val: any, i: number) => xValues[i] % 1 === 0 ? xValues[i].toString() : '' } },
            y: { min: -10, max: 10, grid: { color: 'rgba(0,0,0,0.06)' } },
          }
        }
      }));
    });
  }

  private repairExprForMathjs(expr: string): string {
    return expr
      .replace(/\^\s*\(\s*1\s*\)/g, '')
      .replace(/\*\s*\*/g, '*')
      .replace(/\*\s*1\b/g, '')
      .replace(/\b1\s*\*/g, '')
      .replace(/\barcsin\(/g, 'asin(')
      .replace(/\barccos\(/g, 'acos(')
      .replace(/\barctan\(/g, 'atan(')
      .replace(/\bln\(/g, 'log(')
      .replace(/\s+/g, ' ')
      .trim();
  }

  get jacobianEquationLabels(): string[] {
    return this.equations()
      .filter(eq => eq.expression.trim())
      .map((eq, i) => `f${i + 1}`);
  }
}
