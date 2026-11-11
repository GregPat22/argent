/*
 * Renders the still drops used below the hero from the hero's own shader, so
 * every piece of metal on the page is the same material. It reads the shader
 * out of src/components/liquid-silver.tsx, draws a few small scenes in a
 * headless browser and writes transparent WebP files to public/liquid/.
 *
 * Run from website/ after changing the shader's look:
 *   node scripts/render-liquid-drops.cjs
 * It needs a GPU; software WebGL takes far longer.
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "src/components/liquid-silver.tsx"),
  "utf8",
);

const number = (name) => {
  const match = source.match(new RegExp(`const ${name} = ([0-9.]+)`));
  if (!match) throw new Error(`Constant ${name} not found`);
  return Number(match[1]);
};
const MASSES = number("MASSES");
const M = number("M");
const FREE = number("FREE");
const DROP0 = MASSES * M;
const N = DROP0 + MASSES + FREE;
const fixed = (name) => number(name).toFixed(2);
const template = (name) => {
  const match = source.match(new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`));
  if (!match) throw new Error(`Shader ${name} not found`);
  return match[1];
};
const fragment = template("FRAGMENT")
  .replace("${N}", N)
  .replace("${M}", M)
  .replace("${MASSES}", MASSES)
  .replace("${DROP0}", DROP0)
  .replace("${CAM_Z.toFixed(2)}", fixed("CAM_Z"))
  .replace("${SMOOTH_K.toFixed(2)}", fixed("SMOOTH_K"))
  .replace("${DROPLET_K.toFixed(2)}", fixed("DROPLET_K"))
  .replace("${FREE_K.toFixed(2)}", fixed("FREE_K"));
if (fragment.includes("${")) throw new Error("Unresolved shader constant");
const vertex = template("VERTEX");

/*
 * A scene is one mass (up to M bodies: [x, y, z, radius]) and free drops.
 * `tan` sets the zoom: the visible half height at z = 0 is CAM_Z * tan.
 */
const SCENES = [
  {
    name: "drop-large",
    size: 1100,
    tan: 0.3,
    env: [0.1, -0.04],
    time: 2.4,
    mass: [
      [0, -0.05, 0, 0.62],
      [0.3, 0.2, 0.05, 0.42],
      [-0.32, -0.2, 0.08, 0.4],
      [0.12, -0.38, 0, 0.36],
      [-0.22, 0.34, -0.05, 0.32],
      [0.99, 0.56, 0.12, 0.17],
      [0.8, 0.45, 0.1, 0.1],
      [0.68, 0.38, 0.08, 0.11],
      [0.56, 0.31, 0.06, 0.13],
    ],
    drops: [[-0.86, 0.78, 0.2, 0.085]],
  },
  {
    name: "drop-medium",
    size: 800,
    tan: 0.24,
    env: [-0.22, 0.05],
    time: 5.1,
    mass: [
      [0, 0, 0, 0.55],
      [-0.26, 0.16, 0.04, 0.38],
      [0.24, -0.2, 0.06, 0.36],
      [0.05, 0.3, 0, 0.3],
      [-0.1, -0.3, 0, 0.28],
    ],
    drops: [
      [0.62, 0.46, 0.1, 0.15],
      [0.82, 0.68, 0.16, 0.06],
    ],
  },
  {
    name: "drop-small",
    size: 360,
    tan: 0.09,
    env: [0.3, 0.02],
    time: 1.2,
    mass: [],
    drops: [[0, 0, 0, 0.3]],
  },
  {
    name: "drop-pair",
    size: 420,
    tan: 0.11,
    env: [-0.4, -0.03],
    time: 3.3,
    mass: [],
    drops: [
      [-0.08, -0.04, 0, 0.27],
      [0.26, 0.2, 0.05, 0.11],
    ],
  },
];

async function main() {
  const out = path.join(root, "public/liquid");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage();
  for (const scene of SCENES) {
    const data = await page.evaluate(
      ({ scene, fragment, vertex, N, M, MASSES, DROP0 }) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = scene.size;
        const gl = canvas.getContext("webgl", {
          alpha: true,
          antialias: false,
          preserveDrawingBuffer: true,
        });
        const compile = (type, text) => {
          const shader = gl.createShader(type);
          gl.shaderSource(shader, text);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw new Error(gl.getShaderInfoLog(shader));
          return shader;
        };
        const program = gl.createProgram();
        gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 3, -1, -1, 3]),
          gl.STATIC_DRAW,
        );
        const a = gl.getAttribLocation(program, "a");
        gl.enableVertexAttribArray(a);
        gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

        // Unused bodies sit far outside the frame with no radius.
        const blobs = new Float32Array(N * 4);
        for (let i = 0; i < N; i++) blobs.set([99, 99, 99, 0], i * 4);
        scene.mass.forEach((body, i) => blobs.set(body, i * 4));
        scene.drops.forEach((body, i) => blobs.set(body, (DROP0 + i) * 4));
        const bounds = new Float32Array(MASSES * 4);
        for (let g = 0; g < MASSES; g++) bounds.set([99, 99, 99, 0], g * 4);
        if (scene.mass.length) {
          let reach = 0;
          for (const [x, y, z, r] of scene.mass)
            reach = Math.max(reach, Math.hypot(x, y, z) + r);
          bounds.set([0, 0, 0, reach], 0);
        }
        const at = (name) => gl.getUniformLocation(program, name);
        gl.uniform2f(at("uRes"), scene.size, scene.size);
        gl.uniform1f(at("uTan"), scene.tan);
        gl.uniform1f(at("uTime"), scene.time);
        gl.uniform4fv(at("uB"), blobs);
        gl.uniform4fv(at("uG"), bounds);
        gl.uniform4f(at("uRip"), 0, 0, 0, 100);
        gl.uniform2f(at("uEnv"), scene.env[0], scene.env[1]);
        gl.viewport(0, 0, scene.size, scene.size);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.finish();
        return canvas.toDataURL("image/webp", 0.9);
      },
      { scene, fragment, vertex, N, M, MASSES, DROP0 },
    );
    const file = path.join(out, `${scene.name}.webp`);
    fs.writeFileSync(file, Buffer.from(data.split(",")[1], "base64"));
    console.log(`${scene.name}.webp  ${fs.statSync(file).size} bytes`);
  }
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
