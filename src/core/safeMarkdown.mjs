function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeHttpUrl(url, getBaseUrl) {
  if (typeof url !== "string") return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed, getBaseUrl());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function sanitizeCodeLanguage(lang) {
  return String(lang || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function formatCodeLanguageLabel(lang) {
  const safeLang = sanitizeCodeLanguage(lang);
  if (!safeLang) return "";

  const knownLabels = {
    js: "JavaScript",
    jsx: "JSX",
    ts: "TypeScript",
    tsx: "TSX",
    sh: "Shell",
    bash: "Bash",
    zsh: "Zsh",
    pwsh: "PowerShell",
    powershell: "PowerShell",
    ps1: "PowerShell",
    json: "JSON",
    yaml: "YAML",
    yml: "YAML",
    md: "Markdown",
    csharp: "C#",
    cpp: "C++",
    plaintext: "Plain Text",
    text: "Plain Text",
  };

  if (knownLabels[safeLang]) return knownLabels[safeLang];

  return safeLang
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function renderSafeMarkdownToHTML(markdown, options = {}, getBaseUrl) {
  const sanitizeUrl = (url) => sanitizeHttpUrl(url, getBaseUrl);

  const linkStyle = options.linkStyle ? ` style="${escapeAttribute(options.linkStyle)}"` : "";
  const codeStyle = options.codeStyle ? ` style="${escapeAttribute(options.codeStyle)}"` : "";
  const paragraphStyle = options.paragraphStyle ? ` style="${escapeAttribute(options.paragraphStyle)}"` : "";
  const imageStyle = options.imageStyle || "max-width:100%;border-radius:8px;margin:8px 0;";
  const blockquoteStyle = options.blockquoteStyle || "";
  const hrStyle = options.hrStyle || "";
  const headingStyles = options.headingStyles || {};

  const renderLink = (url, label) => {
    const safeLabel = escapeHtml(label ?? url ?? "");
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return safeLabel;
    return `<a href="${escapeAttribute(safeUrl)}" target="_blank" rel="noopener noreferrer"${linkStyle}>${safeLabel}</a>`;
  };

  const renderInline = (text) => {
    const tokens = [];
    const storeToken = (html) => {
      const token = `\uE000${tokens.length}\uE001`;
      tokens.push(html);
      return token;
    };

    let source = String(text ?? "");

    source = source.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
      const safeSrc = sanitizeUrl(src);
      if (!safeSrc) {
        return storeToken(alt ? escapeHtml(alt) : "");
      }
      return storeToken(
        `<img src="${escapeAttribute(safeSrc)}" alt="${escapeAttribute(alt)}" style="${escapeAttribute(imageStyle)}" loading="lazy" />`
      );
    });

    source = source.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
      storeToken(renderLink(url, label))
    );

    source = source.replace(/`([^`]+)`/g, (_, code) =>
      storeToken(`<code${codeStyle}>${escapeHtml(code)}</code>`)
    );

    let html = escapeHtml(source);
    html = html
      .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/~~(.+?)~~/g, "<del>$1</del>")
      .replace(/\n/g, "<br/>");

    return html.replace(/\uE000(\d+)\uE001/g, (_, index) => tokens[Number(index)] || "");
  };

  const renderCodeBlock = (code, lang) => {
    const safeLang = sanitizeCodeLanguage(lang);
    const className = safeLang ? ` class="language-${escapeAttribute(safeLang)}"` : "";
    const escapedCode = escapeHtml(String(code ?? "").trim());

    if (typeof options.codeBlockRenderer === "function") {
      return options.codeBlockRenderer({
        code: escapedCode,
        lang: safeLang,
        className,
        languageLabel: formatCodeLanguageLabel(lang),
        escapeHtml,
        escapeAttribute,
      });
    }

    const preStyle = options.preStyle ? ` style="${escapeAttribute(options.preStyle)}"` : "";
    const blockCodeStyle = options.blockCodeStyle ? ` style="${escapeAttribute(options.blockCodeStyle)}"` : "";
    return `<pre${preStyle}><code${className}${blockCodeStyle}>${escapedCode}</code></pre>`;
  };

  const renderList = (items, type) => {
    if (!items.length) return "";

    const isOrdered = type === "ordered";
    const isChecklist = type === "check";
    const tag = isOrdered ? "ol" : "ul";
    const listStyle = isChecklist
      ? options.checkListStyle || "margin: 8px 0 16px; padding-left: 8px; list-style: none;"
      : options.listStyle || `margin: 8px 0 16px; padding-left: 24px; list-style: ${isOrdered ? "decimal" : "disc"};`;
    const itemStyle = isChecklist
      ? options.checkListItemStyle || "margin: 6px 0; list-style: none;"
      : options.listItemStyle || "margin: 6px 0; padding-left: 4px;";
    const itemHtml = items
      .map((item) => {
        const marker = isChecklist
          ? `<span style="${escapeAttribute(item.checked ? options.checkedMarkerStyle || "color: #4ade80; margin-right: 6px;" : options.uncheckedMarkerStyle || "color: rgba(255,255,255,0.3); margin-right: 6px;")}">${item.checked ? "&#10003;" : "&#9633;"}</span>`
          : "";
        return `<li style="${escapeAttribute(itemStyle)}">${marker}${renderInline(item.text)}</li>`;
      })
      .join("");

    return `<${tag} style="${escapeAttribute(listStyle)}">${itemHtml}</${tag}>`;
  };

  const renderYoutubeEmbed = (line) => {
    if (!options.allowYouTubeEmbeds) return null;
    const match = line.match(/^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)(?:[^\s]*)?$/);
    const safeVideoId = String(match?.[1] || "").replace(/[^\w-]/g, "");
    if (!safeVideoId) return null;
    return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;margin:8px 0;"><iframe src="https://www.youtube.com/embed/${safeVideoId}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allowfullscreen></iframe></div>`;
  };

  const renderTable = (headers, rows) => {
    const headerHtml = headers.map((header) => `<th>${renderInline(header)}</th>`).join("");
    const rowHtml = rows
      .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
      .join("");
    return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowHtml}</tbody></table>`;
  };

  const lines = String(markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listItems = [];
  let listType = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p${paragraphStyle}>${renderInline(paragraph.join("\n"))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    html.push(renderList(listItems, listType));
    listItems = [];
    listType = null;
  };

  const pushListItem = (type, item) => {
    flushParagraph();
    if (listType && listType !== type) flushList();
    listType = type;
    listItems.push(item);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const fenceMatch = trimmed.match(/^```([^\s`]*)/);

    if (fenceMatch) {
      const codeLines = [];
      flushParagraph();
      flushList();
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      html.push(renderCodeBlock(codeLines.join("\n"), fenceMatch[1]));
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const youtubeEmbed = renderYoutubeEmbed(trimmed);
    if (youtubeEmbed) {
      flushParagraph();
      flushList();
      html.push(youtubeEmbed);
      continue;
    }

    if (options.allowTables && /^\|.+\|\s*$/.test(line) && /^\|[-| :]+\|\s*$/.test(lines[i + 1] || "")) {
      const headers = line.split("|").map((cell) => cell.trim()).filter(Boolean);
      const rows = [];
      i += 2;
      while (i < lines.length && /^\|.+\|\s*$/.test(lines[i])) {
        rows.push(lines[i].split("|").map((cell) => cell.trim()).filter(Boolean));
        i += 1;
      }
      i -= 1;
      flushParagraph();
      flushList();
      html.push(renderTable(headers, rows));
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const rawLevel = headingMatch[1].length;
      const mappedLevel = Math.min(rawLevel, 4);
      const heading = headingStyles[mappedLevel] || headingStyles[rawLevel] || {};
      const tag = heading.tag || `h${Math.min(rawLevel, 6)}`;
      const style = heading.style ? ` style="${escapeAttribute(heading.style)}"` : "";
      flushParagraph();
      flushList();
      html.push(`<${tag}${style}>${renderInline(headingMatch[2])}</${tag}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList();
      html.push(`<hr${hrStyle ? ` style="${escapeAttribute(hrStyle)}"` : ""} />`);
      continue;
    }

    const checkedMatch = line.match(/^\s*[-*+]\s+\[x\]\s+(.+)$/i);
    if (checkedMatch) {
      pushListItem("check", { text: checkedMatch[1], checked: true });
      continue;
    }

    const uncheckedMatch = line.match(/^\s*[-*+]\s+\[ \]\s+(.+)$/);
    if (uncheckedMatch) {
      pushListItem("check", { text: uncheckedMatch[1], checked: false });
      continue;
    }

    const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unorderedMatch) {
      pushListItem("unordered", { text: unorderedMatch[1] });
      continue;
    }

    const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (orderedMatch) {
      pushListItem("ordered", { text: orderedMatch[1] });
      continue;
    }

    const quoteMatch = line.match(/^>\s+(.+)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      html.push(`<blockquote${blockquoteStyle ? ` style="${escapeAttribute(blockquoteStyle)}"` : ""}>${renderInline(quoteMatch[1])}</blockquote>`);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return html.join("").trim();
}

export function createSafeMarkdownRenderer(getBaseUrl) {
  return {
    escapeHtml,
    escapeAttribute,
    sanitizeHttpUrl: (url) => sanitizeHttpUrl(url, getBaseUrl),
    renderSafeMarkdownToHTML: (markdown, options) => renderSafeMarkdownToHTML(markdown, options, getBaseUrl),
  };
}
