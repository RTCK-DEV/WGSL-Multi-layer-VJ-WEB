export const WGSL_LIB = `
const PI: f32 = 3.141592653589793;

fn saturate(x: f32) -> f32 {
  return clamp(x, 0.0, 1.0);
}

fn modf(x: f32, y: f32) -> f32 {
  return x - y * floor(x / y);
}

fn mod2(x: vec2f, y: vec2f) -> vec2f {
  return x - y * floor(x / y);
}

fn mod3(x: vec3f, y: vec3f) -> vec3f {
  return x - y * floor(x / y);
}

fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453123);
}

fn noise2(st: vec2f) -> f32 {
  let i = floor(st);
  let f = fract(st);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  let u = f * f * (vec2f(3.0) - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

fn fbm2(st0: vec2f) -> f32 {
  var st = st0;
  var v = 0.0;
  var a = 0.5;
  let shift = vec2f(100.0);
  let cs = cos(0.5);
  let sn = sin(0.5);
  for (var i = 0; i < 5; i = i + 1) {
    v = v + a * noise2(st);
    st = vec2f(cs * st.x - sn * st.y, sn * st.x + cs * st.y) * 2.0 + shift;
    a = a * 0.5;
  }
  return v;
}

fn rotate2d(p: vec2f, a: f32) -> vec2f {
  let s = sin(a);
  let c = cos(a);
  return vec2f(c * p.x - s * p.y, s * p.x + c * p.y);
}

fn sdBox3(p: vec3f, b: vec3f) -> f32 {
  let d = abs(p) - b;
  return length(max(d, vec3f(0.0))) + min(max(d.x, max(d.y, d.z)), 0.0);
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
  let kk = max(k, 0.0001);
  let h = clamp(0.5 + 0.5 * (b - a) / kk, 0.0, 1.0);
  return mix(b, a, h) - kk * h * (1.0 - h);
}

fn hsv2rgb(c: vec3f) -> vec3f {
  let p = abs(fract(c.xxx + vec3f(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - vec3f(3.0));
  return c.z * mix(vec3f(1.0), clamp(p - vec3f(1.0), vec3f(0.0), vec3f(1.0)), c.y);
}
`;
