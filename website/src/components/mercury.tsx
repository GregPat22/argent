"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0., 1.); }
`;

// One continuous, gently forged silver loop: conductivity as a material.
const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform vec2 uLight;
uniform float uTime;
out vec4 outColor;

mat2 rotate(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
float surface(vec3 p) {
  p.xy = rotate(-0.38 + sin(uTime * .13) * .1) * p.xy;
  p.yz = rotate(.96 + sin(uTime * .17) * .13) * p.yz;
  float angle = atan(p.z, p.x);
  float ring = .76 + .045 * sin(angle * 3. + uTime * .19);
  vec2 q = vec2(length(p.xz) - ring, p.y);
  q = rotate(angle * 1.5 + uTime * .07) * q;
  q.x *= .86;
  return length(q) - .235;
}
vec3 studio(vec3 r) {
  vec3 base = mix(vec3(.045,.055,.075), vec3(.25,.28,.33), smoothstep(-.6,.8,r.y));
  float overhead = smoothstep(.22,.36,r.y) * (1. - smoothstep(.65,.85,r.y));
  float strip = 1. - smoothstep(.02,.16,abs(r.x + .45));
  float horizon = 1. - smoothstep(.015,.065,abs(r.y + .08));
  float dark = smoothstep(.12,.26,r.x) * (1. - smoothstep(.42,.50,r.x));
  base += vec3(.80,.85,.92) * overhead;
  base += vec3(.95,.97,1.) * strip * .85;
  base += vec3(.55,.60,.68) * horizon;
  base *= 1. - dark * .8;
  float glint = pow(max(dot(r, normalize(vec3(uLight,1.))),0.),65.);
  return base + glint * .9;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 center = aspect > 1.1 ? vec2(.82,.51) : vec2(.5,.5);
  vec2 p = (uv - center) * vec2(aspect,1.) * 3.5;
  vec3 origin = vec3(0.,0.,3.7);
  vec3 ray = normalize(vec3(p,-3.7));
  // Skip rays outside the sculpture's bounding sphere.
  float b = dot(origin,ray);
  float discriminant = b*b - dot(origin,origin) + 1.3*1.3;
  if (discriminant < 0.) { outColor = vec4(0.); return; }
  float travel = max(0.,-b-sqrt(discriminant));
  float distanceToSurface = 1.;
  for (int i=0; i<64; i++) {
    distanceToSurface = surface(origin + ray*travel);
    if (distanceToSurface < .001 || travel > 5.) break;
    travel += distanceToSurface * .8;
  }
  if (distanceToSurface > .003) { outColor = vec4(0.); return; }
  vec3 point = origin + ray * travel;
  vec2 e = vec2(.001,0.);
  vec3 normal = normalize(vec3(surface(point+e.xyy)-surface(point-e.xyy),surface(point+e.yxy)-surface(point-e.yxy),surface(point+e.yyx)-surface(point-e.yyx)));
  vec3 reflection = reflect(ray,normal);
  vec3 color = studio(reflection);
  float fresnel = pow(1.-max(dot(normal,-ray),0.),3.);
  color += vec3(.14,.17,.22)*fresnel;
  color += .035 * max(dot(normal,normalize(vec3(-1.,2.,3.))),0.);
  outColor = vec4(pow(color,vec3(.92)),1.);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function Mercury({
  className = "",
  paused = false,
}: {
  className?: string;
  paused?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const time = useRef(4);
  const reduceMotion = useReducedMotion();
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      premultipliedAlpha: true,
    });
    if (!gl) {
      setSupported(false);
      return;
    }

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) {
      setSupported(false);
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setSupported(false);
      return;
    }
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, "uResolution");
    const uLight = gl.getUniformLocation(program, "uLight");
    const uTime = gl.getUniformLocation(program, "uTime");
    let elapsed = time.current;
    let pointerX = 0.25;
    let pointerY = 0.35;
    const light = { x: 0.25, y: 0.35 };
    let bounds = canvas.getBoundingClientRect();
    const resize = () => {
      bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        1.25,
        1200 / Math.max(bounds.width, bounds.height),
      );
      canvas.width = Math.max(1, Math.round(bounds.width * dpr));
      canvas.height = Math.max(1, Math.round(bounds.height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const step = (dt: number) => {
      elapsed += dt;
      time.current = elapsed;
      light.x += (pointerX - light.x) * Math.min(1, dt * 4);
      light.y += (pointerY - light.y) * Math.min(1, dt * 4);
    };
    const draw = () => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform2f(uLight, light.x, light.y);
      gl.uniform1f(uTime, elapsed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    resize();

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      pointerX = (event.clientX / window.innerWidth - 0.5) * 1.2;
      pointerY = (0.5 - event.clientY / window.innerHeight) * 1.2;
    };

    if (reduceMotion || paused) {
      draw();
      const observer = new ResizeObserver(() => {
        resize();
        draw();
      });
      observer.observe(canvas);
      return () => {
        observer.disconnect();
        gl.deleteProgram(program);
        gl.deleteBuffer(buffer);
      };
    }

    let frameId = 0;
    let last = performance.now();
    let visible = true;
    const loop = (now: number) => {
      frameId = requestAnimationFrame(loop);
      if (now - last < 1000 / 30) return;
      const dt = Math.min((now - last) / 1000, 1 / 15);
      last = now;
      step(dt);
      draw();
    };
    const start = () => {
      if (frameId || !visible || document.hidden) return;
      last = performance.now();
      frameId = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(frameId);
      frameId = 0;
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const visibility = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) start();
      else stop();
    });
    visibility.observe(canvas);
    const onVisibilityChange = () => (document.hidden ? stop() : start());

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    start();

    return () => {
      stop();
      resizeObserver.disconnect();
      visibility.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    };
  }, [reduceMotion, paused]);

  return (
    <div aria-hidden className={className}>
      {supported ? (
        <canvas ref={canvasRef} className="size-full" />
      ) : (
        <div className="silver-fallback" />
      )}
    </div>
  );
}
