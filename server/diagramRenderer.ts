import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { GoogleGenAI } from '@google/genai';
import type {
  DiagramProviderId,
  VideoDiagramSpec,
  VideoLanguage,
  VideoQualityPreset,
  VideoScene,
} from '../src/types.ts';
import { hasGeminiApiKey } from './geminiProvider.ts';

const execFileAsync = promisify(execFile);

export function getResolutionForQuality(quality: VideoQualityPreset): {
  width: number;
  height: number;
} {
  if (quality === '480p') return { width: 854, height: 480 };
  if (quality === '1080p') return { width: 1920, height: 1080 };
  return { width: 1280, height: 720 };
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getFontFamilyForLanguage(language: VideoLanguage): string {
  if (language === 'odia') {
    return "'Noto Sans Oriya', 'Noto Sans', sans-serif";
  }
  if (language === 'hindi') {
    return "'Noto Sans Devanagari', 'Noto Sans', sans-serif";
  }
  return "'Noto Sans', 'Noto Sans Oriya', 'Noto Sans Devanagari', sans-serif";
}

function wrapTextLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word.slice(0, maxCharsPerLine);
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      if (lines.length >= maxLines) break;
      current = word.slice(0, maxCharsPerLine);
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length + 3) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.length > 3 ? `${last.slice(0, maxCharsPerLine - 1)}…` : last;
  }
  return lines;
}

const SCENE_PALETTES = [
  { bg1: '#0f172a', bg2: '#1e1b4b', accent: '#7c3aed', accentSoft: '#a78bfa', chip: '#312e81' },
  { bg1: '#0c192c', bg2: '#0f3460', accent: '#0284c7', accentSoft: '#38bdf8', chip: '#0c4a6e' },
  { bg1: '#0b2220', bg2: '#064e3b', accent: '#059669', accentSoft: '#34d399', chip: '#065f46' },
  { bg1: '#1e1433', bg2: '#3b0764', accent: '#9333ea', accentSoft: '#c084fc', chip: '#4c1d95' },
  { bg1: '#1e1b2e', bg2: '#31102f', accent: '#e11d48', accentSoft: '#fb7185', chip: '#881337' },
];

/**
 * Generates crisp topic-relevant SVG vector diagram elements placed inside a 520x390 diagram box
 * (x: 0..520, y: 0..390). Always deterministic and XML-safe for English, Hindi, and Odia.
 */
