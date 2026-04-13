import { spawnSync } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { chromium } from "playwright";
import { getDeploymentRegion } from "@/config";

export type DemoAssetKind = "doc" | "pdf" | "ppt" | "html" | "video";
export type DemoAssetCategory = "manual" | "finance" | "deck" | "video";

export interface DemoManifestItem {
  id: string;
  title: string;
  description: string;
  category: DemoAssetCategory;
  kind: DemoAssetKind;
  fileName: string;
  url: string;
  publicUrl?: string | null;
  size: number;
  updatedAt: string;
  fallback?: boolean;
}

export interface DemoManifest {
  generatedAt: string;
  basePath: string;
  items: DemoManifestItem[];
  warnings: string[];
}

export interface DemoClientBundleSummary {
  clientId: string;
  basePath: string;
  generatedAt: string;
  itemCount: number;
}

type DemoLocale = "zh" | "en";
type SlideSpec = { title: string; subtitle?: string; bullets: string[] };

const DEMO_PUBLIC_ROOT = path.join(process.cwd(), "public", "download");
const DEMO_PPT_TEMPLATE_CANDIDATES = [path.join(process.cwd(), ".next", "standalone", "public", "demo", "pitch-deck.pptx")];

export function normalizeDemoClientId(clientId?: string | null) {
  const normalized = String(clientId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || null;
}

export function resolveDemoPublicDir(clientId?: string | null) {
  const normalizedClientId = normalizeDemoClientId(clientId);
  return normalizedClientId ? path.join(DEMO_PUBLIC_ROOT, normalizedClientId) : DEMO_PUBLIC_ROOT;
}

export function resolveDemoBasePath(clientId?: string | null) {
  const normalizedClientId = normalizeDemoClientId(clientId);
  return normalizedClientId ? `/download/${encodeURIComponent(normalizedClientId)}` : "/download";
}

function getDemoLocale(): DemoLocale {
  return getDeploymentRegion() === "CN" ? "zh" : "en";
}

function getProductName(locale: DemoLocale) {
  return locale === "zh" ? "MornChat 企业协作空间" : "MornChat Enterprise Workspace";
}

function nowIso() {
  return new Date().toISOString();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
}

function getProductManualText(locale: DemoLocale) {
  if (locale === "zh") {
    return [
      `${getProductName(locale)} 产品使用说明书`,
      "",
      "1. 产品定位",
      "MornChat 将消息、文件、公告、决策与 AI 摘要整合到统一企业协作空间。",
      "",
      "2. 核心能力",
      "1. 统一频道、私聊与线程讨论。",
      "2. 快速检索消息、文件和知识内容。",
      "3. AI 摘要沉淀长讨论的行动结论。",
      "4. 适合销售演示、客户交付和内部协作。",
      "",
      "3. 使用流程",
      "1. 创建组织并邀请团队成员。",
      "2. 建立工作区、频道和文档结构。",
      "3. 用公告、知识库和 AI 摘要保持信息透明。",
    ].join("\n");
  }

  return [
    `${getProductName(locale)} Product Manual`,
    "",
    "1. Product Positioning",
    "MornChat unifies messaging, files, announcements, decisions, and AI summaries in one enterprise workspace.",
    "",
    "2. Core Capabilities",
    "1. Unified channels, direct messages, and threads.",
    "2. Fast search across messages, files, and knowledge.",
    "3. AI summaries that turn long discussions into actions.",
    "4. Ready for demos, handoff, and internal operations.",
    "",
    "3. Rollout Flow",
    "1. Create the organization and invite the initial team.",
    "2. Set up workspaces, channels, and docs.",
    "3. Use announcements and AI summaries to keep momentum visible.",
  ].join("\n");
}

function getFinancePlanText(locale: DemoLocale) {
  if (locale === "zh") {
    return [
      `${getProductName(locale)} 融资计划书`,
      "",
      "1. 项目概述",
      "MornChat 是一个融合沟通、文档、运营和 AI 内容能力的企业协作产品。",
      "",
      "2. 市场机会",
      "1. 企业协作需求持续增长。",
      "2. 客户希望减少割裂工具并提升效率。",
      "3. AI 原生协作形成更强产品壁垒。",
      "",
      "3. 资金用途",
      "1. 产品与 AI 研发。",
      "2. 销售与渠道拓展。",
      "3. 交付、客户成功与品牌建设。",
    ].join("\n");
  }

  return [
    `${getProductName(locale)} Fundraising Plan`,
    "",
    "1. Project Overview",
    "MornChat is an enterprise collaboration product combining communication, documentation, operations, and AI content workflows.",
    "",
    "2. Market Opportunity",
    "1. Enterprise collaboration demand keeps growing.",
    "2. Buyers want fewer disconnected tools and better efficiency.",
    "3. AI-native collaboration creates a stronger moat.",
    "",
    "3. Use of Funds",
    "1. Product and AI R&D.",
    "2. Sales and channel expansion.",
    "3. Delivery, customer success, and brand building.",
  ].join("\n");
}

function getVideoScriptText(locale: DemoLocale) {
  if (locale === "zh") {
    return [
      `${getProductName(locale)} 宣传视频脚本`,
      "",
      "场景 1",
      "企业沟通不应该只是一个聊天窗口。",
      "",
      "场景 2",
      "把消息、文档、公告和决策沉淀放进同一个工作空间。",
      "",
      "场景 3",
      "更快搜索、更快总结，让执行过程更透明。",
      "",
      "场景 4",
      "管理后台可一键生成完整宣传资料包。",
    ].join("\n");
  }

  return [
    `${getProductName(locale)} Promo Video Script`,
    "",
    "Scene 1",
    "Enterprise communication should be more than a chat window.",
    "",
    "Scene 2",
    "Bring messages, docs, announcements, and decisions into one workspace.",
    "",
    "Scene 3",
    "Search faster, summarize faster, and keep execution visible.",
    "",
    "Scene 4",
    "Generate a full promo bundle from the admin system.",
  ].join("\n");
}

function getPitchSlides(locale: DemoLocale): SlideSpec[] {
  if (locale === "zh") {
    return [
      {
        title: getProductName(locale),
        subtitle: "把企业沟通、文档、决策与 AI 协作放进同一个工作空间",
        bullets: ["统一聊天、文件、公告与行动结论", "适用于销售演示、提案、交付与融资沟通", "支持中国区部署与 AI 协作流程"],
      },
      {
        title: "客户痛点",
        subtitle: "企业协作工具分散，导致信息割裂、执行失焦和沉淀不足",
        bullets: ["消息、文件和公告分散在多个工具中", "团队难以快速回看上下文与决策过程", "跨部门推进时缺少统一的协作与留痕空间"],
      },
      {
        title: "产品能力",
        subtitle: "用统一工作空间提升团队执行效率与信息透明度",
        bullets: ["统一频道、私聊、线程与文档协作", "消息、文件与知识内容可快速检索", "AI 自动沉淀长讨论摘要与行动项"],
      },
      {
        title: "市场机会",
        subtitle: "企业客户正在从单点聊天工具转向更完整的协作工作台",
        bullets: ["客户关注效率、掌控力与数据沉淀", "AI 原生协作正在成为新的采购基线", "统一工作空间更利于后续扩展与复用"],
      },
      {
        title: "融资重点",
        subtitle: "用资金继续验证市场匹配并加速规模化复制",
        bullets: ["继续投入产品与 AI 能力建设", "扩大销售、试点和渠道合作", "沉淀面向行业场景的标准化模板"],
      },
    ];
  }

  return [
    {
      title: getProductName(locale),
      subtitle: "Bring communication, documentation, decisions, and AI workflows into one workspace",
      bullets: ["Unify chat, files, announcements, and action items", "Built for demos, proposals, handoff, and fundraising", "CN-ready deployment with AI collaboration workflows"],
    },
    {
      title: "Customer Pain",
      subtitle: "Teams lose momentum when communication, files, and decisions live in disconnected tools",
      bullets: ["Context is fragmented across messaging and docs", "Leads and managers struggle to trace decisions", "Cross-functional execution lacks one shared workspace"],
    },
    {
      title: "Product Value",
      subtitle: "The workspace is designed to improve visibility, execution speed, and reuse",
      bullets: ["Unified channels, DMs, threads, and docs", "Fast search across messages, files, and knowledge", "AI summaries convert long discussions into next steps"],
    },
    {
      title: "Market Opportunity",
      subtitle: "Buyers are moving from point tools toward more complete collaboration systems",
      bullets: ["Enterprise teams want better efficiency and control", "AI-native collaboration is becoming the new baseline", "A unified workspace increases expansion potential"],
    },
    {
      title: "Funding Focus",
      subtitle: "Use capital to validate fit further and accelerate repeatable scale",
      bullets: ["Deepen product and AI capabilities", "Expand sales, pilots, and channels", "Build reusable industry templates"],
    },
  ];
}

function toPowerShellSingleQuoted(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function buildPowerPointPayload(locale: DemoLocale) {
  const productName = getProductName(locale);
  const slides = getPitchSlides(locale);

  return {
    locale,
    productName,
    deckLabel: locale === "zh" ? "自动生成路演稿" : "Auto-generated pitch deck",
    closingNote:
      locale === "zh"
        ? "如需进一步完善，可继续补充图表、财务数据、客户案例与投资人定制内容。"
        : "Extend this deck with charts, financials, customer stories, and investor-specific details.",
    generatedAt: new Date().toLocaleString(locale === "zh" ? "zh-CN" : "en-US"),
    slides,
  };
}

function emu(px: number) {
  return Math.round(px * 9525);
}

function getLocaleLang(locale: DemoLocale) {
  return locale === "zh" ? "zh-CN" : "en-US";
}

function getLocaleAltLang(locale: DemoLocale) {
  return locale === "zh" ? "en-US" : "zh-CN";
}

function getThemeFontLatin(locale: DemoLocale) {
  return locale === "zh" ? "Aptos" : "Aptos";
}

function getThemeFontEastAsia(locale: DemoLocale) {
  return locale === "zh" ? "Microsoft YaHei UI" : "Aptos";
}

function buildTextParagraph(
  locale: DemoLocale,
  text: string,
  options?: {
    size?: number;
    color?: string;
    bold?: boolean;
    align?: "l" | "ctr" | "r";
  },
) {
  const lang = getLocaleLang(locale);
  const altLang = getLocaleAltLang(locale);
  const size = Math.round((options?.size || 18) * 100);
  const color = options?.color || "1F2937";
  const align = options?.align || "l";
  const bold = options?.bold ? ' b="1"' : "";

  return `<a:p><a:pPr algn="${align}"><a:buNone/></a:pPr><a:r><a:rPr lang="${lang}" altLang="${altLang}" sz="${size}"${bold}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${escapeHtml(getThemeFontLatin(locale))}"/><a:ea typeface="${escapeHtml(getThemeFontEastAsia(locale))}"/></a:rPr><a:t>${escapeHtml(text)}</a:t></a:r><a:endParaRPr lang="${lang}" altLang="${altLang}" sz="${size}"/></a:p>`;
}

function buildTextBoxShape(params: {
  locale: DemoLocale;
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  paragraphs: string[];
  fillColor?: string | null;
  lineColor?: string | null;
  marginLeft?: number;
  marginRight?: number;
  marginTop?: number;
  marginBottom?: number;
}) {
  const {
    locale,
    id,
    name,
    x,
    y,
    width,
    height,
    paragraphs,
    fillColor = null,
    lineColor = null,
    marginLeft = 14,
    marginRight = 14,
    marginTop = 10,
    marginBottom = 10,
  } = params;

  const fillXml = fillColor
    ? `<a:solidFill><a:srgbClr val="${fillColor}"/></a:solidFill>`
    : "<a:noFill/>";
  const lineXml = lineColor
    ? `<a:ln w="9525"><a:solidFill><a:srgbClr val="${lineColor}"/></a:solidFill></a:ln>`
    : "<a:ln><a:noFill/></a:ln>";
  const bodyXml = paragraphs.length ? paragraphs.join("") : `<a:p><a:endParaRPr lang="${getLocaleLang(locale)}" altLang="${getLocaleAltLang(locale)}"/></a:p>`;

  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeHtml(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(width)}" cy="${emu(height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fillXml}${lineXml}</p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="0" lIns="${emu(marginLeft)}" rIns="${emu(marginRight)}" tIns="${emu(marginTop)}" bIns="${emu(marginBottom)}"><a:spAutoFit/></a:bodyPr><a:lstStyle/>${bodyXml}</p:txBody></p:sp>`;
}

function buildSlideXml(
  payload: ReturnType<typeof buildPowerPointPayload>,
  slide: SlideSpec,
  index: number,
) {
  const locale = payload.locale;
  const pageLabel = locale === "zh" ? `第 ${index + 1} 页` : `Slide ${index + 1}`;
  const panelTitle = locale === "zh" ? "本页重点" : "Key Points";
  const panelBody =
    index === 0
      ? payload.closingNote
      : slide.bullets.slice(0, 2).join(locale === "zh" ? "；" : " | ");
  const footerText =
    locale === "zh"
      ? `${payload.deckLabel} · 生成时间 ${payload.generatedAt}`
      : `${payload.deckLabel} · Generated at ${payload.generatedAt}`;
  const titleSize = index === 0 ? 28 : 30;

  const shapes = [
    buildTextBoxShape({
      locale,
      id: 2,
      name: "Top Bar",
      x: 0,
      y: 0,
      width: 1280,
      height: 92,
      paragraphs: [],
      fillColor: "2A1E15",
      lineColor: null,
      marginLeft: 0,
      marginRight: 0,
      marginTop: 0,
      marginBottom: 0,
    }),
    buildTextBoxShape({
      locale,
      id: 3,
      name: "Product Label",
      x: 64,
      y: 24,
      width: 420,
      height: 26,
      paragraphs: [buildTextParagraph(locale, payload.productName, { size: 16, color: "F4D6C0" })],
    }),
    buildTextBoxShape({
      locale,
      id: 4,
      name: "Page Label",
      x: 1060,
      y: 24,
      width: 140,
      height: 24,
      paragraphs: [buildTextParagraph(locale, pageLabel, { size: 14, color: "F8F3EE", align: "r" })],
    }),
    buildTextBoxShape({
      locale,
      id: 5,
      name: "Slide Title",
      x: 72,
      y: 150,
      width: 720,
      height: 88,
      paragraphs: [buildTextParagraph(locale, slide.title, { size: titleSize, color: "1B1B1B", bold: true })],
    }),
    buildTextBoxShape({
      locale,
      id: 6,
      name: "Slide Subtitle",
      x: 72,
      y: 248,
      width: 720,
      height: 82,
      paragraphs: [buildTextParagraph(locale, slide.subtitle || "", { size: 18, color: "5F6472" })],
    }),
    buildTextBoxShape({
      locale,
      id: 7,
      name: "Bullet List",
      x: 92,
      y: 346,
      width: 690,
      height: 226,
      paragraphs: slide.bullets.map((bullet) => buildTextParagraph(locale, `• ${bullet}`, { size: 21, color: "202226" })),
      marginLeft: 0,
      marginRight: 8,
      marginTop: 0,
      marginBottom: 0,
    }),
    buildTextBoxShape({
      locale,
      id: 8,
      name: "Insight Panel",
      x: 846,
      y: 162,
      width: 344,
      height: 376,
      paragraphs: [
        buildTextParagraph(locale, panelTitle, { size: 15, color: "A35D2D", bold: true }),
        buildTextParagraph(locale, panelBody, { size: 17, color: "5A4638" }),
        buildTextParagraph(locale, payload.deckLabel, { size: 13, color: "7A6A5D" }),
      ],
      fillColor: "FFF8F2",
      lineColor: "E5CCBC",
      marginLeft: 22,
      marginRight: 22,
      marginTop: 22,
      marginBottom: 22,
    }),
    buildTextBoxShape({
      locale,
      id: 9,
      name: "Footer",
      x: 72,
      y: 640,
      width: 1120,
      height: 24,
      paragraphs: [buildTextParagraph(locale, footerText, { size: 11, color: "766C63" })],
      marginLeft: 0,
      marginRight: 0,
      marginTop: 0,
      marginBottom: 0,
    }),
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function buildPresentationRelsXml(slideCount: number) {
  const slideRels = Array.from({ length: slideCount }, (_, index) => {
    const relId = index + 2;
    return `<Relationship Id="rId${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slideRels}<Relationship Id="rId${slideCount + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/><Relationship Id="rId${slideCount + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/><Relationship Id="rId${slideCount + 4}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/></Relationships>`;
}

function buildSlideOverrideXml(slideCount: number) {
  return Array.from({ length: slideCount }, (_, index) => {
    return `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
  }).join("");
}

function buildAppPropsXml(payload: ReturnType<typeof buildPowerPointPayload>) {
  const slideTitles = payload.slides.map((slide) => `<vt:lpstr>${escapeHtml(slide.title)}</vt:lpstr>`).join("");
  const titleVectorSize = 4 + payload.slides.length;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><TotalTime>0</TotalTime><Words>0</Words><Application>Microsoft Office PowerPoint</Application><PresentationFormat>${escapeHtml(payload.locale === "zh" ? "宽屏" : "Widescreen")}</PresentationFormat><Paragraphs>0</Paragraphs><Slides>${payload.slides.length}</Slides><Notes>0</Notes><HiddenSlides>0</HiddenSlides><MMClips>0</MMClips><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="6" baseType="variant"><vt:variant><vt:lpstr>${escapeHtml(payload.locale === "zh" ? "已用的字体" : "Fonts Used")}</vt:lpstr></vt:variant><vt:variant><vt:i4>2</vt:i4></vt:variant><vt:variant><vt:lpstr>${escapeHtml(payload.locale === "zh" ? "主题" : "Theme")}</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant><vt:variant><vt:lpstr>${escapeHtml(payload.locale === "zh" ? "幻灯片标题" : "Slide Titles")}</vt:lpstr></vt:variant><vt:variant><vt:i4>${payload.slides.length}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="${titleVectorSize}" baseType="lpstr"><vt:lpstr>${escapeHtml(getThemeFontEastAsia(payload.locale))}</vt:lpstr><vt:lpstr>${escapeHtml(getThemeFontLatin(payload.locale))}</vt:lpstr><vt:lpstr>Office Theme</vt:lpstr>${slideTitles}</vt:vector></TitlesOfParts><Company></Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0000</AppVersion></Properties>`;
}

function buildCorePropsXml(payload: ReturnType<typeof buildPowerPointPayload>) {
  const timestamp = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeHtml(payload.productName)}</dc:title><dc:creator>MornChat</dc:creator><cp:lastModifiedBy>MornChat</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified></cp:coreProperties>`;
}

function runPowerShell(command: string) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "PowerShell command failed");
  }
}

