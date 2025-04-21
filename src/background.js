// wrap chrome vs browser
const ext = (typeof browser === "undefined") ? chrome : browser;

// helper to run a function in page context
async function evalOnTab(tabId, func, args = []) {
  if (ext.scripting && ext.scripting.executeScript) {
    // Chrome MV3 & Firefox 109+ (if scripting API is supported)
    return ext.scripting.executeScript({
      target: { tabId },
      func,
      args
    });
  } else {
    // Firefox MV2 (and Firefox Android)
    const code = `(${func.toString()})(${args.map(a => JSON.stringify(a)).join(',')});`;
    const results = await ext.tabs.executeScript(tabId, { code });
    // normalize to [ { result } ] shape
    return results.map(r => ({ result: r }));
  }
}

async function buildMenu() {
  const { menuItems = [] } = await ext.storage.local.get(['menuItems']);
  await ext.contextMenus.removeAll();

  const entries = menuItems.map((item, idx) => {
    const hasAny = item.forLink || item.forSelection || item.forContent;
    return {
      item, idx,
      forLink:      item.forLink      || !hasAny,
      forSelection: item.forSelection || !hasAny,
      forContent:   item.forContent   || !hasAny
    };
  });

  const linkEntries    = entries.filter(e => e.forLink);
  const selEntries     = entries.filter(e => e.forSelection);
  const contentEntries = entries.filter(e => e.forContent);

  const rootContexts = [];
  if (linkEntries.length)    rootContexts.push('link');
  if (selEntries.length)     rootContexts.push('selection');
  if (contentEntries.length) rootContexts.push('page');
  if (!rootContexts.length) return;

  await ext.contextMenus.create({
    id: 'root',
    title: 'Send to GPT',
    contexts: rootContexts
  });

  async function renderSection(list, ctx) {
    for (const { item, idx } of list) {
      await ext.contextMenus.create({
        id: `item-${ctx}-${idx}`,
        parentId: 'root',
        title: item.name,
        contexts: [ ctx === 'content' ? 'page' : ctx ]
      });
    }
  }

  await renderSection(linkEntries, 'link');
  await renderSection(selEntries, 'selection');
  await renderSection(contentEntries, 'content');
}

ext.runtime.onInstalled.addListener(buildMenu);
ext.runtime.onStartup.addListener(buildMenu);
ext.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.menuItems) buildMenu();
});

ext.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.menuItemId.startsWith('item-') || !tab?.id) return;
  const [, ctx, idxStr] = info.menuItemId.split('-');
  const idx = Number(idxStr);
  const { menuItems = [] } = await ext.storage.local.get('menuItems');
  const promptItem = menuItems[idx];
  if (!promptItem) return;

  let input = '';
  if (ctx === 'selection') {
    input = info.selectionText || '';
  } else if (ctx === 'link') {
    input = info.linkUrl || '';
  } else if (ctx === 'content') {
    const selector = promptItem.selector?.trim() || 'body';
    const type     = promptItem.outputType   || 'html';
    const maxItems = promptItem.maxItems;

    const [{ result }] = await evalOnTab(tab.id,
      (sel, outType, max) => {
        let nodes = Array.from(document.querySelectorAll(sel));
        if (max && nodes.length > max) nodes = nodes.slice(0, max);
        return nodes.map(el =>
          outType === 'text' ? el.innerText : el.outerHTML
        ).join('\n');
      },
      [selector, type, maxItems]
    );
    input = result || '';
  }

  const base = promptItem.prompt;
  const text = base.includes('{{content}}')
    ? base.replace(/{{content}}/g, input)
    : `${base.trim()} ${input}`;

  const webUrl = `https://chatgpt.com?model=${encodeURIComponent(promptItem.model)}&q=${encodeURIComponent(text)}`;

  // on Android use the ChatGPT app deep‑link if available
  let urlToOpen = webUrl;
  try {
    const { os } = await ext.runtime.getPlatformInfo();
    if (os === 'android') {
      // deep‐link into the ChatGPT Android app
      urlToOpen = `chatgpt://chat?model=${encodeURIComponent(promptItem.model)}&q=${encodeURIComponent(text)}`;
    }
  } catch (e) {
    // fallback to web if getPlatformInfo fails
  }

  ext.tabs.create({ url: urlToOpen });
});