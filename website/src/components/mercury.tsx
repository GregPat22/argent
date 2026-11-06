"use client";

import { useReducedMotion } from "@/lib/use-reduced-motion";

import { useSpring } from "motion/react";
import { type RefObject, useEffect, useRef, useState } from "react";

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0., 1.); }
`;

// Original distance-field sculpture. Joined volumes flow rather than rotate as a rigid mesh.
const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uHover;
uniform float uTime;
out vec4 outColor;

float join(float a, float b, float k) {
  float h = max(k - abs(a-b), 0.) / k;
  return min(a,b) - h*h*k*.25;
}
float surface(vec3 p) {
  float t = uTime*.32;
  p.xy -= uPointer*.045*uHover;
  p.x += .045*sin(p.y*2.8+t);
  p.z += .04*sin(p.x*3.-t*.8);
  // An uneven liquid loop and two joining drops leave a sculpted dark centre.
  vec3 q=p;
  float turn=-.45+.08*sin(t*.6);
  q.xy=mat2(cos(turn),-sin(turn),sin(turn),cos(turn))*q.xy;
  q.yz=mat2(.90,-.435,.435,.90)*q.yz;
  float angle=atan(q.y,q.x);
  float radius=.60+.055*sin(angle*3.+t*.7);
  float thickness=.19+.055*sin(angle*2.-t*.6)+.025*cos(angle*3.+t);
  float d=length(vec2(length(q.xy/vec2(.93,1.09))-radius,q.z))-thickness;
  d=join(d,length(q-vec3(-.43,.35,.01))-(.26+.03*sin(t)),.22);
  d=join(d,length(q-vec3(.43,-.31,.02))-(.27+.035*cos(t*.8)),.20);
  // A spring-following lobe pulls out of the surface under the cursor.
  if (uHover > .001) {
    vec3 pull = vec3(uPointer*.68, .44);
    d = join(d, length(p-pull)-(.13+.13*uHover), .30*uHover+.03);
  }
  return d;
}
float softbox(vec3 ray, vec3 direction, float inner, float outer) {
  return smoothstep(outer,inner,dot(ray,normalize(direction)));
}
vec3 studio(vec3 r) {
  // Broad white cards and dark flags give polished silver a legible surface.
  vec3 c = mix(vec3(.003,.005,.009), vec3(.08,.10,.14), smoothstep(-.8,.9,r.y));
  float key = softbox(r,vec3(-.6,1.1,1.2),.91,.84);
  float fill = softbox(r,vec3(.9,.25,.6),.97,.90);
  float strip = exp(-pow((r.x+.42)/.105,2.)) * smoothstep(-.6,.4,r.y);
  float horizon = exp(-pow((r.y+.18)/.035,2.));
  float flag = smoothstep(.08,.20,r.x) * (1.-smoothstep(.35,.47,r.x));
  c += vec3(2.6,2.65,2.7)*key + vec3(1.8,1.9,2.05)*fill;
  c += vec3(1.5)*strip + vec3(.7)*horizon;
  float overhead=smoothstep(.24,.29,r.y)*(1.-smoothstep(.69,.74,r.y));
  c+=vec3(2.2,2.3,2.45)*overhead;
  return c*(1.-flag*.96);
}
void main() {
  vec2 uv = gl_FragCoord.xy/uResolution;
  float aspect = uResolution.x/uResolution.y;
  vec2 center = aspect > 1.1 ? vec2(.81,.52) : vec2(.5,.5);
  vec2 p = (uv-center)*vec2(aspect,1.)*3.45;
  vec3 origin = vec3(0.,0.,3.8);
  vec3 ray = normalize(vec3(p,-3.8));
  float b = dot(origin,ray);
  float bound = b*b-dot(origin,origin)+1.5*1.5;
  if (bound < 0.) { outColor=vec4(0.); return; }
  float travel = max(0.,-b-sqrt(bound));
  float distanceToSurface=1.;
  float closest=1.;
  for(int i=0;i<72;i++) {
    distanceToSurface=surface(origin+ray*travel);
    closest=min(closest,distanceToSurface);
    if(distanceToSurface<.0008 || travel>5.5) break;
    travel+=distanceToSurface*.75;
  }
  if(distanceToSurface>.002) { outColor=vec4(0.); return; }
  vec3 point=origin+ray*travel;
  vec2 e=vec2(.001,0.);
  vec3 normal=normalize(vec3(surface(point+e.xyy)-surface(point-e.xyy),surface(point+e.yxy)-surface(point-e.yxy),surface(point+e.yyx)-surface(point-e.yyx)));
  vec3 reflection=reflect(ray,normal);
  vec3 color=studio(reflection);
  float facing=max(dot(normal,-ray),0.);
  float fresnel=pow(1.-facing,4.);
  color+=vec3(.035,.045,.06)*fresnel;
  color*=.86+.14*smoothstep(-.8,.6,point.y);
  color=color/(color+vec3(.75));
  color=pow(color,vec3(.4545));
  // An edge footprint softens the ray-marched silhouette without supersampling.
  float edge=1.-smoothstep(.0008,.002,closest);
  outColor=vec4(color*edge,edge);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function Mercury({
  className = "",
  paused = false,
  interactionRef,
}: {
  className?: string;
  paused?: boolean;
  interactionRef: RefObject<HTMLElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const time = useRef(4);
  const reduce = useReducedMotion();
  const [supported, setSupported] = useState(true);
  const pointerX = useSpring(0, { stiffness: 85, damping: 19, mass: 0.7 });
  const pointerY = useSpring(0, { stiffness: 85, damping: 19, mass: 0.7 });
  const presence = useSpring(0, { stiffness: 70, damping: 17 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const interaction = interactionRef.current;
    if (!canvas || !interaction) return;
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
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      if (program) gl.deleteProgram(program);
      setSupported(false);
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      setSupported(false);
      return;
    }
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
    const resolution = gl.getUniformLocation(program, "uResolution");
    const pointer = gl.getUniformLocation(program, "uPointer");
    const hover = gl.getUniformLocation(program, "uHover");
    const clock = gl.getUniformLocation(program, "uTime");
    let frame = 0;
    let visible = false;
    let last = 0;
    const draw = () => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform2f(
        pointer,
        reduce || paused ? 0 : pointerX.get(),
        reduce || paused ? 0 : pointerY.get(),
      );
      gl.uniform1f(hover, reduce || paused ? 0 : presence.get());
      gl.uniform1f(clock, time.current);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(
        devicePixelRatio || 1,
        1.5,
        1400 / Math.max(rect.width, rect.height),
      );
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      draw();
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (now - last < 1000 / 30) return;
      time.current += Math.min((now - last) / 1000, 1 / 15);
      last = now;
      draw();
    };
    const start = () => {
      if (frame || !visible || document.hidden || reduce || paused) return;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    };
    const leave = () => {
      presence.set(0);
      pointerX.set(0);
      pointerY.set(0);
    };
    const move = (event: PointerEvent) => {
      if (reduce || paused || event.pointerType !== "mouse") return;
      const rect = canvas.getBoundingClientRect();
      const aspect = rect.width / rect.height;
      const center = aspect > 1.1 ? 0.81 : 0.5;
      const x =
        ((event.clientX - rect.left) / rect.width - center) * aspect * 3.45;
      const centerY = aspect > 1.1 ? 0.52 : 0.5;
      const y = (centerY - (event.clientY - rect.top) / rect.height) * 3.45;
      const inside =
        x * x + y * y < 1.8 &&
        event.clientY > rect.top &&
        event.clientY < rect.bottom;
      presence.set(inside ? 1 : 0);
      pointerX.set(Math.max(-1.1, Math.min(1.1, x)));
      pointerY.set(Math.max(-1.1, Math.min(1.1, y)));
    };
    const visibility = () => {
      if (document.hidden) {
        stop();
        leave();
      } else start();
    };
    const resizeObserver = new ResizeObserver(resize);
    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) start();
      else {
        stop();
        leave();
      }
    });
    resize();
    resizeObserver.observe(canvas);
    observer.observe(canvas);
    interaction.addEventListener("pointermove", move, { passive: true });
    interaction.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", visibility);
    const lost = (event: Event) => {
      event.preventDefault();
      stop();
      setSupported(false);
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => {
      stop();
      resizeObserver.disconnect();
      observer.disconnect();
      interaction.removeEventListener("pointermove", move);
      interaction.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("webglcontextlost", lost);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [reduce, paused, interactionRef, pointerX, pointerY, presence, supported]);

  return (
    <div aria-hidden className={className} data-silver-sculpture>
      {supported ? (
        <canvas ref={canvasRef} className="size-full" />
      ) : (
        <div className="silver-fallback" />
      )}
    </div>
  );
}
