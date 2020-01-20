'use strict';

{
  const onStartup = () => chrome.contextMenus.create({
    title: 'Open with ' + chrome.runtime.getManifest().name,
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

chrome.browserAction.onClicked.addListener(() => chrome.tabs.create({
  url: 'data/reader/index.html'
}));

// FAQs and Feedback
{
  const {onInstalled, setUninstallURL, getManifest} = chrome.runtime;
  const {name, version} = getManifest();
  const page = getManifest().homepage_url;
  onInstalled.addListener(({reason, previousVersion}) => {
    chrome.storage.local.get({
      'faqs': true,
      'last-update': 0
    }, prefs => {
      if (reason === 'install' || (prefs.faqs && reason === 'update')) {
        const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
        if (doUpdate && previousVersion !== version) {
          chrome.tabs.create({
            url: page + '?version=' + version +
              (previousVersion ? '&p=' + previousVersion : '') +
              '&type=' + reason,
            active: reason === 'install'
          });
          chrome.storage.local.set({'last-update': Date.now()});
        }
      }
    });
  });
  setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
}