function renderDiagramSvgGroup(
  spec: VideoDiagramSpec,
  language: VideoLanguage,
  palette: (typeof SCENE_PALETTES)[number],
  revealStep: 1 | 2 | 3,
): string {
  const font = getFontFamilyForLanguage(language);
  const nodes = (spec.nodes || []).slice(0, 6);
  const safeNodes =
    nodes.length > 0
      ? nodes
      : [
          { id: 'n1', label: spec.title || 'Core Concept', sublabel: 'Input / Cause' },
          { id: 'n2', label: 'Process', sublabel: 'Mechanism' },
          { id: 'n3', label: 'Outcome', sublabel: 'Result / Law' },
        ];

  const boxW = 520;
  const boxH = 390;
  const parts: string[] = [];

  // Diagram Card Background
  parts.push(
    `<rect x="0" y="0" width="${boxW}" height="${boxH}" rx="22" fill="#0f172a" fill-opacity="0.88" stroke="${palette.accentSoft}" stroke-opacity="0.45" stroke-width="2"/>`,
  );
  parts.push(
    `<rect x="0" y="0" width="${boxW}" height="48" rx="22" fill="${palette.accent}" fill-opacity="0.22"/>`,
  );
  parts.push(
    `<text x="22" y="31" font-family="${font}" font-size="18" font-weight="bold" fill="${palette.accentSoft}">${escapeXml(
      wrapTextLines(spec.title || 'Educational Diagram', 42, 1)[0] || 'Diagram',
    )}</text>`,
  );

  // Subtle Grid inside diagram canvas
  for (let gx = 40; gx < boxW; gx += 40) {
    parts.push(
      `<line x1="${gx}" y1="54" x2="${gx}" y2="${boxH - 42}" stroke="#334155" stroke-opacity="0.22" stroke-width="1"/>`,
    );
  }
  for (let gy = 80; gy < boxH - 42; gy += 40) {
    parts.push(
      `<line x1="16" y1="${gy}" x2="${boxW - 16}" y2="${gy}" stroke="#334155" stroke-opacity="0.22" stroke-width="1"/>`,
    );
  }

  const visibleCount =
    revealStep === 1 ? Math.max(1, Math.ceil(safeNodes.length * 0.5)) : safeNodes.length;
  const type = spec.diagramType || 'flowchart';

  if (type === 'cycle') {
    const cx = 260;
    const cy = 205;
    const r = 104;
    const count = Math.min(safeNodes.length, 5);
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${palette.accentSoft}" stroke-opacity="0.4" stroke-width="3" stroke-dasharray="8 6"/>`,
    );
    for (let i = 0; i < count; i++) {
      if (i >= visibleCount) continue;
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
      const nx = cx + Math.cos(angle) * r;
      const ny = cy + Math.sin(angle) * r;
      const nextAngle = -Math.PI / 2 + (((i + 1) % count) * 2 * Math.PI) / count;
      const midA = angle + (2 * Math.PI) / (count * 2);
      const ax1 = cx + Math.cos(angle + 0.32) * r;
      const ay1 = cy + Math.sin(angle + 0.32) * r;
      const ax2 = cx + Math.cos(nextAngle - 0.32) * r;
      const ay2 = cy + Math.sin(nextAngle - 0.32) * r;
      if (revealStep >= 2) {
        parts.push(
          `<line x1="${ax1.toFixed(1)}" y1="${ay1.toFixed(1)}" x2="${ax2.toFixed(1)}" y2="${ay2.toFixed(1)}" stroke="${palette.accentSoft}" stroke-width="2.5" marker-end="url(#arrowHead)"/>`,
        );
        const edge = spec.edges?.[i];
        if (edge?.label) {
          const lx = cx + Math.cos(midA) * (r + 18);
          const ly = cy + Math.sin(midA) * (r + 18);
          parts.push(
            `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-family="${font}" font-size="12" fill="#cbd5e1">${escapeXml(edge.label.slice(0, 16))}</text>`,
          );
        }
      }

      const node = safeNodes[i];
      const w = 136;
      const h = 54;
      parts.push(
        `<rect x="${(nx - w / 2).toFixed(1)}" y="${(ny - h / 2).toFixed(1)}" width="${w}" height="${h}" rx="12" fill="${palette.chip}" stroke="${palette.accentSoft}" stroke-width="2"/>`,
      );
      const lines = wrapTextLines(node.label, 16, 2);
      lines.forEach((ln, li) => {
        parts.push(
          `<text x="${nx.toFixed(1)}" y="${(ny - (lines.length === 2 ? 4 : -5) + li * 16).toFixed(1)}" text-anchor="middle" font-family="${font}" font-size="13" font-weight="bold" fill="#ffffff">${escapeXml(ln)}</text>`,
        );
      });
    }
  } else if (type === 'comparison' && safeNodes.length >= 2) {
    const leftNodes = safeNodes.filter((_, idx) => idx % 2 === 0).slice(0, 3);
    const rightNodes = safeNodes.filter((_, idx) => idx % 2 === 1).slice(0, 3);
    parts.push(
      `<line x1="260" y1="68" x2="260" y2="330" stroke="${palette.accentSoft}" stroke-opacity="0.55" stroke-width="2" stroke-dasharray="6 5"/>`,
    );
    leftNodes.forEach((n, idx) => {
      const y = 84 + idx * 80;
      parts.push(
        `<rect x="28" y="${y}" width="208" height="62" rx="12" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/>`,
      );
      parts.push(
        `<text x="132" y="${y + 27}" text-anchor="middle" font-family="${font}" font-size="15" font-weight="bold" fill="#e0f2fe">${escapeXml(wrapTextLines(n.label, 22, 1)[0] || '')}</text>`,
      );
      if (n.sublabel) {
        parts.push(
          `<text x="132" y="${y + 47}" text-anchor="middle" font-family="${font}" font-size="12" fill="#94a3b8">${escapeXml(wrapTextLines(n.sublabel, 26, 1)[0] || '')}</text>`,
        );
      }
    });
    if (revealStep >= 2) {
      rightNodes.forEach((n, idx) => {
        const y = 84 + idx * 80;
        parts.push(
          `<rect x="284" y="${y}" width="208" height="62" rx="12" fill="#1e293b" stroke="${palette.accentSoft}" stroke-width="2"/>`,
        );
        parts.push(
          `<text x="388" y="${y + 27}" text-anchor="middle" font-family="${font}" font-size="15" font-weight="bold" fill="#f5f3ff">${escapeXml(wrapTextLines(n.label, 22, 1)[0] || '')}</text>`,
        );
        if (n.sublabel) {
          parts.push(
            `<text x="388" y="${y + 47}" text-anchor="middle" font-family="${font}" font-size="12" fill="#94a3b8">${escapeXml(wrapTextLines(n.sublabel, 26, 1)[0] || '')}</text>`,
          );
        }
      });
    }
  } else if (type === 'formula-graph' || type === 'geometry-physics') {
    // Coordinate axes or Force/Vector triangle diagram + labeled nodes
    parts.push(
      `<line x1="65" y1="300" x2="465" y2="300" stroke="#64748b" stroke-width="2.5" marker-end="url(#arrowHead)"/>`,
    );
    parts.push(
      `<line x1="65" y1="300" x2="65" y2="75" stroke="#64748b" stroke-width="2.5" marker-end="url(#arrowHead)"/>`,
    );
    if (type === 'geometry-physics') {
      parts.push(
        `<polygon points="115,275 385,275 115,115" fill="${palette.accent}" fill-opacity="0.18" stroke="${palette.accentSoft}" stroke-width="3"/>`,
      );
      parts.push(
        `<rect x="115" y="255" width="20" height="20" fill="none" stroke="#38bdf8" stroke-width="2"/>`,
      );
      if (revealStep >= 2) {
        parts.push(
          `<line x1="255" y1="195" x2="365" y2="120" stroke="#f59e0b" stroke-width="3.5" marker-end="url(#arrowHead)"/>`,
        );
      }
    } else {
      // Smooth educational curve + tangent/bar markers
      parts.push(
        `<path d="M 80 280 Q 210 245 310 155 T 445 95" fill="none" stroke="${palette.accentSoft}" stroke-width="4"/>`,
      );
      if (revealStep >= 2) {
        parts.push(
          `<circle cx="310" cy="155" r="7" fill="#fbbf24" stroke="#ffffff" stroke-width="2"/>`,
        );
        parts.push(
          `<line x1="310" y1="155" x2="310" y2="300" stroke="#fbbf24" stroke-dasharray="5 5" stroke-width="2"/>`,
        );
      }
    }

    safeNodes.slice(0, 3).forEach((node, idx) => {
      if (idx >= visibleCount) return;
      const pillX = 95 + idx * 135;
      const pillY = idx === 0 ? 298 : idx === 1 ? 105 : 205;
      parts.push(
        `<rect x="${pillX}" y="${pillY - 22}" width="125" height="36" rx="10" fill="${palette.chip}" stroke="${palette.accentSoft}" stroke-width="1.5"/>`,
      );
      parts.push(
        `<text x="${pillX + 62}" y="${pillY + 1}" text-anchor="middle" font-family="${font}" font-size="13" font-weight="bold" fill="#ffffff">${escapeXml(wrapTextLines(node.label, 15, 1)[0] || '')}</text>`,
      );
    });
  } else if (type === 'timeline') {
    const count = Math.min(safeNodes.length, 4);
    parts.push(
      `<line x1="56" y1="205" x2="464" y2="205" stroke="${palette.accentSoft}" stroke-width="4"/>`,
    );
    for (let i = 0; i < count; i++) {
      if (i >= visibleCount) continue;
      const x = 84 + i * (340 / Math.max(1, count - 1));
      const up = i % 2 === 0;
      const cardY = up ? 84 : 236;
      parts.push(`<circle cx="${x}" cy="205" r="9" fill="#fbbf24" stroke="#0f172a" stroke-width="3"/>`);
      parts.push(
        `<line x1="${x}" y1="${up ? 196 : 214}" x2="${x}" y2="${up ? 156 : 236}" stroke="#94a3b8" stroke-width="2"/>`,
      );
      parts.push(
        `<rect x="${x - 62}" y="${cardY}" width="124" height="72" rx="12" fill="${palette.chip}" stroke="${palette.accentSoft}" stroke-width="2"/>`,
      );
      const lbl = wrapTextLines(safeNodes[i].label, 14, 2);
      lbl.forEach((line, li) => {
        parts.push(
          `<text x="${x}" y="${cardY + 28 + li * 18}" text-anchor="middle" font-family="${font}" font-size="13" font-weight="bold" fill="#ffffff">${escapeXml(line)}</text>`,
        );
      });
    }
  } else {
    // Flowchart / Labeled Concept hierarchical cards connected with arrows
    const count = Math.min(safeNodes.length, 4);
    const cardW = 410;
    const cardH = 54;
    const startY = 74;
    const gap = 74;
    for (let i = 0; i < count; i++) {
      if (i >= visibleCount) continue;
      const y = startY + i * gap;
      const node = safeNodes[i];
      if (i > 0 && revealStep >= 2) {
        parts.push(
          `<line x1="260" y1="${y - (gap - cardH)}" x2="260" y2="${y - 4}" stroke="${palette.accentSoft}" stroke-width="2.5" marker-end="url(#arrowHead)"/>`,
        );
      }
      parts.push(
        `<rect x="55" y="${y}" width="${cardW}" height="${cardH}" rx="12" fill="${i === 0 ? palette.chip : '#1e293b'}" stroke="${palette.accentSoft}" stroke-width="2"/>`,
      );
      parts.push(
        `<circle cx="82" cy="${y + 27}" r="14" fill="${palette.accent}"/>`,
      );
      parts.push(
        `<text x="82" y="${y + 32}" text-anchor="middle" font-family="${font}" font-size="14" font-weight="bold" fill="#ffffff">${i + 1}</text>`,
      );
      parts.push(
        `<text x="108" y="${y + (node.sublabel ? 24 : 33)}" font-family="${font}" font-size="16" font-weight="bold" fill="#ffffff">${escapeXml(wrapTextLines(node.label, 34, 1)[0] || '')}</text>`,
      );
      if (node.sublabel) {
        parts.push(
          `<text x="108" y="${y + 43}" font-family="${font}" font-size="13" fill="#cbd5e1">${escapeXml(wrapTextLines(node.sublabel, 42, 1)[0] || '')}</text>`,
        );
      }
    }
  }

  // Diagram Equation / Caption Footer
  const footerText = spec.formula || spec.caption || '';
  if (footerText) {
    parts.push(
      `<rect x="18" y="${boxH - 42}" width="${boxW - 36}" height="30" rx="8" fill="#1e293b" stroke="${palette.accentSoft}" stroke-opacity="0.45"/>`,
    );
    parts.push(
      `<text x="${boxW / 2}" y="${boxH - 22}" text-anchor="middle" font-family="${font}" font-size="14" font-weight="bold" fill="#fde68a">${escapeXml(wrapTextLines(footerText, 50, 1)[0] || '')}</text>`,
    );
  }

  return parts.join('\n');
}

