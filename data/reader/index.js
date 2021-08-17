/* globals ePub */
'use strict';

const args = new URLSearchParams(location.search);
const book = ePub();

const app = {
  on(name, callback) {
    app.cache[name] = app.cache[name] || [];
    app.cache[name].push(callback);
  },
  emit(name, ...values) {
    for (const c of (app.cache[name] || [])) {
      c(...values);
    }
  }
};
app.cache = {};

const prefs = {
  theme: 'sepia',
  font: 'sans',
  size: 13,
  width: 0,
  height: 22
};

const $ = {
  content: document.getElementById('content'),
  nav: {
    next: document.querySelector('#nav [data-command=next]'),
    previous: document.querySelector('#nav [data-command=previous]')
  }
};

const ui = {
  mode() {
    document.documentElement.dataset.mode = prefs.theme;
    book.rendition.themes.select(prefs.theme);
  },
  family() {
    book.rendition.themes.font(ui.fonts[prefs.font]);
  },
  size() {
    book.rendition.themes.fontSize(prefs.size + 'px');
  },
  width() {
    const width = ui.width.value;
    book.rendition.resize(width, '100%');
  },
  height() {
    document.querySelector('[data-command="no-height"]').dataset.selected = prefs.height === 0;
    const height = prefs.height ? prefs.height + 'px' : 'unset';
    book.rendition.themes.override('line-height', height, true);
  }
};
Object.defineProperty(ui.width, 'value', {
  get() {
    document.querySelector('[data-command="full-width"]').dataset.selected = prefs.width === 0;
    return prefs.width ? prefs.width + 'px' : '100%';
  }
});

// font tools
{
  const popup = document.getElementById('font-tools');
  app.on('hide-font-tools', () => {
    popup.classList.remove('hidden');
    popup.focus();
  });
  popup.addEventListener('blur', e => {
    e.target.classList.add('hidden');
  });
}

function humanFileSize(size) {
  const i = Math.floor(Math.log(size) / Math.log(1024));
  return (size / Math.pow(1024, i)).toFixed(2) * 1 + ' ' + ['B', 'kB', 'MB', 'GB', 'TB'][i];
};

app.on('prefs-ready', async () => {
  if (args.has('href')) {
    // prevent the empty content from being displayed
    $.content.textContent = ' ';
    const name = chrome.runtime.getManifest().name;
    document.title = name + ` (0%)`;

    try {
      const response = await fetch(args.get('href'));
      const total = Number(response.headers.get('Content-Length') || 0);
      if (!total) {
        document.title = name + '(please wait...)';
      }
      const reader = response.body.getReader();

      const chunks = [];
      let size = 0;
      while (true) {
        const {done, value} = await reader.read();
        if (done) {
          break;
        }
        chunks.push(value);
        size += value.length;
        if (total) {
          document.title = name + ` (${(size / total * 100).toFixed(0)}%)`;
        }
        else {
          document.title = name + ` (${humanFileSize(size)})`;
        }
      }
      const buffer = await (new Blob(chunks)).arrayBuffer();
      book.open(buffer);
    }
    catch (e) {
      console.warn(e);
      alert(e.message);
    }
  }
  else {
    document.body.classList.remove('loading');
  }
});
document.addEventListener('drop', e => {
  e.preventDefault();
  for (const item of e.dataTransfer.items) {
    document.body.classList.add('loading');
    if (item.kind === 'file') {
      const file = item.getAsFile();
      const reader = new FileReader();
      reader.onload = () => book.open(reader.result);
      reader.onerror = e => {
        alert('Failed:\n\n' + e.message);
      };
      reader.readAsArrayBuffer(file);
      break;
    }
  }
});
document.addEventListener('dragover', e => {
  e.preventDefault();
});
book.loaded.navigation.then(navigation => app.emit('navigation-ready', navigation));

// open cfi
app.on('navigation-ready', navigation => {
  const cfi = args.get('cfi');
  book.rendition.display(cfi ? decodeURIComponent(cfi) : navigation.toc[0].href);
});
// build Table of Contents
app.on('navigation-ready', navigation => {
  const frag = document.createDocumentFragment();
  for (const obj of navigation.toc) {
    const option = document.createElement('option');
    option.value = obj.href;
    option.textContent = obj.label;
    frag.appendChild(option);
    for (const sub of [...obj.subitems]) {
      const option = document.createElement('option');
      option.value = sub.href;
      option.textContent = ' -> ' + sub.label;
      frag.appendChild(option);
    }
  }
  const toc = document.querySelector('#toc select');
  toc.appendChild(frag);
  // change content
  toc.addEventListener('change', e => book.rendition.display(e.target.value));
  // update TOC
  app.on('navigation-item', nav => {
    if (nav?.href) {
      toc.value = nav.href;
    }
  });
});

