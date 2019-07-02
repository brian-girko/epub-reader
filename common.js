'use strict';

{
  const onStartup = () => chrome.contextMenus.create({
    title: 'Open with ePub Reader',
    contexts: ['link'],
    targetUrlPatterns: [
      '*://*/*.epub*',
      '*://*/*.opf*'
    ]
  });
  chrome.runtime.onInstalled.addListener(onStartup);
  chrome.runtime.onStartup.addListener(onStartup);
}

chrome.contextMenus.onClicked.addListener(info => {
  chrome.permissions.request({
    origins: [info.linkUrl]
  }, granted => granted && chrome.tabs.create({
    url: 'data/reader/index.html?href=' + encodeURIComponent(info.linkUrl)
  }));
});