async function findPowerPointTemplate() {
  for (const candidate of DEMO_PPT_TEMPLATE_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch (_error) {
      // Keep checking other candidates.
    }
  }

  throw new Error("PowerPoint template is unavailable");
}

async function extractZipArchive(sourcePath: string, destinationPath: string) {
  runPowerShell(
    [
      "$ErrorActionPreference = 'Stop'",
      "Add-Type -AssemblyName System.IO.Compression.FileSystem",
      `[System.IO.Compression.ZipFile]::ExtractToDirectory(${toPowerShellSingleQuoted(sourcePath)}, ${toPowerShellSingleQuoted(destinationPath)})`,
    ].join("; "),
  );
}

async function createZipArchive(sourcePath: string, targetPath: string) {
  runPowerShell(
    [
      "$ErrorActionPreference = 'Stop'",
      "Add-Type -AssemblyName System.IO.Compression.FileSystem",
      `if (Test-Path ${toPowerShellSingleQuoted(targetPath)}) { Remove-Item -LiteralPath ${toPowerShellSingleQuoted(targetPath)} -Force }`,
      `[System.IO.Compression.ZipFile]::CreateFromDirectory(${toPowerShellSingleQuoted(sourcePath)}, ${toPowerShellSingleQuoted(targetPath)})`,
    ].join("; "),
  );
}

