(function () {
  'use strict';

  var root = document.querySelector('[data-ordinance-browser]');
  if (!root) return;

  var SNAPSHOT_URLS = [
    { url: 'https://data.betterbaguio.org/data/ordinances.json', label: 'weekly data copy' },
    { url: '/data/ordinances.json', label: 'built-in backup copy' }
  ];
  var PAGE_SIZE = 30;
  var snapshot = null;
  var visibleLimit = PAGE_SIZE;
  var elements = {
    retrieved: document.querySelector('[data-ordinance-retrieved]'),
    count: document.querySelector('[data-ordinance-count]'),
    years: document.querySelector('[data-ordinance-years]'),
    range: document.querySelector('[data-ordinance-range]'),
    latest: document.querySelector('[data-ordinance-latest]'),
    latestLabel: document.querySelector('[data-ordinance-latest-label]'),
    search: document.querySelector('[data-ordinance-search]'),
    year: document.querySelector('[data-ordinance-year]'),
    clear: document.querySelector('[data-ordinance-clear]'),
    list: document.querySelector('[data-ordinance-list]'),
    summary: document.querySelector('[data-ordinance-results-summary]'),
    more: document.querySelector('[data-ordinance-more]')
  };

  function formatNumber(value) {
    return new Intl.NumberFormat('en-PH').format(value);
  }

  function formatRetrieved(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return 'Update time unavailable';
    return 'Updated ' + new Intl.DateTimeFormat('en-PH', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Manila'
    }).format(date) + ' PHT';
  }

  function formatSize(bytes) {
    if (!Number.isFinite(Number(bytes))) return 'PDF';
    var units = ['B', 'KB', 'MB'];
    var value = Number(bytes);
    var unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return value.toFixed(unit === 0 ? 0 : 1) + ' ' + units[unit] + ' PDF';
  }

  function appendText(parent, tag, text, className) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function searchText(ordinance) {
    return [ordinance.number, ordinance.year, ordinance.title, ordinance.summary]
      .concat(ordinance.keywords || []).join(' ').toLowerCase();
  }

  function filteredOrdinances() {
    var terms = elements.search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    var year = elements.year.value;
    return snapshot.ordinances.filter(function (ordinance) {
      if (year && String(ordinance.year) !== year) return false;
      if (!terms.length) return true;
      var haystack = ordinance._search || (ordinance._search = searchText(ordinance));
      return terms.every(function (term) { return haystack.indexOf(term) !== -1; });
    });
  }

  function renderCard(ordinance) {
    var card = document.createElement('article');
    card.className = 'bb-ordinance-card';

    var meta = document.createElement('div');
    meta.className = 'bb-ordinance-meta';
    appendText(meta, 'span', String(ordinance.year), 'bb-ordinance-year');
    appendText(meta, 'strong', 'Ordinance ' + ordinance.number);
    card.appendChild(meta);

    appendText(card, 'h3', ordinance.summary || 'Ordinance ' + ordinance.number);
    if (ordinance.title && ordinance.title !== ordinance.summary) {
      appendText(card, 'p', ordinance.title, 'bb-ordinance-title');
    }

    if (ordinance.keywords && ordinance.keywords.length) {
      var tags = document.createElement('div');
      tags.className = 'bb-ordinance-tags';
      ordinance.keywords.slice(0, 4).forEach(function (keyword) {
        appendText(tags, 'span', keyword);
      });
      card.appendChild(tags);
    }

    var actions = document.createElement('div');
    actions.className = 'bb-ordinance-actions';
    var recordLink = appendText(actions, 'a', 'View official record →');
    recordLink.href = ordinance.officialPage;
    recordLink.target = '_blank';
    recordLink.rel = 'noopener';
    var pdfLink = appendText(actions, 'a', formatSize(ordinance.pdf && ordinance.pdf.sizeBytes), 'bb-ordinance-pdf');
    pdfLink.href = ordinance.pdf.url;
    pdfLink.target = '_blank';
    pdfLink.rel = 'noopener';
    pdfLink.setAttribute('aria-label', 'Open official PDF for ordinance ' + ordinance.number);
    card.appendChild(actions);
    return card;
  }

  function updateUrl() {
    var params = new URLSearchParams();
    if (elements.search.value.trim()) params.set('q', elements.search.value.trim());
    if (elements.year.value) params.set('year', elements.year.value);
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params.toString() : ''));
  }

  function render() {
    var matches = filteredOrdinances();
    elements.list.textContent = '';
    elements.list.setAttribute('aria-busy', 'false');
    if (!matches.length) {
      appendText(elements.list, 'p', 'No ordinances match those filters. Try a shorter phrase, another year, or the ordinance number.', 'bb-ordinance-empty');
      elements.more.hidden = true;
    } else {
      var fragment = document.createDocumentFragment();
      matches.slice(0, visibleLimit).forEach(function (ordinance) { fragment.appendChild(renderCard(ordinance)); });
      elements.list.appendChild(fragment);
      elements.more.hidden = matches.length <= visibleLimit;
    }
    var shown = Math.min(visibleLimit, matches.length);
    elements.summary.textContent = 'Showing ' + formatNumber(shown) + ' of ' + formatNumber(matches.length) + ' matching ordinances.';
    updateUrl();
  }

  function populate() {
    snapshot.availableYears.forEach(function (year) {
      var option = document.createElement('option');
      option.value = String(year);
      option.textContent = String(year);
      elements.year.appendChild(option);
    });
    var newestYear = snapshot.availableYears[0];
    var oldestYear = snapshot.availableYears[snapshot.availableYears.length - 1];
    var newestCount = snapshot.ordinances.filter(function (ordinance) { return ordinance.year === newestYear; }).length;
    elements.count.textContent = formatNumber(snapshot.recordCount);
    elements.years.textContent = formatNumber(snapshot.availableYears.length);
    elements.range.textContent = oldestYear + '–' + newestYear;
    elements.latest.textContent = formatNumber(newestCount);
    elements.latestLabel.textContent = newestYear + ' ordinances';
  }

  function applyInitialQuery() {
    var params = new URLSearchParams(location.search);
    elements.search.value = params.get('q') || '';
    var requestedYear = params.get('year');
    if (requestedYear && snapshot.availableYears.indexOf(Number(requestedYear)) !== -1) elements.year.value = requestedYear;
  }

  function renderError() {
    elements.retrieved.textContent = 'We could not load the ordinance archive.';
    elements.list.textContent = '';
    elements.list.setAttribute('aria-busy', 'false');
    appendText(elements.list, 'p', 'Ordinance data is temporarily unavailable. You can still use the official City Council database linked above.', 'bb-ordinance-empty');
    elements.summary.textContent = 'Ordinances are temporarily unavailable.';
  }

  function loadSnapshot(index) {
    var source = SNAPSHOT_URLS[index];
    if (!source) return Promise.reject(new Error('No snapshot source available'));
    return fetch(source.url).then(function (response) {
      if (!response.ok) throw new Error('Snapshot request failed');
      return response.json();
    }).then(function (data) {
      if (!data || !Array.isArray(data.ordinances) || !Array.isArray(data.availableYears)) throw new Error('Invalid ordinance snapshot');
      return { data: data, label: source.label };
    }).catch(function () { return loadSnapshot(index + 1); });
  }

  root.addEventListener('submit', function (event) { event.preventDefault(); });
  elements.search.addEventListener('input', function () { visibleLimit = PAGE_SIZE; render(); });
  elements.year.addEventListener('change', function () { visibleLimit = PAGE_SIZE; render(); });
  elements.clear.addEventListener('click', function () {
    elements.search.value = '';
    elements.year.value = '';
    visibleLimit = PAGE_SIZE;
    render();
    elements.search.focus();
  });
  elements.more.addEventListener('click', function () { visibleLimit += PAGE_SIZE; render(); });

  loadSnapshot(0).then(function (result) {
    snapshot = result.data;
    populate();
    applyInitialQuery();
    elements.retrieved.textContent = formatRetrieved(snapshot.retrievedAt) + ' · ' + formatNumber(snapshot.recordCount) + ' records · ' + result.label;
    render();
  }).catch(renderError);
}());
