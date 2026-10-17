(function () {
  'use strict';

  var root = document.querySelector('[data-sentiment-meter]');
  if (!root) return;

  var preview = /[?&]sentiment=preview\b/.test(window.location.search);
  // No data-sentiment-src means the live feed isn't published yet: skip the
  // request entirely (a 404 on every visit) unless previewing local sample data.
  var SOURCE = root.getAttribute('data-sentiment-src') || (preview ? '/data/sentiment.json' : '');
  if (!SOURCE) return;
  var SIDES = [
    { key: 'critical', label: 'Upset' },
    { key: 'neutral', label: 'Neutral' },
    { key: 'supportive', label: 'Happy' }
  ];

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function onTopic(counts) {
    return counts.supportive + counts.critical + counts.neutral;
  }

  function pct(part, whole) {
    return whole ? Math.round((part / whole) * 100) : 0;
  }

  function signed(score) {
    if (score > 0) return '+' + score;
    if (score < 0) return '−' + Math.abs(score);
    return '0';
  }

  function describe(score) {
    if (score <= -40) return 'Mostly upset';
    if (score <= -10) return 'Leaning upset';
    if (score < 10) return 'Mixed reactions';
    if (score < 40) return 'Leaning happy';
    return 'Mostly happy';
  }

  function formatDate(iso) {
    var date = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ── Tooltip (an enhancement; every value is also printed as text) ─────────
  var tooltip = el('div', 'bb-pulse-tooltip');
  tooltip.setAttribute('role', 'presentation');
  tooltip.hidden = true;
  document.body.appendChild(tooltip);

  function showTooltip(segment, x, y) {
    tooltip.textContent = '';
    tooltip.appendChild(el('strong', null, segment.getAttribute('data-value')));
    tooltip.appendChild(el('span', null, segment.getAttribute('data-label')));
    tooltip.hidden = false;
    var box = tooltip.getBoundingClientRect();
    var left = Math.min(Math.max(8, x - box.width / 2), window.innerWidth - box.width - 8);
    tooltip.style.left = left + window.scrollX + 'px';
    tooltip.style.top = y + window.scrollY - box.height - 12 + 'px';
  }

  function hideTooltip() {
    tooltip.hidden = true;
  }

  function bindTooltip(segment) {
    segment.addEventListener('pointermove', function (event) {
      showTooltip(segment, event.clientX, event.clientY);
    });
    segment.addEventListener('pointerleave', hideTooltip);
    segment.addEventListener('focus', function () {
      var rect = segment.getBoundingClientRect();
      showTooltip(segment, rect.left + rect.width / 2, rect.top);
    });
    segment.addEventListener('blur', hideTooltip);
  }

  // ── Diverging stacked bar, centered on the middle of the neutral share ────
  // `extent` is the largest share reaching either side of center across all
  // bars drawn together, so every row shares one scale and one center line.
  function extentOf(counts) {
    var total = onTopic(counts) || 1;
    var half = counts.neutral / 2;
    return Math.max((counts.critical + half) / total, (counts.supportive + half) / total);
  }

  function divergingBar(counts, extent, size) {
    var total = onTopic(counts) || 1;
    var bar = el('div', 'bb-pulse-bar bb-pulse-bar-' + size);
    var scale = 50 / extent;
    var start = 50 - ((counts.critical + counts.neutral / 2) / total) * scale;
    var summary = [];

    SIDES.forEach(function (side) {
      var share = counts[side.key] / total;
      summary.push(pct(counts[side.key], total) + '% ' + side.label.toLowerCase());
      if (!counts[side.key]) return;
      var segment = el('span', 'bb-pulse-seg bb-pulse-seg-' + side.key);
      segment.style.left = start + '%';
      segment.style.width = share * scale + '%';
      segment.tabIndex = 0;
      segment.setAttribute('data-value', pct(counts[side.key], total) + '% · ' + counts[side.key] + ' comments');
      segment.setAttribute('data-label', side.label);
      segment.setAttribute('aria-label', side.label + ': ' + counts[side.key] + ' comments, ' + pct(counts[side.key], total) + '%');
      bindTooltip(segment);
      bar.appendChild(segment);
      start += share * scale;
    });

    bar.appendChild(el('span', 'bb-pulse-center'));
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', summary.join(', '));
    return bar;
  }

  function shareLine(counts) {
    var total = onTopic(counts);
    var line = el('p', 'bb-pulse-shares');
    SIDES.forEach(function (side) {
      var item = el('span', 'bb-pulse-share');
      item.appendChild(el('i', 'bb-pulse-key bb-pulse-key-' + side.key));
      item.appendChild(el('strong', null, pct(counts[side.key], total) + '%'));
      item.appendChild(document.createTextNode(' ' + side.label.toLowerCase()));
      line.appendChild(item);
    });
    return line;
  }

  // ── Sections ──────────────────────────────────────────────────────────────
  function renderOverview(data, extent) {
    var overall = data.overall;
    var card = el('div', 'bb-pulse-overview');

    var hero = el('div', 'bb-pulse-hero');
    hero.appendChild(el('strong', 'bb-pulse-score', signed(overall.score)));
    hero.appendChild(el('span', 'bb-pulse-verdict', describe(overall.score)));
    hero.appendChild(
      el(
        'small',
        null,
        'Net score from ' + onTopic(overall.counts).toLocaleString('en-PH') + ' on-topic comments across ' +
          overall.posts + (overall.posts === 1 ? ' post' : ' posts') + ' in the last ' + data.method.windowDays + ' days'
      )
    );
    card.appendChild(hero);

    var chart = el('div', 'bb-pulse-overall');
    var axis = el('div', 'bb-pulse-axis');
    axis.appendChild(el('span', null, '← More upset'));
    axis.appendChild(el('span', null, 'More happy →'));
    chart.appendChild(axis);
    chart.appendChild(divergingBar(overall.counts, extent, 'lg'));
    chart.appendChild(shareLine(overall.counts));
    chart.appendChild(
      el('p', 'bb-pulse-aside', overall.counts.off_topic + ' off-topic comments (tags, ads, unrelated) are not counted.')
    );
    card.appendChild(chart);
    return card;
  }

  function renderPost(post, extent) {
    var item = el('li', 'bb-pulse-post');
    var meta = el('p', 'bb-pulse-meta', formatDate(post.date) + ' · ' + post.commentCount.toLocaleString('en-PH') + ' comments');
    item.appendChild(meta);

    var title = el('a', 'bb-pulse-excerpt', post.excerpt);
    title.href = post.url;
    title.target = '_blank';
    title.rel = 'noopener';
    item.appendChild(title);

    var row = el('div', 'bb-pulse-row');
    row.appendChild(divergingBar(post.counts, extent, 'sm'));
    row.appendChild(el('span', 'bb-pulse-row-score', signed(post.score)));
    item.appendChild(row);
    item.appendChild(shareLine(post.counts));

    if (post.gist) {
      var gist = el('p', 'bb-pulse-gist');
      gist.appendChild(el('span', 'bb-pulse-gist-label', 'Summary'));
      gist.appendChild(document.createTextNode(' ' + post.gist));
      item.appendChild(gist);
    }
    return item;
  }

  function renderTable(posts) {
    var details = el('details', 'bb-pulse-table');
    details.appendChild(el('summary', null, 'Show the numbers as a table'));
    var wrap = el('div', 'bb-pulse-table-wrap');
    var table = el('table');
    var head = el('tr');
    ['Post', 'Date', 'Happy', 'Neutral', 'Upset', 'Off-topic', 'Net'].forEach(function (label) {
      head.appendChild(el('th', null, label));
    });
    var thead = el('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    var tbody = el('tbody');
    posts.forEach(function (post) {
      var tr = el('tr');
      tr.appendChild(el('td', null, post.excerpt));
      tr.appendChild(el('td', null, formatDate(post.date)));
      ['supportive', 'neutral', 'critical', 'off_topic'].forEach(function (key) {
        tr.appendChild(el('td', 'bb-num', String(post.counts[key])));
      });
      tr.appendChild(el('td', 'bb-num', signed(post.score)));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    details.appendChild(wrap);
    return details;
  }

  function render(data) {
    var body = root.querySelector('[data-sentiment-body]');
    var updated = root.querySelector('[data-sentiment-updated]');
    var posts = data.posts || [];
    var extent = Math.max.apply(
      null,
      [extentOf(data.overall.counts)].concat(posts.map(function (post) { return extentOf(post.counts); }))
    );
    body.textContent = '';

    if (data._status === 'sample') {
      var banner = el('p', 'bb-pulse-sample');
      banner.appendChild(el('strong', null, 'Preview with sample data.'));
      banner.appendChild(document.createTextNode(' These comments were made up for testing and are not real reactions.'));
      body.appendChild(banner);
    }

    body.appendChild(renderOverview(data, extent));
    var list = el('ol', 'bb-pulse-posts');
    posts.forEach(function (post) {
      list.appendChild(renderPost(post, extent));
    });
    body.appendChild(list);
    body.appendChild(renderTable(posts));

    if (updated) updated.textContent = 'Updated ' + formatDate(data.generatedAt.slice(0, 10)) + '.';
    root.hidden = false;
    renderChip(data);
  }

  function face(score) {
    if (score <= -40) return '😠';
    if (score <= -10) return '🙁';
    if (score < 10) return '😐';
    if (score < 40) return '🙂';
    return '😊';
  }

  // Hero shortcut: one-line summary that jumps to the full section.
  function renderChip(data) {
    var chip = document.querySelector('[data-sentiment-chip]');
    if (!chip) return;
    var overall = data.overall;
    var total = onTopic(overall.counts) || 1;
    chip.querySelector('[data-chip-face]').textContent = face(overall.score);
    chip.querySelector('[data-chip-score]').textContent = signed(overall.score);
    chip.querySelector('[data-chip-verdict]').textContent = describe(overall.score);
    chip.querySelector('[data-chip-meta]').textContent =
      'Comments on ' + overall.posts + (overall.posts === 1 ? ' city post' : ' city posts') + ', last ' + data.method.windowDays + ' days' +
      (data._status === 'sample' ? ' (sample data)' : '');

    var bar = chip.querySelector('[data-chip-bar]');
    bar.textContent = '';
    SIDES.forEach(function (side) {
      if (!overall.counts[side.key]) return;
      var segment = el('i', 'bb-pulse-seg-' + side.key);
      segment.style.width = (overall.counts[side.key] / total) * 100 + '%';
      bar.appendChild(segment);
    });
    chip.hidden = false;
  }

  fetch(SOURCE, { cache: 'no-cache' })
    .then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(function (data) {
      var publishable = data && data._status === 'live';
      if (!data || !data.overall || !(data.posts || []).length) return;
      if (!publishable && !(preview && data._status === 'sample')) return;
      render(data);
    })
    .catch(function () {
      /* The section stays hidden when the data is unavailable. */
    });
})();