function renderPdfHtml(text: string, title: string, locale: DemoLocale) {
  const generatedAtLabel = locale === "zh" ? "生成时间" : "Generated at";
  const paragraphs = text.split("\n").map((line) => line.trim());

  return `<!DOCTYPE html>
<html lang="${locale === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; padding: 36px 42px; font-family: "Segoe UI", Arial, sans-serif; background: #fffdf8; color: #111827; line-height: 1.7; }
    h1 { margin: 0 0 10px; font-size: 28px; }
    .muted { margin-bottom: 18px; color: #6b7280; font-size: 12px; }
    p { margin: 0 0 8px; font-size: 14px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="muted">${escapeHtml(generatedAtLabel)} ${escapeHtml(new Date().toLocaleString(locale === "zh" ? "zh-CN" : "en-US"))}</div>
  ${paragraphs.map((line) => `<p>${line ? escapeHtml(line) : "&nbsp;"}</p>`).join("\n")}
</body>
</html>`;
}

function renderPitchHtml(slides: SlideSpec[], locale: DemoLocale) {
  const productName = getProductName(locale);

  return `<!DOCTYPE html>
<html lang="${locale === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(locale === "zh" ? `${productName} 路演稿` : `${productName} Pitch Deck`)}</title>
  <style>
    body { margin: 0; padding: 28px; font-family: "Segoe UI", Arial, sans-serif; background: #f4efe8; color: #171717; }
    .deck { display: grid; gap: 24px; max-width: 1120px; margin: 0 auto; }
    .slide { min-height: 620px; display: grid; gap: 24px; grid-template-columns: 1.1fr 0.9fr; padding: 40px 44px; border-radius: 28px; background: rgba(255,255,255,0.84); box-shadow: 0 20px 55px rgba(15,23,42,0.08); page-break-after: always; }
    .eyebrow { display: inline-flex; padding: 8px 14px; border-radius: 999px; background: rgba(217,119,6,0.12); color: #d97706; font-size: 13px; font-weight: 700; }
    h1 { margin: 18px 0 12px; font-size: 42px; line-height: 1.14; }
    h2 { margin: 0; font-size: 18px; line-height: 1.6; color: #5f6472; }
    ul { margin: 26px 0 0; padding-left: 22px; display: grid; gap: 14px; font-size: 19px; line-height: 1.7; }
    .panel { display: flex; flex-direction: column; justify-content: space-between; padding: 24px; border-radius: 24px; background: rgba(255,255,255,0.72); }
  </style>
</head>
<body>
  <div class="deck">
    ${slides
      .map(
        (slide, index) => `<section class="slide">
      <div>
        <div class="eyebrow">${escapeHtml(locale === "zh" ? `第 ${index + 1} 页` : `Slide ${index + 1}`)}</div>
        <h1>${escapeHtml(slide.title)}</h1>
        <h2>${escapeHtml(slide.subtitle || "")}</h2>
        <ul>${slide.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>
      </div>
      <div class="panel">
        <div>${escapeHtml(locale === "zh" ? "适用于演示、提案和融资沟通。" : "Built for demos, proposals, and fundraising.")}</div>
        <div style="font-size:14px;color:#6b7280;">${escapeHtml(locale === "zh" ? `${productName} · 自动生成演示稿` : `${productName} · Auto-generated deck`)}</div>
      </div>
    </section>`,
      )
      .join("\n")}
  </div>
</body>
</html>`;
}

function renderVideoHtml(locale: DemoLocale) {
  const productName = getProductName(locale);
  const scenes =
    locale === "zh"
      ? [
          { eyebrow: "MornChat", title: "企业沟通应该更有连接感", body: "把消息、文件、决策和 AI 摘要放进同一个工作空间。" },
          { eyebrow: "统一空间", title: "消息、文档和上下文保持在一起", body: "搜索、公告和协作在同一流程里，团队推进更高效。" },
          { eyebrow: "后台生成", title: "一键生成完整宣传资料包", body: "快速产出销售、融资和试点演示可直接使用的资料。" },
        ]
      : [
          { eyebrow: "MornChat", title: "Enterprise communication should feel more connected", body: "Bring messages, files, decisions, and AI summaries into one workspace." },
          { eyebrow: "One Workspace", title: "Messages, docs, and context stay together", body: "Search, announcements, and collaboration remain in the same flow." },
          { eyebrow: "Admin Output", title: "Generate a full promo bundle in one click", body: "Produce materials for sales, fundraising, and pilots instantly." },
        ];

  return `<!DOCTYPE html>
<html lang="${locale === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(locale === "zh" ? `${productName} 宣传预览` : `${productName} Promo Preview`)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; width: 1280px; height: 720px; overflow: hidden; font-family: "Segoe UI", Arial, sans-serif; background: #0f172a; color: #f8fafc; }
    .scene { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; padding: 76px 90px; opacity: 0; transform: scale(1.02); animation: show 9s linear forwards; }
    .scene::before { content: ""; position: absolute; inset: -10%; z-index: -1; filter: blur(6px); background: radial-gradient(circle at 18% 20%, var(--accent), transparent 28%), radial-gradient(circle at 84% 74%, rgba(255,255,255,0.10), transparent 28%), linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,41,59,0.86)); }
    .scene:nth-child(1) { --accent: rgba(255,214,181,0.58); animation-delay: 0s; }
    .scene:nth-child(2) { --accent: rgba(199,230,255,0.58); animation-delay: 3s; }
    .scene:nth-child(3) { --accent: rgba(255,230,168,0.58); animation-delay: 6s; }
    .eyebrow { align-self: flex-start; padding: 10px 18px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.12); font-size: 22px; }
    h1 { margin: 22px 0 18px; max-width: 920px; font-size: 62px; line-height: 1.12; }
    p { margin: 0; max-width: 860px; font-size: 28px; line-height: 1.6; color: rgba(248,250,252,0.86); }
    .footer { font-size: 18px; color: rgba(248,250,252,0.64); }
    @keyframes show { 0% { opacity: 0; transform: scale(1.02); } 6% { opacity: 1; transform: scale(1); } 27% { opacity: 1; transform: scale(1); } 33% { opacity: 0; transform: scale(0.985); } 100% { opacity: 0; transform: scale(0.985); } }
  </style>
</head>
<body>
  ${scenes
    .map(
      (scene) => `<section class="scene">
    <div>
      <div class="eyebrow">${escapeHtml(scene.eyebrow)}</div>
      <h1>${escapeHtml(scene.title)}</h1>
      <p>${escapeHtml(scene.body)}</p>
    </div>
    <div class="footer">${escapeHtml(locale === "zh" ? `${productName} · 自动生成宣传预览` : `${productName} · Auto-generated promo preview`)}</div>
  </section>`,
    )
    .join("\n")}
</body>
</html>`;
}

async function ensureCleanDemoDir(demoPublicDir: string, options?: { preserveDirectories?: boolean }) {
  await fs.mkdir(demoPublicDir, { recursive: true });
  const entries = await fs.readdir(demoPublicDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => !(options?.preserveDirectories && entry.isDirectory()))
      .map((entry) => fs.rm(path.join(demoPublicDir, entry.name), { recursive: true, force: true })),
  );
}

