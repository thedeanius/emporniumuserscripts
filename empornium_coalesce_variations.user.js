// ==UserScript==
// @name           Empornium coalesce variations
// @namespace      empornium
// @description    Combines torrents of different variations to one row
// @include        /https?://www\.empornium\.(me|sx)/(torrents|user)\.php/
// @exclude        /https?://www\.empornium\.(me|sx)/torrents\.php\?id=/
// @exclude        /https?://www\.empornium\.(me|sx)/torrents\.php\?action=notify/
// @grant          none
// @version        5.1
// ==/UserScript==

const variationRegexes = [
  // resolutions
  /\d+p|sd(?!\w)|hd(?!\w)|uhd|fullhd|ultrahd|standard|\W\d{1}k|\d+p?x\d+p?|480|720|1080/ig,
  // extras
  /bts|(hq )*image *set|images|picset|with picset|\+?pictures|x\d+|uhq/ig,
  // framerate
  /\d+(?:\.\d+)?\s?fps/ig,
  // bitrate
  /(?:\d+(?:\.\d+)?\s?(?:k|m)bps)|mobile-(?:high|medium|low)|mobile/ig,
  // filetype
  /mpeg4|3gp|mp4|wmv|h\.?265|hvec|h\.?264/ig,
  // VR
  /(?:desktop|gear(?:vr)\/?daydream|smartphone|oculus\/?(?:vive)( rift)?|PlayStationVR PS4|playstation|Google Cardboard)(?: ?vr)?/ig,
    // reported torrents
  / \/ Reported/i
];

const soupCache = new Map();

// console.time('Total time combining torrents');
// console.time('Grouping torrents');
const multipleTorrents = groupVariations().filter(t => t.tableRows.length > 1);
// console.timeEnd('Grouping torrents');
// console.time('Combining torrents');
const combinedTorrents = combineTorrents(multipleTorrents);
combinedTorrents.forEach(combined => combined.old.parentElement.insertBefore(combined.tableRow, combined.old));
multipleTorrents.forEach(t => t.tableRows.forEach(r => r.remove()));
// console.timeEnd('Combining torrents');
// console.timeEnd('Total time combining torrents');

function combineTorrents(multiTorrent) {
  const combinedTorrents = [];
  for (const torrent of multiTorrent) {
    const tcells = [];
    for (let i = 0; i < 10; i++) {
      var td = document.createElement('td');
      td.className = 'data-cell-' + i;
      tcells.push(td);
    }
    const mt = extractData(torrent);
    if (mt.variations.every(e=>/mp4/i.test(e))) {
      for (let i = 0; i < mt.variations.length; i++) {
        mt.variations[i] = mt.variations[i].replace(/, mp4/i, '');
      }
      mt.cleanHeading = mt.cleanHeading + ' [mp4]';
    }
    const nameDiv = document.createElement('div');
    nameDiv.appendChild(mt.script);
    const title = mt.title;
    title.textContent = mt.cleanHeading;
    nameDiv.appendChild(title);

    const infoUl = document.createElement('ul');
    infoUl.style.cssText = 'float: right; list-style: none; text-align: right;';
    for (let i = 0; i < mt.variations.length; i++) {
      const li = document.createElement('li');
      if (mt.newTorrent[i]) {
        mt.newTorrent[i].style.cssText = 'float:none; margin-right: 4px';
        li.appendChild(mt.newTorrent[i]);
      }
      const variationName = document.createElement('a');
      variationName.textContent = mt.variations[i];
      variationName.href = mt.hrefs[i];
      variationName.title = mt.headings[i];
      li.appendChild(variationName);
      li.appendChild(mt.info[i]);
      li.style.marginRight = '0';
      li.style.marginBottom = '5px';
      infoUl.appendChild(li);
    }
    nameDiv.appendChild(infoUl);
    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'tags';
    for (const t of mt.tags) {
      tagsDiv.appendChild(t);
      tagsDiv.appendChild(document.createTextNode(' '));
    }
    nameDiv.appendChild(tagsDiv);

    tcells[0] = mt.category;
    tcells[1].appendChild(nameDiv);
    tcells[2].appendChild(makeList(mt.files));
    tcells[3].appendChild(makeList(mt.comments));
    tcells[4] = mt.time;
    tcells[5].appendChild(makeList(mt.sizes));
    tcells[6].appendChild(makeList(mt.snatches));
    tcells[7].appendChild(makeList(mt.seeders));
    tcells[8].appendChild(makeList(mt.leechers));
    if (isUnique(mt.uploaders)) mt.uploaders = mt.uploaders.slice(0, 1);
    tcells[9].appendChild(makeList(mt.uploaders));
    tcells[2].className = 'center';
    tcells[3].className = 'center';
    tcells[9].classList.add('user');
    for (const seed of tcells[7].querySelectorAll('li')) {
      if (seed.textContent === '0') seed.classList.add('r00');
    }

    const tr = document.createElement('tr');
    tr.className = 'torrent multi-torrent';
    tcells.forEach(c => tr.appendChild(c));
    combinedTorrents.push({ old: torrent.tableRows[0], tableRow: tr });
  }
  return combinedTorrents;
}