export function buildEducationalSlideSvg(params: {
  scene: VideoScene;
  totalScenes: number;
  lessonTitle: string;
  subjectLabel: string;
  language: VideoLanguage;
  revealStep: 1 | 2 | 3;
  diagramImageBase64?: string;
}): string {
  const { scene, totalScenes, lessonTitle, subjectLabel, language, revealStep, diagramImageBase64 } =
    params;
  const palette = SCENE_PALETTES[scene.sceneIndex % SCENE_PALETTES.length];
  const font = getFontFamilyForLanguage(language);

  const width = 1280;
  const height = 720;

  const bulletsToShow =
    revealStep === 1
      ? scene.onScreenBullets.slice(0, 1)
      : revealStep === 2
        ? scene.onScreenBullets.slice(0, 2)
        : scene.onScreenBullets.slice(0, 4);

  const keywordsToShow =
    revealStep === 1
      ? scene.highlightedKeywords.slice(0, 2)
      : scene.highlightedKeywords.slice(0, 5);

  const bulletsSvg: string[] = [];
  let cursorY = 212;
  for (const bullet of bulletsToShow) {
    const wrapped = wrapTextLines(bullet, 44, 2);
    const blockH = wrapped.length === 2 ? 72 : 52;
    bulletsSvg.push(
      `<rect x="56" y="${cursorY}" width="628" height="${blockH}" rx="14" fill="#0f172a" fill-opacity="0.78" stroke="${palette.accentSoft}" stroke-opacity="0.35" stroke-width="1.5"/>`,
    );
    bulletsSvg.push(
      `<circle cx="80" cy="${cursorY + 26}" r="7" fill="${palette.accentSoft}"/>`,
    );
    wrapped.forEach((line, idx) => {
      bulletsSvg.push(
        `<text x="102" y="${cursorY + 31 + idx * 24}" font-family="${font}" font-size="20" font-weight="600" fill="#f8fafc">${escapeXml(line)}</text>`,
      );
    });
    cursorY += blockH + 14;
  }

  // Formula / Key Takeaway box shown on step 3 (or step 2+ if space allows)
  let formulaSvg = '';
  if (revealStep >= 2 && scene.formulaOrHighlight && cursorY < 515) {
    const fLines = wrapTextLines(scene.formulaOrHighlight, 48, 2);
    formulaSvg = `
      <rect x="56" y="${Math.max(cursorY + 4, 470)}" width="628" height="72" rx="14" fill="${palette.chip}" stroke="#fbbf24" stroke-width="2"/>
      <text x="78" y="${Math.max(cursorY + 32, 498)}" font-family="${font}" font-size="14" font-weight="bold" fill="#fde68a">KEY CONCEPT / FORMULA</text>
      <text x="78" y="${Math.max(cursorY + 58, 524)}" font-family="${font}" font-size="21" font-weight="bold" fill="#ffffff">${escapeXml(fLines.join(' '))}</text>
    `;
  }

  // Keyword chips row at bottom-left
  const chipsSvg: string[] = [];
  let chipX = 56;
  for (const kw of keywordsToShow) {
    const cleanKw = wrapTextLines(kw, 22, 1)[0] || kw;
    const chipW = Math.min(220, Math.max(96, cleanKw.length * 11 + 32));
    if (chipX + chipW > 690) break;
    chipsSvg.push(
      `<rect x="${chipX}" y="582" width="${chipW}" height="38" rx="10" fill="${palette.accent}" fill-opacity="0.28" stroke="${palette.accentSoft}" stroke-width="1.5"/>`,
    );
    chipsSvg.push(
      `<text x="${chipX + chipW / 2}" y="607" text-anchor="middle" font-family="${font}" font-size="15" font-weight="bold" fill="#e0e7ff">${escapeXml(cleanKw)}</text>`,
    );
    chipX += chipW + 12;
  }

  const rightDiagramBlock = diagramImageBase64
    ? `<rect x="0" y="0" width="520" height="390" rx="22" fill="#0f172a" stroke="${palette.accentSoft}" stroke-width="2"/>
       <image href="data:image/png;base64,${diagramImageBase64}" x="12" y="12" width="496" height="366" preserveAspectRatio="xMidYMid meet"/>`
    : renderDiagramSvgGroup(scene.diagramSpec, language, palette, revealStep);

  const progressRatio = (scene.sceneIndex + 1) / Math.max(1, totalScenes);
  const progressWidth = Math.round(1168 * progressRatio);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.bg1}"/>
      <stop offset="100%" stop-color="${palette.bg2}"/>
    </linearGradient>
    <marker id="arrowHead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="${palette.accentSoft}"/>
    </marker>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>
  <circle cx="1180" cy="95" r="220" fill="${palette.accent}" fill-opacity="0.14"/>
  <circle cx="110" cy="670" r="190" fill="${palette.accentSoft}" fill-opacity="0.08"/>

  <!-- Top Header Strip -->
  <rect x="56" y="34" width="230" height="34" rx="10" fill="${palette.accent}" fill-opacity="0.9"/>
  <text x="171" y="57" text-anchor="middle" font-family="${font}" font-size="15" font-weight="bold" fill="#ffffff">${escapeXml(
    wrapTextLines(subjectLabel || 'PadhloAI', 24, 1)[0] || 'PadhloAI',
  )}</text>

  <text x="304" y="57" font-family="${font}" font-size="16" font-weight="600" fill="#cbd5e1">${escapeXml(
    wrapTextLines(lessonTitle, 52, 1)[0] || '',
  )}</text>

  <rect x="1080" y="34" width="144" height="34" rx="10" fill="#1e293b" stroke="${palette.accentSoft}" stroke-opacity="0.5"/>
  <text x="1152" y="57" text-anchor="middle" font-family="${font}" font-size="15" font-weight="bold" fill="#e2e8f0">Scene ${scene.sceneIndex + 1} / ${totalScenes}</text>

  <!-- Scene Heading -->
  <text x="56" y="128" font-family="${font}" font-size="34" font-weight="bold" fill="#ffffff">${escapeXml(
    wrapTextLines(scene.sceneTitle, 38, 1)[0] || scene.sceneTitle,
  )}</text>
  <line x1="56" y1="150" x2="684" y2="150" stroke="${palette.accentSoft}" stroke-width="3" stroke-opacity="0.65"/>
  <text x="56" y="182" font-family="${font}" font-size="16" font-weight="600" fill="${palette.accentSoft}">${escapeXml(
    wrapTextLines(scene.visualDescription, 58, 1)[0] || '',
  )}</text>

  <!-- Left Content Column: Animated Progressive Bullets & Key Formula -->
  ${bulletsSvg.join('\n  ')}
  ${formulaSvg}
  ${chipsSvg.join('\n  ')}

  <!-- Right Column: Educational Vector Diagram / AI Illustration -->
  <g transform="translate(710, 165)">
    ${rightDiagramBlock}
  </g>

  <!-- Bottom Timeline Progress Bar -->
  <rect x="56" y="662" width="1168" height="8" rx="4" fill="#1e293b"/>
  <rect x="56" y="662" width="${progressWidth}" height="8" rx="4" fill="${palette.accentSoft}"/>
  <text x="56" y="694" font-family="${font}" font-size="14" font-weight="600" fill="#94a3b8">PadhloAI · Animated Educational Classroom</text>
  <text x="1224" y="694" text-anchor="end" font-family="${font}" font-size="14" font-weight="600" fill="#94a3b8">Animated Slides + Diagram + Teacher Voice</text>