async function mirrorBundleFiles(sourceDir: string, targetDir: string) {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => fs.copyFile(path.join(sourceDir, entry.name), path.join(targetDir, entry.name))),
  );
}

async function syncLatestDemoMirror(sourceDir: string) {
  if (path.resolve(sourceDir) === path.resolve(DEMO_PUBLIC_ROOT)) {
    return;
  }

  await ensureCleanDemoDir(DEMO_PUBLIC_ROOT, { preserveDirectories: true });
  await mirrorBundleFiles(sourceDir, DEMO_PUBLIC_ROOT);
}

async function writeTempHtml(prefix: string, html: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const filePath = path.join(tempDir, "index.html");
  await fs.writeFile(filePath, html, "utf8");
  return { filePath, tempDir };
}

async function launchBrowser() {
  try {
    if (process.platform === "win32") {
      return await chromium.launch({ channel: "msedge", headless: true });
    }
  } catch (_error) {
    // Fall back to bundled Chromium when Edge launch is unavailable.
  }
  return chromium.launch({ headless: true });
}

async function createPdfFromHtml(outputPath: string, html: string) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({ path: outputPath, format: "A4", printBackground: true, margin: { top: "16mm", right: "14mm", bottom: "16mm", left: "14mm" } });
  } finally {
    await browser.close();
  }
}

