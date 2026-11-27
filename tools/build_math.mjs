// Набор формул в HTML-анимации шрифтом Pagella (MathJax 4, вывод SVG).
//   node tools/build_math.mjs docs/файл.html
// - в каждый <span class="tex" data-tex="…"> (выключная формула — class="tex d") вставляет готовый SVG;
//   исходник остаётся в data-tex, поэтому повторный запуск безопасен: формулы пересобираются;
// - добавляет <style id="math-font"> с подмножеством Pagella Math (математический курсив, цифры, знаки)
//   для подписей в SVG-сцене (<text class="mf">);
// - добавляет <script id="mi-fn"> с функцией window.MI: латиница и греческие буквы → математический курсив Юникода.
// Нужны: npm install в папке tools и Python-пакет fonttools (pip install fonttools brotli).
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import MJ from 'mathjax';

const file = process.argv[2];
if (!file) { console.error('usage: node tools/build_math.mjs file.html'); process.exit(1); }
let html = fs.readFileSync(file, 'utf8');

const MathJax = await MJ.init({ loader: { load: ['input/tex', 'output/svg'] }, output: { font: 'mathjax-pagella' }, svg: { fontCache: 'none' } });
const adaptor = MathJax.startup.adaptor;
const unesc = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// 1. формулы
const re = /<span class="tex( d)?"([^>]*?)data-tex="([^"]*)"([^>]*)>[\s\S]*?<\/span>/g;
const jobs = [];
html.replace(re, (m, d, pre, tex) => { jobs.push({ m, d: !!d, tex: unesc(tex) }); return m; });
const out = new Map();
let errors = 0;
for (const j of jobs) {
  if (out.has(j.m)) continue;
  const node = await MathJax.tex2svgPromise(j.tex, { display: j.d });
  const svg = adaptor.innerHTML(node);
  if (/data-mjx-error|merror/.test(svg)) { console.error('Ошибка в формуле:', j.tex); errors++; }
  out.set(j.m, svg);
}
html = html.replace(re, (m, d, pre, tex, post) => `<span class="tex${d || ''}"${pre}data-tex="${tex}"${post}>${out.get(m)}</span>`);

// 2. функция MI
const MI = `window.MI = s => Array.from(s, ch => {
  const c = ch.codePointAt(0);
  if (c === 0x68) return '\\u210E';
  if (c >= 0x61 && c <= 0x7A) return String.fromCodePoint(0x1D44E + c - 0x61);
  if (c >= 0x41 && c <= 0x5A) return String.fromCodePoint(0x1D434 + c - 0x41);
  if (c >= 0x3B1 && c <= 0x3C9) return String.fromCodePoint(0x1D6FC + c - 0x3B1);
  if (c >= 0x391 && c <= 0x3A9) return String.fromCodePoint(0x1D6E2 + c - 0x391);
  return ch;
}).join('');`;

// 3. подмножество Pagella Math
const require = createRequire(import.meta.url);
const fontDir = path.join(path.dirname(require.resolve('@mathjax/mathjax-pagella-font/package.json')), 'chtml', 'woff2');
const cps = [];
for (let c = 0x1D434; c <= 0x1D467; c++) cps.push(c);      // курсив A–Z, a–z
cps.push(0x210E);
for (let c = 0x1D6E2; c <= 0x1D71B; c++) cps.push(c);      // курсив греческих
for (const ch of '0123456789.,:;/()[]+=<>−·√°′″%') cps.push(ch.codePointAt(0));
const tmp = path.join(fs.mkdtempSync('/tmp/mf-'), 'mf.woff2');
execFileSync('pyftsubset', [path.join(fontDir, 'mjx-gp-n.woff2'), '--unicodes=' + cps.map(c => 'U+' + c.toString(16)).join(','),
  '--flavor=woff2', '--output-file=' + tmp], { stdio: 'inherit' });
const b64 = fs.readFileSync(tmp).toString('base64');
const style = `<style id="math-font">@font-face{font-family:"Pagella Math MI";src:url(data:font/woff2;base64,${b64}) format("woff2");}</style>`;
const script = `<script id="mi-fn">${MI}</script>`;

html = html.replace(/<style id="math-font">[\s\S]*?<\/style>\n?/, '').replace(/<script id="mi-fn">[\s\S]*?<\/script>\n?/, '');
html = html.replace('</head>', `${style}\n${script}\n</head>`);
fs.writeFileSync(file, html);
console.log(`${file}: формул ${jobs.length}, ошибок ${errors}, шрифт ${Math.round(b64.length / 1024)} КБ`);
if (errors) process.exit(2);