</svg>`;
}

export function buildThumbnailSvg(params: {
  lessonTitle: string;
  subjectLabel: string;
  topic: string;
  language: VideoLanguage;
  durationMinutes: number;
  keywords: string[];
}): string {
  const font = getFontFamilyForLanguage(params.language);
  const titleLines = wrapTextLines(params.lessonTitle || params.topic, 28, 2);
  const langBadge =
    params.language === 'odia'
      ? 'ODIA (ଓଡ଼ିଆ)'
      : params.language === 'hindi'
        ? 'HINDI (हिन्दी)'
        : 'ENGLISH';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="tGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="55%" stop-color="#312e81"/>
      <stop offset="100%" stop-color="#4c1d95"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#tGrad)"/>
  <circle cx="1060" cy="180" r="240" fill="#7c3aed" fill-opacity="0.25"/>
  <rect x="72" y="72" width="290" height="44" rx="12" fill="#7c3aed"/>
  <text x="217" y="101" text-anchor="middle" font-family="${font}" font-size="20" font-weight="bold" fill="#ffffff">${escapeXml(
    wrapTextLines(params.subjectLabel || 'AI Video Lesson', 24, 1)[0] || 'AI Video Lesson',
  )}</text>

  <rect x="960" y="72" width="248" height="44" rx="12" fill="#1e293b" stroke="#a78bfa" stroke-width="2"/>
  <text x="1084" y="101" text-anchor="middle" font-family="${font}" font-size="18" font-weight="bold" fill="#e0e7ff">${escapeXml(langBadge)} · ${params.durationMinutes} MIN</text>

  <text x="72" y="250" font-family="${font}" font-size="56" font-weight="bold" fill="#ffffff">${escapeXml(titleLines[0] || params.topic)}</text>
  ${
    titleLines[1]
      ? `<text x="72" y="325" font-family="${font}" font-size="56" font-weight="bold" fill="#e0e7ff">${escapeXml(titleLines[1])}</text>`
      : ''
  }

  <text x="72" y="425" font-family="${font}" font-size="26" fill="#cbd5e1">${escapeXml(
    wrapTextLines(params.keywords.slice(0, 4).join('  •  ') || params.topic, 55, 1)[0] || '',
  )}</text>

  <circle cx="640" cy="560" r="52" fill="#7c3aed" stroke="#ffffff" stroke-width="4"/>
  <polygon points="626,536 626,584 668,560" fill="#ffffff"/>
  <text x="72" y="660" font-family="${font}" font-size="20" font-weight="bold" fill="#a78bfa">PadhloAI Animated Educational Classroom</text>
</svg>`;
}