async function createVideoFromHtml(outputPath: string, html: string) {
  const tempVideoDir = await fs.mkdtemp(path.join(os.tmpdir(), "mornchat-demo-video-"));
  const preview = await writeTempHtml("mornchat-demo-preview-", html);
  const browser = await launchBrowser();

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: tempVideoDir, size: { width: 1280, height: 720 } } });
    const page = await context.newPage();
    await page.goto(pathToFileURL(preview.filePath).href, { waitUntil: "load" });
    await page.waitForTimeout(9500);
    const pageVideo = page.video();
    await context.close();
    if (!pageVideo) throw new Error("Playwright did not return a recorded video");
    await fs.copyFile(await pageVideo.path(), outputPath);
  } finally {
    await browser.close();
    await fs.rm(tempVideoDir, { recursive: true, force: true });
    await fs.rm(preview.tempDir, { recursive: true, force: true });
  }
}

async function createTextDocument(fileName: string, title: string, content: string, demoPublicDir: string) {
  const target = path.join(demoPublicDir, fileName);
  await fs.writeFile(target, `${title}\n\n${content}\n`, "utf8");
}

async function createPowerPointDeck(fileName: string, locale: DemoLocale, demoPublicDir: string) {
  const target = path.join(demoPublicDir, fileName);
  const templatePath = await findPowerPointTemplate();
  const payload = buildPowerPointPayload(locale);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mornchat-pptx-"));

  try {
    await extractZipArchive(templatePath, tempRoot);

    const presentationPath = path.join(tempRoot, "ppt", "presentation.xml");
    const contentTypesPath = path.join(tempRoot, "[Content_Types].xml");
    const appPropsPath = path.join(tempRoot, "docProps", "app.xml");
    const corePropsPath = path.join(tempRoot, "docProps", "core.xml");
    const presentationRelsPath = path.join(tempRoot, "ppt", "_rels", "presentation.xml.rels");
    const slidesDir = path.join(tempRoot, "ppt", "slides");
    const slideRelsDir = path.join(tempRoot, "ppt", "slides", "_rels");
    const slideTemplateRel = await fs.readFile(path.join(slideRelsDir, "slide1.xml.rels"), "utf8");

    const presentationXml = await fs.readFile(presentationPath, "utf8");
    const contentTypesXml = await fs.readFile(contentTypesPath, "utf8");

    const slideIdList = payload.slides
      .map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`)
      .join("");

    const updatedPresentationXml = presentationXml.replace(
      /<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/,
      `<p:sldIdLst>${slideIdList}</p:sldIdLst>`,
    );
    const updatedContentTypesXml = contentTypesXml.replace(
      /<Override PartName="\/ppt\/slides\/slide\d+\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.presentationml\.slide\+xml"\/>/g,
      buildSlideOverrideXml(payload.slides.length),
    );

    const existingSlides = await fs.readdir(slidesDir);
    await Promise.all(
      existingSlides
        .filter((name) => /^slide\d+\.xml$/i.test(name))
        .map((name) => fs.rm(path.join(slidesDir, name), { force: true })),
    );

    const existingSlideRels = await fs.readdir(slideRelsDir);
    await Promise.all(
      existingSlideRels
        .filter((name) => /^slide\d+\.xml\.rels$/i.test(name))
        .map((name) => fs.rm(path.join(slideRelsDir, name), { force: true })),
    );

    await Promise.all(
      payload.slides.flatMap((slide, index) => [
        fs.writeFile(path.join(slidesDir, `slide${index + 1}.xml`), buildSlideXml(payload, slide, index), "utf8"),
        fs.writeFile(path.join(slideRelsDir, `slide${index + 1}.xml.rels`), slideTemplateRel, "utf8"),
      ]),
    );

    await fs.writeFile(presentationPath, updatedPresentationXml, "utf8");
    await fs.writeFile(contentTypesPath, updatedContentTypesXml, "utf8");
    await fs.writeFile(presentationRelsPath, buildPresentationRelsXml(payload.slides.length), "utf8");
    await fs.writeFile(appPropsPath, buildAppPropsXml(payload), "utf8");
    await fs.writeFile(corePropsPath, buildCorePropsXml(payload), "utf8");

    await createZipArchive(tempRoot, target);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

function getDemoItems(locale: DemoLocale) {
  return [
    {
      id: "product-manual-txt",
      title: locale === "zh" ? "产品说明书 TXT" : "Product Manual TXT",
      description: locale === "zh" ? "纯文本版本，适合快速查看、转发和二次整理。" : "A plain-text version for quick review, sharing, and reuse.",
      category: "manual" as const,
      kind: "doc" as const,
      candidates: ["product-manual.txt"],
    },
    {
      id: "product-manual-pdf",
      title: locale === "zh" ? "产品说明书 PDF" : "Product Manual PDF",
      description: locale === "zh" ? "排版完成的 PDF 版本，可直接介绍或交付。" : "A polished PDF version ready for handoff.",
      category: "manual" as const,
      kind: "pdf" as const,
      candidates: ["product-manual.pdf"],
    },
    {
      id: "fundraising-plan-txt",
      title: locale === "zh" ? "融资计划书 TXT" : "Fundraising Plan TXT",
      description: locale === "zh" ? "纯文本格式，便于按投资人场景继续调整。" : "A plain-text file for investor-specific revisions.",
      category: "finance" as const,
      kind: "doc" as const,
      candidates: ["fundraising-plan.txt"],
    },
    {
      id: "fundraising-plan-pdf",
      title: locale === "zh" ? "融资计划书 PDF" : "Fundraising Plan PDF",
      description: locale === "zh" ? "适合预览和发送的 PDF 版本。" : "A PDF version ready for review and circulation.",
      category: "finance" as const,
      kind: "pdf" as const,
      candidates: ["fundraising-plan.pdf"],
    },
    {
      id: "pitch-deck",
      title: locale === "zh" ? "融资路演 PPT" : "Pitch Deck PPTX",
      description: locale === "zh" ? "用于演示、提案和融资沟通的演示文稿。" : "A presentation deck for demos, proposals, and fundraising.",
      category: "deck" as const,
      kind: "ppt" as const,
      candidates: ["pitch-deck.pptx", "pitch-deck-fallback.html"],
    },
    {
      id: "promo-video-script-txt",
      title: locale === "zh" ? "宣传视频脚本 TXT" : "Promo Video Script TXT",
      description: locale === "zh" ? "包含分镜和旁白文案的文本脚本，适合继续修改。" : "A plain-text script with scenes and narration copy.",
      category: "video" as const,
      kind: "doc" as const,
      candidates: ["promo-video-script.txt"],
    },
    {
      id: "promo-video",
      title: locale === "zh" ? "宣传视频 WEBM" : "Promo Video WEBM",
      description: locale === "zh" ? "自动生成的宣传视频，可直接用于展示。" : "An auto-recorded promo video ready for demos.",
      category: "video" as const,
      kind: "video" as const,
      candidates: ["promo-video.webm", "promo-video-fallback.html"],
    },
  ];
}

async function statItem(fileName: string, demoPublicDir: string) {
  const stats = await fs.stat(path.join(demoPublicDir, fileName));
  return { size: stats.size, updatedAt: stats.mtime.toISOString() };
}

async function fileExists(fileName: string, demoPublicDir: string) {
  try {
    await fs.access(path.join(demoPublicDir, fileName));
    return true;
  } catch (_error) {
    return false;
  }
}

async function buildManifest(locale: DemoLocale, demoPublicDir: string, basePath: string): Promise<DemoManifest> {
  const items: DemoManifestItem[] = [];
  const warnings: string[] = [];

  for (const item of getDemoItems(locale)) {
    const existingCandidates = await Promise.all(
      item.candidates.map(async (candidate) => ((await fileExists(candidate, demoPublicDir)) ? candidate : null)),
    );
    const fileName = existingCandidates.find(Boolean) || undefined;
    if (!fileName) continue;

    const fallback = fileName.endsWith(".html");
    const kind = fallback ? "html" : item.kind;
    const fileInfo = await statItem(fileName, demoPublicDir);

    items.push({
      id: item.id,
      title:
        item.id === "pitch-deck" && fallback
          ? locale === "zh"
            ? "融资路演 HTML 预览"
            : "Pitch Deck HTML"
          : item.id === "promo-video" && fallback
            ? locale === "zh"
              ? "宣传视频 HTML 预览"
              : "Promo Video HTML Preview"
            : item.title,
      description:
        item.id === "pitch-deck" && fallback
          ? locale === "zh"
            ? "PowerPoint 导出不可用时的 HTML 回退文件。"
            : "Fallback HTML deck when PowerPoint export is unavailable."
          : item.id === "promo-video" && fallback
            ? locale === "zh"
              ? "视频导出不可用时的 HTML 动画回退文件。"
              : "Fallback animated HTML preview when video export is unavailable."
            : item.description,
      category: item.category,
      kind,
      fileName,
      url: `${basePath}/${encodeURIComponent(fileName)}`,
      fallback,
      ...fileInfo,
    });
  }

  if (items.some((item) => item.id === "pitch-deck" && item.fallback)) {
    warnings.push(locale === "zh" ? "PPT 导出失败，已自动回退为 HTML 演示页。" : "PPT export failed and was replaced with an HTML deck.");
  }
  if (items.some((item) => item.id === "promo-video" && item.fallback)) {
    warnings.push(locale === "zh" ? "视频导出失败，已自动回退为 HTML 预览。" : "Video export failed and was replaced with an HTML preview.");
  }

  const generatedAt =
    items
      .map((item) => item.updatedAt)
      .sort()
      .at(-1) || nowIso();

  return { generatedAt, basePath, items, warnings };
}

export async function readDemoManifest(clientId?: string | null): Promise<DemoManifest | null> {
  const demoPublicDir = resolveDemoPublicDir(clientId);
  const basePath = resolveDemoBasePath(clientId);

  try {
    await fs.access(demoPublicDir);
    return buildManifest(getDemoLocale(), demoPublicDir, basePath);
  } catch (_error) {
    return null;
  }
}

export async function listDemoClientBundles(): Promise<DemoClientBundleSummary[]> {
  try {
    await fs.mkdir(DEMO_PUBLIC_ROOT, { recursive: true });
    const entries = await fs.readdir(DEMO_PUBLIC_ROOT, { withFileTypes: true });
    const clientIds = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => normalizeDemoClientId(entry.name))
      .filter((value): value is string => Boolean(value));

    const manifests = await Promise.all(
      clientIds.map(async (clientId) => {
        const manifest = await readDemoManifest(clientId);
        if (!manifest?.items.length) return null;
        return {
          clientId,
          basePath: manifest.basePath,
          generatedAt: manifest.generatedAt,
          itemCount: manifest.items.length,
        } satisfies DemoClientBundleSummary;
      }),
    );

    return manifests
      .filter((item): item is DemoClientBundleSummary => Boolean(item))
      .sort((left, right) => (left.generatedAt < right.generatedAt ? 1 : -1));
  } catch {
    return [];
  }
}

export async function generateDemoBundle(clientId?: string | null): Promise<DemoManifest> {
  const normalizedClientId = normalizeDemoClientId(clientId);
  const demoPublicDir = resolveDemoPublicDir(clientId);
  const basePath = resolveDemoBasePath(clientId);

  await ensureCleanDemoDir(demoPublicDir, { preserveDirectories: !normalizedClientId });

  const locale = getDemoLocale();
  const manualText = getProductManualText(locale);
  const financeText = getFinancePlanText(locale);
  const videoScript = getVideoScriptText(locale);

  await createTextDocument("product-manual.txt", locale === "zh" ? "产品使用说明书" : "Product Manual", manualText, demoPublicDir);
  await createTextDocument("fundraising-plan.txt", locale === "zh" ? "融资计划书" : "Fundraising Plan", financeText, demoPublicDir);
  await createTextDocument("promo-video-script.txt", locale === "zh" ? "宣传视频脚本" : "Promo Video Script", videoScript, demoPublicDir);

  await createPdfFromHtml(path.join(demoPublicDir, "product-manual.pdf"), renderPdfHtml(manualText, locale === "zh" ? "产品使用说明书" : "Product Manual", locale));
  await createPdfFromHtml(path.join(demoPublicDir, "fundraising-plan.pdf"), renderPdfHtml(financeText, locale === "zh" ? "融资计划书" : "Fundraising Plan", locale));

  const pitchHtml = renderPitchHtml(getPitchSlides(locale), locale);
  let pitchOutput = "pitch-deck.pptx";
  try {
    await createPowerPointDeck(pitchOutput, locale, demoPublicDir);
  } catch (_error) {
    pitchOutput = "pitch-deck-fallback.html";
    await fs.writeFile(path.join(demoPublicDir, pitchOutput), pitchHtml, "utf8");
  }

  const videoHtml = renderVideoHtml(locale);
  let videoOutput = "promo-video.webm";
  try {
    await createVideoFromHtml(path.join(demoPublicDir, videoOutput), videoHtml);
  } catch (_error) {
    videoOutput = "promo-video-fallback.html";
    await fs.writeFile(path.join(demoPublicDir, videoOutput), videoHtml, "utf8");
  }

  await syncLatestDemoMirror(demoPublicDir);

  return buildManifest(locale, demoPublicDir, basePath);
}
