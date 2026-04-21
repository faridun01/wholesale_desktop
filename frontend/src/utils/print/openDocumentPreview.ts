const PREVIEW_WINDOW_FEATURES = {
  a4: 'popup=yes,width=1280,height=900,resizable=yes,scrollbars=yes',
  receipt: 'popup=yes,width=460,height=820,resizable=yes,scrollbars=yes',
} as const;

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function extractPreviewParts(sourceHtml: string) {
  const styles = Array.from(sourceHtml.matchAll(/<style[^>]*>[\s\S]*?<\/style>/gi))
    .map((match) => match[0])
    .join('\n');

  const bodyMatch = sourceHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : sourceHtml;

  const cleanedBody = bodyContent
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<\/?head[^>]*>/gi, '')
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta[^>]*>/gi, '')
    .trim();

  return {
    styles,
    bodyContent: cleanedBody,
  };
}

function buildPreviewHtml(title: string, html: string, type: 'a4' | 'receipt') {
  const safeTitle = escapeHtml(title);
  const safeFileName = title.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document';
  const { styles: documentStyles, bodyContent } = extractPreviewParts(html);
  const toolbarHtml = `
    <div class="preview-toolbar no-print">
      <div class="preview-toolbar__meta">
        <div class="preview-toolbar__eyebrow">Предпросмотр документа</div>
        <div class="preview-toolbar__title">${safeTitle}</div>
      </div>
      <div class="preview-toolbar__actions">
        <button type="button" class="preview-button preview-button--secondary" data-action="save">Сохранить</button>
        <button type="button" class="preview-button preview-button--primary" data-action="print">Печать</button>
      </div>
    </div>
  `;

  const screenStyles = `
    <style id="preview-shell-styles">
      :root {
        color-scheme: light;
        --preview-bg: #eef2f7;
        --preview-panel: rgba(255, 255, 255, 0.96);
        --preview-border: rgba(15, 23, 42, 0.08);
        --preview-text: #0f172a;
        --preview-muted: #64748b;
        --preview-accent: #f59e0b;
        --preview-accent-strong: #d97706;
      }

      html, body {
        margin: 0;
        padding: 0;
        background: var(--preview-bg);
      }

      body {
        min-height: 100vh;
        color: var(--preview-text);
      }

      .preview-shell {
        min-height: 100vh;
      }

      .preview-toolbar {
        position: sticky;
        top: 0;
        z-index: 20;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 22px;
        border-bottom: 1px solid var(--preview-border);
        background: var(--preview-panel);
        backdrop-filter: blur(14px);
      }

      .preview-toolbar__meta {
        min-width: 0;
      }

      .preview-toolbar__eyebrow {
        margin-bottom: 2px;
        color: var(--preview-muted);
        font: 700 10px/1.2 Arial, sans-serif;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }

      .preview-toolbar__title {
        color: var(--preview-text);
        font: 800 20px/1.2 Arial, sans-serif;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .preview-toolbar__actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
      }

      .preview-button {
        appearance: none;
        border-radius: 12px;
        border: 1px solid var(--preview-border);
        padding: 10px 16px;
        font: 800 12px/1 Arial, sans-serif;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        cursor: pointer;
        transition: transform 140ms ease, background-color 140ms ease, border-color 140ms ease, color 140ms ease;
      }

      .preview-button:hover {
        transform: translateY(-1px);
      }

      .preview-button--secondary {
        background: #fff;
        color: var(--preview-text);
      }

      .preview-button--secondary:hover {
        border-color: rgba(15, 23, 42, 0.18);
        background: #f8fafc;
      }

      .preview-button--primary {
        border-color: transparent;
        background: var(--preview-accent);
        color: #fff;
      }

      .preview-button--primary:hover {
        background: var(--preview-accent-strong);
      }

      .preview-document {
        padding: ${type === 'a4' ? '24px 28px 40px' : '16px 0 32px'};
      }

      @media print {
        .no-print {
          display: none !important;
        }

        .preview-document {
          padding: 0 !important;
        }
      }
    </style>
  `;

  const interactionScript = `
    <script>
      (() => {
        const sourceHtml = ${JSON.stringify(html)};
        const fileName = ${JSON.stringify(safeFileName)};

        const saveDocument = () => {
          const blob = new Blob([sourceHtml], { type: 'text/html;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName + '.html';
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        };

        window.addEventListener('DOMContentLoaded', () => {
          const printButton = document.querySelector('[data-action="print"]');
          const saveButton = document.querySelector('[data-action="save"]');

          if (printButton) {
            printButton.addEventListener('click', () => window.print());
          }

          if (saveButton) {
            saveButton.addEventListener('click', saveDocument);
          }
        });
      })();
    </script>
  `;

  return `
    <!DOCTYPE html>
    <html lang="ru">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${safeTitle}</title>
        ${screenStyles}
        ${documentStyles}
      </head>
      <body>
        <div class="preview-shell">
          ${toolbarHtml}
          <div class="preview-document">${bodyContent}</div>
        </div>
        ${interactionScript}
      </body>
    </html>
  `;
}

export function openDocumentPreview(title: string, html: string, type: 'a4' | 'receipt') {
  if (typeof window === 'undefined') {
    return { ok: false as const, reason: 'invalid' as const };
  }

  const windowName = `print-preview-${type}`;
  const previewWindow = window.open('', windowName, PREVIEW_WINDOW_FEATURES[type]);

  if (!previewWindow) {
    return { ok: false as const, reason: 'blocked' as const };
  }

  previewWindow.document.open();
  previewWindow.document.write(buildPreviewHtml(title, html, type));
  previewWindow.document.close();
  previewWindow.document.title = title;
  previewWindow.focus();

  return { ok: true as const };
}