function heading(t) {
  return t.querySelector('a[onmouseover]').textContent;
}

function extractVariation(title) {
  let cleanTitle = title;
  const variations = [];
  for (const re of variationRegexes) {
    const matches = cleanTitle.match(re);
    if (!matches) continue;
    const token = matches.join(' ');
    variations.push(token);
    for (const match of matches) {
      cleanTitle = cleanTitle.replace(match, '');
    }
  }
  cleanTitle = cleanTitle.replace(/\!+|\+|,|\&| \/$|\[\s?\]|\(\s?\)/g, '').replace(/\[.?\]|\(.?\)/g, '');
  cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim().replace(/ \.|( \-|in|freeleech|\[req\])$/i, '').trim();
  if (variations.length < 1) variations.push('other');
  return { variation: '[' + variations.join(', ') + ']', cleanTitle: cleanTitle };
}

function groupVariations() {
  const torrents = [...document.querySelectorAll('tr.torrent')];
  const first = torrents.shift();
  const firstVariation = extractVariation(heading(first));
  const torrentTable = [{ cleanHeading: firstVariation.cleanTitle, tableRows: [first], variations: [firstVariation] }];
  for (const torrent of torrents) {
    const variation = extractVariation(heading(torrent));
    const cleanHeading = variation.cleanTitle;
    let found = false;
    for (const t of torrentTable) {
      if (charSoup(t.cleanHeading) === charSoup(cleanHeading)) {
        found = true;
        t.tableRows.push(torrent);
        t.variations.push(variation);
        break;
      }
    }
    if (!found) {
      torrentTable.push({ cleanHeading: cleanHeading, tableRows: [torrent], variations: [variation] });
    }
  }
  return torrentTable;
}

function extractData(bunch) {
  const multiTorrent = {};
  multiTorrent.cleanHeading = bunch.cleanHeading;
  multiTorrent.headings = [];
  multiTorrent.variations = [];
  multiTorrent.hrefs = [];
  multiTorrent.info = [];
  multiTorrent.newTorrent = [];
  multiTorrent.files = [];
  multiTorrent.comments = [];
  multiTorrent.sizes = [];
  multiTorrent.snatches = [];
  multiTorrent.seeders = [];
  multiTorrent.leechers = [];
  multiTorrent.uploaders = [];
  let tags = [];
  let tds;
  let rowIndex = 0;
  for (const row of bunch.tableRows) {
    const title = heading(row);
    multiTorrent.headings.push(title);
    multiTorrent.variations.push(bunch.variations[rowIndex++].variation);
    tags = tags.concat([...row.querySelector('div.tags').children]);
    multiTorrent.hrefs.push(row.querySelector('a[onmouseover]').href);
    multiTorrent.info.push(row.querySelector('span[style]'));
    multiTorrent.newTorrent.push(row.querySelector('span.newtorrent'));

    tds = row.querySelectorAll('td');
    multiTorrent.files.push(tds[2].innerHTML);
    multiTorrent.comments.push(tds[3].innerHTML);
    multiTorrent.sizes.push(tds[5].innerHTML);
    multiTorrent.snatches.push(tds[6].innerHTML);
    multiTorrent.seeders.push(tds[7].innerHTML);
    multiTorrent.leechers.push(tds[8].innerHTML);
    multiTorrent.uploaders.push(tds[9].innerHTML);
  }
  const uniqueTags = tags.reduce((prev, tag) => {
    for (const t of prev) {
      if (t.textContent === tag.textContent) return prev;
    }
    prev.push(tag);
    return prev;
  }, []);
  multiTorrent.tags = uniqueTags;
  multiTorrent.category = tds[0];
  multiTorrent.time = tds[4];
  multiTorrent.script = bunch.tableRows[0].querySelector('script');
  multiTorrent.title = bunch.tableRows[0].querySelector('a[onmouseover]');
  return multiTorrent;
}

function makeList(list) {
  const ul = document.createElement('ul');
  ul.style.listStyle = 'none';
  ul.className = 'nobr';
  for (const el of list) {
    const li = document.createElement('li');
    li.style.margin = '0';
    li.innerHTML = el;
    ul.appendChild(li);
  }
  return ul;
}

function charSoup(_string) {
  const cached = soupCache.get(_string);
  if (cached)
    return cached;

  let string = _string;
  const irrelevant = [
    /{Se7enSeas}|{The Rat Bastards}/gi,  // group names
    /( in )/gi,   // connecting words
    /\.(com|org)/gi,    // TLDs
    // /(\d+.\d+.\d+)/gi,    // dates
    /[\s\W]/gi    // non word characters and whitespace
  ];
  for (const ex of irrelevant) {
    string = string.replace(ex, '');
  }
  string = string.toLowerCase();
  soupCache.set(_string, string);
  return string;
}

function isUnique(list) {
  return list.reduce((acc, el) => {
    if (acc.includes(el)) return acc;
    return [el, ...acc];
  }, []).length === 1;
}
