/** GPU uniform parameter packing for shader layer params. */
import type { ShaderParamDef, ShaderParamType } from '../core/types.js';

export interface PackedParamMember {
  name: string;
  type: ShaderParamType;
  offset: number;
  byteSize: number;
  storageByteSize: number;
  alignment: number;
  components: number;
}

export interface PackedParamLayout {
  members: PackedParamMember[];
  byteSize: number;
  minBindingSize: number;
}

const TYPE_INFO: Record<ShaderParamType, { byteSize: number; storageByteSize: number; alignment: number; components: number }> = {
  f32: { byteSize: 4, storageByteSize: 4, alignment: 4, components: 1 },
  vec2: { byteSize: 8, storageByteSize: 8, alignment: 8, components: 2 },
  vec3: { byteSize: 12, storageByteSize: 16, alignment: 16, components: 3 },
  color: { byteSize: 12, storageByteSize: 16, alignment: 16, components: 3 },
};

function alignTo(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function assertFiniteNumber(value: unknown, paramName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Shader param "${paramName}" must be a finite number.`);
  }
  return value;
}

function normalizeValue(def: ShaderParamDef, value: number | number[], name: string): number[] {
  const info = TYPE_INFO[def.type];
  if (info.components === 1) {
    return [assertFiniteNumber(value, name)];
  }

  if (!Array.isArray(value)) {
    throw new TypeError(`Shader param "${name}" must be an array with ${info.components} numbers.`);
  }

  if (value.length < info.components) {
    throw new RangeError(`Shader param "${name}" requires ${info.components} components, got ${value.length}.`);
  }

  return value.slice(0, info.components).map(component => assertFiniteNumber(component, name));
}

export function createParamLayout(params: Record<string, ShaderParamDef>): PackedParamLayout {
  const members: PackedParamMember[] = [];
  let offset = 0;
  let maxAlignment = 16;

  for (const [name, def] of Object.entries(params)) {
    const info = TYPE_INFO[def.type];
    offset = alignTo(offset, info.alignment);
    members.push({
      name,
      type: def.type,
      offset,
      byteSize: info.byteSize,
      storageByteSize: info.storageByteSize,
      alignment: info.alignment,
      components: info.components,
    });
    offset += info.storageByteSize;
    maxAlignment = Math.max(maxAlignment, info.alignment);
  }

  const byteSize = Math.max(16, alignTo(offset, maxAlignment));
  return { members, byteSize, minBindingSize: byteSize };
}

export class ParamPacker {
  readonly layout: PackedParamLayout;
  readonly buffer: ArrayBuffer;
  readonly floatView: Float32Array;

  private readonly params: Record<string, ShaderParamDef>;
  private readonly memberByName = new Map<string, PackedParamMember>();
  private dirtyValue = true;

  constructor(params: Record<string, ShaderParamDef>, initialValues: Record<string, number | number[]> = {}) {
    this.params = params;
    this.layout = createParamLayout(params);
    this.buffer = new ArrayBuffer(this.layout.byteSize);
    this.floatView = new Float32Array(this.buffer);

    for (const member of this.layout.members) {
      this.memberByName.set(member.name, member);
      this.setParam(member.name, initialValues[member.name] ?? params[member.name]?.default);
    }
    this.dirtyValue = true;
  }

  get dirty(): boolean {
    return this.dirtyValue;
  }

  clearDirty(): void {
    this.dirtyValue = false;
  }

  setAll(values: Record<string, number | number[]>): void {
    for (const member of this.layout.members) {
      this.setParam(member.name, values[member.name] ?? this.params[member.name]?.default);
    }
  }

  setParam(name: string, value: number | number[] | undefined): void {
    const member = this.memberByName.get(name);
    const def = this.params[name];
    if (!member || !def) {
      throw new ReferenceError(`Unknown shader param "${name}".`);
    }
    if (value === undefined) {
      throw new TypeError(`Shader param "${name}" has no value or default.`);
    }

    const normalized = normalizeValue(def, value, name);
    const floatOffset = member.offset / Float32Array.BYTES_PER_ELEMENT;

    for (let i = 0; i < member.storageByteSize / Float32Array.BYTES_PER_ELEMENT; i += 1) {
      this.floatView[floatOffset + i] = 0;
    }
    for (let i = 0; i < normalized.length; i += 1) {
      this.floatView[floatOffset + i] = normalized[i] ?? 0;
    }
    this.dirtyValue = true;
  }
}
