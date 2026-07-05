/** Shader validation diagnostics with user-body line number correction. */
import type { ShaderDiagnostic, ShaderParamDef } from '../core/types.js';
import { buildShaderBodyForValidation } from './shader-builder.js';

function diagnosticSeverity(type: GPUCompilationMessageType): ShaderDiagnostic['severity'] {
  if (type === 'error') {
    return 'error';
  }
  if (type === 'warning') {
    return 'warning';
  }
  return 'info';
}

export async function validateShader(
  device: GPUDevice,
  body: string,
  params: Record<string, ShaderParamDef> = {},
): Promise<ShaderDiagnostic[]> {
  const built = buildShaderBodyForValidation(body, params);
  const module = device.createShaderModule({ code: built.wgsl });
  const info = await module.getCompilationInfo();

  return info.messages
    .map(message => ({
      line: Math.max(1, message.lineNum - built.preambleLineCount),
      column: Math.max(1, message.linePos),
      length: Math.max(1, message.length),
      message: message.message,
      severity: diagnosticSeverity(message.type),
    }))
    .filter(message => message.line >= 1);
}
