import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as ort from 'onnxruntime-web';

@Component({
  selector: 'app-onnx-test',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding: 20px; font-family: monospace;">
      <h2>🔧 ONNX Runtime Test</h2>
      <div *ngIf="isTesting" style="color: orange;">⏳ Testing ONNX Runtime...</div>
      <div *ngIf="testResult" style="margin: 10px 0;">
        <div style="color: green;">✅ {{ testResult }}</div>
      </div>
      <div *ngIf="error" style="color: red; margin: 10px 0;">
        ❌ Error: {{ error }}
      </div>
      <button (click)="runTest()" [disabled]="isTesting" style="padding: 10px 20px; margin: 10px 0;">
        {{ isTesting ? 'Testing...' : 'Run ONNX Test' }}
      </button>
      <div *ngIf="details" style="background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 4px;">
        <strong>Details:</strong><br>
        <pre>{{ details }}</pre>
      </div>
    </div>
  `
})
export class OnnxTestComponent implements OnInit {
  isTesting = false;
  testResult = '';
  error = '';
  details = '';

  ngOnInit() {
    this.runTest();
  }

  async runTest() {
    this.isTesting = true;
    this.testResult = '';
    this.error = '';
    this.details = '';

    try {
      // Test 1: Check ONNX Runtime availability
      this.details += '1. Testing ONNX Runtime import...\n';
      if (typeof ort === 'undefined') {
        throw new Error('ONNX Runtime not available');
      }
      this.details += '   ✅ ONNX Runtime imported successfully\n';

      // Test 2: Check environment
      this.details += '2. Testing ONNX Environment...\n';
      this.details += `   WebAssembly support: ${typeof WebAssembly !== 'undefined'}\n`;
      this.details += `   SharedArrayBuffer support: ${typeof SharedArrayBuffer !== 'undefined'}\n`;
      this.details += `   ONNX versions: ${JSON.stringify(ort.env.versions)}\n`;

      // Test 3: Try to create a minimal session (without model)
      this.details += '3. Testing InferenceSession creation...\n';
      try {
        // This will fail because no model, but should show if WASM loading works
        await ort.InferenceSession.create('', { executionProviders: ['wasm'] });
      } catch (sessionError: any) {
        this.details += `   Session creation error (expected): ${sessionError.message}\n`;
        if (sessionError.message.includes('wasm')) {
          this.details += '   ⚠️  WASM loading issue detected\n';
        }
      }

      // Test 4: Check available backends
      this.details += '4. Testing execution providers...\n';
      const providers = ['webgl', 'wasm', 'cpu'];
      for (const provider of providers) {
        try {
          const testSession = await ort.InferenceSession.create('', {
            executionProviders: [provider]
          });
          this.details += `   ✅ ${provider} provider available\n`;
        } catch (provError) {
          this.details += `   ❌ ${provider} provider failed: ${(provError as Error).message}\n`;
        }
      }

      this.testResult = 'ONNX Runtime basic tests completed. Check details above.';
      this.details += '\n5. Test completed successfully\n';

    } catch (err: any) {
      this.error = err.message;
      this.details += `\n❌ Test failed: ${err.message}\n`;
    } finally {
      this.isTesting = false;
    }
  }
}
