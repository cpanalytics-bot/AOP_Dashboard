// Convert ARCHITECTURE_AND_FLOW.md -> a styled, print-ready HTML file.
// Mermaid code blocks are emitted as <div class="mermaid"> so the browser
// renders them; everything else uses marked. Edge then prints it to PDF.
import { readFileSync, writeFileSync } from "node:fs";
import { marked } from "marked";

const src = readFileSync(new URL("../ARCHITECTURE_AND_FLOW.md", import.meta.url), "utf8");

// Pull out ```mermaid blocks so marked doesn't escape them.
const mermaidBlocks = [];
const stripped = src.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
  const i = mermaidBlocks.push(code.trim()) - 1;
  return `\n@@MERMAID_${i}@@\n`;
});

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let html = marked.parse(stripped);
html = html.replace(/@@MERMAID_(\d+)@@/g, (_, i) =>
  `<pre class="mermaid-src"><b>Diagram (Mermaid source)</b>\n${escapeHtml(mermaidBlocks[Number(i)])}</pre>`,
);

const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>AOP Platform — Architecture & Flow</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1f2430; line-height: 1.55; font-size: 13px;
    max-width: 880px; margin: 0 auto; padding: 8px 0;
  }
  h1 { font-size: 26px; border-bottom: 3px solid #4f46e5; padding-bottom: 8px; margin-top: 28px; color: #312e81; }
  h2 { font-size: 19px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-top: 30px; color: #3730a3; page-break-after: avoid; }
  h3 { font-size: 15px; margin-top: 20px; color: #4338ca; page-break-after: avoid; }
  h4 { font-size: 13.5px; margin-top: 16px; color: #4b5563; }
  p, li { font-size: 13px; }
  a { color: #4f46e5; text-decoration: none; }
  code { background: #f3f4f6; padding: 1.5px 5px; border-radius: 4px; font-size: 12px;
         font-family: "Cascadia Code", "Consolas", monospace; color: #be123c; }
  pre { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px;
        overflow-x: auto; font-size: 11.5px; line-height: 1.45; page-break-inside: avoid; }
  pre code { background: none; color: #0f172a; padding: 0; }
  blockquote { border-left: 4px solid #c7d2fe; background: #eef2ff; margin: 14px 0;
               padding: 8px 14px; color: #3730a3; border-radius: 0 6px 6px 0; }
  blockquote p { font-size: 12.5px; }
  table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 11.5px; page-break-inside: avoid; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #eef2ff; color: #312e81; font-weight: 600; }
  tr:nth-child(even) td { background: #fafafc; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 26px 0; }
  .mermaid-src { background: #f5f3ff; border-color: #ddd6fe; color: #4338ca; }
  .mermaid-src b { color: #6d28d9; display: block; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  strong { color: #111827; }
</style>
</head>
<body>
${html}
</body>
</html>`;

writeFileSync(new URL("../ARCHITECTURE_AND_FLOW.html", import.meta.url), doc, "utf8");
console.log("HTML written.");