export async function rasterizeSvgToPng(
  svgMarkup: string,
  tmpSvgPath: string,
  outputPngPath: string,
  width: number,
  height: number,
): Promise<void> {
  fs.writeFileSync(tmpSvgPath, svgMarkup, 'utf8');
  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'image2',
      '-i',
      tmpSvgPath,
      '-vf',
      `scale=${width}:${height}:flags=lanczos`,
      '-frames:v',
      '1',
      outputPngPath,
    ]);
  } finally {
    if (fs.existsSync(tmpSvgPath)) fs.unlinkSync(tmpSvgPath);
  }
}

export async function maybeGenerateDiagramImageBase64(params: {
  diagramProvider: DiagramProviderId;
  scene: VideoScene;
  topic: string;
}): Promise<{ base64?: string; providerUsed: DiagramProviderId }> {
  if (params.diagramProvider !== 'gemini-image' || !hasGeminiApiKey()) {
    return { providerUsed: 'svg-vector' };
  }
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return { providerUsed: 'svg-vector' };

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const prompt = `Clean high-contrast flat educational science/academic diagram illustration on dark navy background (#0f172a) showing: ${params.scene.visualDescription}. Concept: ${params.scene.diagramSpec?.title || params.topic}. Clear visual structure, crisp school textbook style, 4:3 aspect ratio.`;
    const resp = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: { parts: [{ text: prompt }] },
        config: {
          imageConfig: { aspectRatio: '4:3' },
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Image diagram timeout')), 20000),
      ),
    ]);
    for (const part of resp.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return { base64: part.inlineData.data, providerUsed: 'gemini-image' };
      }
    }
  } catch {
    // Gracefully fall back to crisp Educational Vector SVG diagrams on paid-key or network error
  }
  return { providerUsed: 'svg-vector' };
}