app.on('prefs-ready', () => {
  const ss = getComputedStyle(document.documentElement);
  const rendition = book.renderTo($.content, {
    width: ui.width.value,
    spread: 'none',
    stylesheet: 'data:text/css;base64,' + btoa(`

    `)
  });
  rendition.on('relocated', locations => app.emit('relocated', locations));
  // default theme fixes
  rendition.themes.default({
    'p': {
      'font-family': 'inherit',
      'line-height': 'inherit'
    },
    'a': {
      'color': 'inherit !important'
    },
    '.galley-rw': {
      'font-family': 'inherit',
      'line-height': 'inherit'
    },
    '.title-block-rw h1': {
      'font-family': 'inherit'
    }
  });
  // themes
  rendition.themes.register('sepia', {
    '*': {
      'color': ss.getPropertyValue('--color-mode-sepia') + '!important',
      'background-color': ss.getPropertyValue('--bg-color-mode-sepia') + '!important'
    }
  });
  rendition.themes.register('dark', {
    '*': {
      'color': ss.getPropertyValue('--color-mode-dark') + '!important',
      'background-color': ss.getPropertyValue('--bg-color-mode-dark') + '!important'
    }
  });
  rendition.themes.register('light', {
    '*': {
      'color': ss.getPropertyValue('--color-mode-light') + '!important',
      'background-color': ss.getPropertyValue('--bg-color-mode-light') + '!important'
    }
  });
  // font family
  ui.fonts = {
    sans: ss.getPropertyValue('--sans'),
    serif: ss.getPropertyValue('--serif')
  };
  //
  app.emit('rendition', rendition);
});

app.on('relocated', ({start}) => {
  const spine = book.spine.get(start.cfi);
  const nav = book.navigation.get(spine.href);
  if (nav && nav.href === start.href) {
    return app.emit('navigation-item', nav);
  }
  const href = book.canonical(start.href);
  for (const item of book.navigation.toc) {
    for (const obj of [item, ...item.subitems]) {
      if (book.canonical(obj.href) == href) {
        return app.emit('navigation-item', obj);
      }
    }
  }
  app.emit('navigation-item', book.navigation.toc[start.index]);
});
// title
app.on('navigation-item', nav => {
  document.title = nav?.label || chrome.runtime.getManifest().name;
});
// page number
{
  const page = document.getElementById('page');
  const total = document.getElementById('total');

  app.on('relocated', e => {
    const {start: {displayed}} = e;
    page.textContent = displayed.page;
    total.textContent = displayed.total;
  });
}
// navigation previous
{
  const previous = document.querySelector('[data-command=previous]');
  app.on('relocated', ({atStart}) => previous.disabled = atStart);
  app.on('previous-page', () => previous.click());
}
// navigation next
{
  const next = document.querySelector('[data-command=next]');
  app.on('relocated', ({atEnd}) => next.disabled = atEnd);
  app.on('next-page', () => next.click());
}
// remove loading
app.on('relocated', () => document.body.classList.remove('loading'));
// update HREF
app.on('relocated', ({start: {cfi}}) => {
  args.set('cfi', cfi);
  history.replaceState({}, '', '?' + args);
});

// keypress
app.on('rendition', rendition => {
  const keyup = e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      app.emit('next-page');
    }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      app.emit('previous-page');
    }
  };
  rendition.on('keyup', keyup);
  document.addEventListener('keyup', keyup);
});
// mouse
// document.addEventListener('wheel', e => console.log(e));
// user preference
app.on('rendition', ui.mode);
app.on('rendition', ui.size);
app.on('rendition', ui.height);
app.on('rendition', ui.family);

// commands
document.addEventListener('click', e => {
  const command = e.target.dataset.command;

  if (command === 'next' || command === 'previous') {
    document.body.classList.add('loading');
  }
  if (command === 'next') {
    book.rendition.next();
  }
  else if (command === 'previous') {
    book.rendition.prev();
  }
  else if (command === 'font-selector') {
    app.emit('hide-font-tools');
  }
  else if (command === 'light' || command === 'dark' || command === 'sepia') {
    prefs.theme = command;
    ui.mode();
    chrome.storage.local.set({
      theme: command
    });
  }
  else if (command === 'serif' || command === 'sans') {
    prefs.font = command;
    ui.family();
    chrome.storage.local.set({
      font: command
    });
  }
  else if (command === 'minus' || command === 'plus') {
    if (command === 'minus') {
      prefs.size -= 1;
      prefs.size = Math.max(8, prefs.size);
    }
    else {
      prefs.size += 1;
      prefs.size = Math.min(32, prefs.size);
    }
    ui.size();
    chrome.storage.local.set({
      size: prefs.size
    });
  }
  else if (command === 'width-minus' || command === 'width-plus' || command === 'full-width') {
    if (command === 'full-width') {
      prefs.width = prefs.width === 0 ? 800 : 0;
    }
    else {
      prefs.width = prefs.width || 800;
      if (command === 'width-minus') {
        prefs.width -= 50;
        prefs.width = Math.max(100, prefs.width);
      }
      else {
        prefs.width += 50;
        prefs.width = Math.min(4000, prefs.width);
      }
    }
    ui.width();
    chrome.storage.local.set({
      width: prefs.width
    });
  }
  else if (command === 'height-expand' || command === 'height-compact' || command === 'no-height') {
    if (command === 'no-height') {
      prefs.height = prefs.height === 0 ? 28.8 : 0;
    }
    else {
      prefs.height = command === 'height-expand' ? 32 : 28.8;
    }
    ui.height();
    chrome.storage.local.set({
      height: prefs.height
    });
  }
  else if (command === 'fullscreen') {
    if (document.fullscreen) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      }
      else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
    else {
      if (document.body.requestFullscreen) {
        document.body.requestFullscreen();
      }
      else if (document.body.mozRequestFullScreen) {
        document.body.mozRequestFullScreen();
      }
      else if (document.body.webkitRequestFullscreen) {
        document.body.webkitRequestFullscreen();
      }
    }
  }
  else if (command === 'close') {
    if (document.fullscreen) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      }
      else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
    else {
      window.close();
    }
  }
});

chrome.storage.local.get(prefs, ps => {
  Object.assign(prefs, ps);
  app.emit('prefs-ready');
});
