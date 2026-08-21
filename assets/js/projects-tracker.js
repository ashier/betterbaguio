(function () {
  'use strict';

  var root = document.querySelector('[data-project-filters]');
  if (!root) return;

  var SNAPSHOT_URLS = [
    { url: 'https://data.betterbaguio.org/data/prism/projects.json', label: 'AWS weekly snapshot' },
    { url: '/data/prism/projects.json', label: 'bundled fallback' }
  ];
  var PAGE_SIZE = 25;
  var stageOrder = ['Planning', 'Design', 'Procurement', 'Bidding', 'Implementation', 'Completed', 'Suspended', 'Terminated'];
  var elements = {
    retrieved: document.querySelector('[data-project-retrieved]'),
    count: document.querySelector('[data-project-count]'),
    appropriation: document.querySelector('[data-project-appropriation]'),
    completed: document.querySelector('[data-project-completed]'),
    contractors: document.querySelector('[data-project-contractors]'),
    yearLabel: document.querySelector('[data-project-year-label]'),
    search: document.querySelector('[data-project-search]'),
    year: document.querySelector('[data-project-year]'),
    status: document.querySelector('[data-project-status]'),
    office: document.querySelector('[data-project-office]'),
    barangay: document.querySelector('[data-project-barangay]'),
    clear: document.querySelector('[data-project-clear]'),
    rows: document.querySelector('[data-project-rows]'),
    summary: document.querySelector('[data-project-results-summary]'),
    bars: document.querySelector('[data-project-status-bars]'),
    more: document.querySelector('[data-project-more]')
  };
  var snapshot = null;
  var currentProjects = [];
  var visibleLimit = PAGE_SIZE;

  function formatNumber(value) {
    return new Intl.NumberFormat('en-PH').format(value);
  }

  function formatMoney(value, compact) {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      maximumFractionDigits: compact ? 1 : 2,
      notation: compact ? 'compact' : 'standard'
    }).format(value);
  }

  function formatRetrieved(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return 'Retrieval date unavailable';
    return 'Retrieved ' + new Intl.DateTimeFormat('en-PH', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Manila'
    }).format(date) + ' PHT';
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean))).sort(function (a, b) { return a.localeCompare(b); });
  }

  function replaceOptions(select, values, allLabel) {
    select.textContent = '';
    if (allLabel) {
      var all = document.createElement('option');
      all.value = '';
      all.textContent = allLabel;
      select.appendChild(all);
    }
    values.forEach(function (value) {
      var option = document.createElement('option');
      option.value = String(value);
      option.textContent = String(value);
      select.appendChild(option);
    });
  }

  function statusClass(status) {
    return 'is-' + String(status || 'unknown').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  }

  function appendCell(row, text, className) {
    var cell = document.createElement('td');
    if (className) cell.className = className;
    cell.textContent = text;
    row.appendChild(cell);
    return cell;
  }

  function projectHaystack(project) {
    return [project.id, project.title, project.current_stage, project.implementing_office, project.bidder]
      .concat(project.barangays || []).join(' ').toLowerCase();
  }

  function filteredProjects() {
    var query = elements.search.value.trim().toLowerCase();
    return currentProjects.filter(function (project) {
      if (query && projectHaystack(project).indexOf(query) === -1) return false;
      if (elements.status.value && project.current_stage !== elements.status.value) return false;
      if (elements.office.value && project.implementing_office !== elements.office.value) return false;
      if (elements.barangay.value && (project.barangays || []).indexOf(elements.barangay.value) === -1) return false;
      return true;
    }).sort(function (a, b) { return Number(b.appropriation) - Number(a.appropriation); });
  }

  function renderMetrics(projects) {
    var totalAppropriation = projects.reduce(function (sum, project) { return sum + Number(project.appropriation || 0); }, 0);
    var completed = projects.filter(function (project) { return project.current_stage === 'Completed'; }).length;
    var contractors = projects.filter(function (project) { return Boolean(project.bidder); }).length;
    elements.count.textContent = formatNumber(projects.length);
    elements.appropriation.textContent = formatMoney(totalAppropriation, true);
    elements.completed.textContent = formatNumber(completed);
    elements.contractors.textContent = formatNumber(contractors);
    elements.yearLabel.textContent = elements.year.value + ' PRISM records';
  }

  function renderBars(projects) {
    elements.bars.textContent = '';
    var counts = {};
    projects.forEach(function (project) { counts[project.current_stage] = (counts[project.current_stage] || 0) + 1; });
    var stages = Object.keys(counts).sort(function (a, b) {
      var ai = stageOrder.indexOf(a);
      var bi = stageOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    var max = Math.max.apply(Math, stages.map(function (stage) { return counts[stage]; }).concat([1]));
    if (!stages.length) {
      var empty = document.createElement('p');
      empty.textContent = 'No matching stages.';
      elements.bars.appendChild(empty);
      return;
    }
    stages.forEach(function (stage) {
      var item = document.createElement('div');
      item.className = 'bb-status-bar';
      var label = document.createElement('div');
      var name = document.createElement('span');
      var count = document.createElement('strong');
      name.textContent = stage;
      count.textContent = formatNumber(counts[stage]);
      label.appendChild(name);
      label.appendChild(count);
      var track = document.createElement('div');
      var fill = document.createElement('span');
      fill.className = statusClass(stage);
      fill.style.width = Math.max(4, (counts[stage] / max) * 100) + '%';
      track.appendChild(fill);
      item.appendChild(label);
      item.appendChild(track);
      elements.bars.appendChild(item);
    });
  }

  function renderRows(projects) {
    elements.rows.textContent = '';
    if (!projects.length) {
      var noResults = document.createElement('tr');
      appendCell(noResults, 'No projects match these filters.', 'bb-project-empty').colSpan = 5;
      elements.rows.appendChild(noResults);
      elements.more.hidden = true;
      return;
    }
    projects.slice(0, visibleLimit).forEach(function (project) {
      var row = document.createElement('tr');
      var statusCell = document.createElement('td');
      var chip = document.createElement('span');
      chip.className = 'bb-project-status ' + statusClass(project.current_stage);
      chip.textContent = project.current_stage;
      statusCell.appendChild(chip);
      row.appendChild(statusCell);

      var projectCell = document.createElement('td');
      var title = document.createElement('strong');
      var id = document.createElement('small');
      title.textContent = project.title;
      id.textContent = project.id;
      projectCell.appendChild(title);
      projectCell.appendChild(id);
      row.appendChild(projectCell);

      appendCell(row, (project.barangays || []).join(', ') || 'Not specified');
      var officeCell = document.createElement('td');
      var office = document.createElement('span');
      var bidder = document.createElement('small');
      office.textContent = project.implementing_office;
      bidder.textContent = project.bidder || 'Contractor not listed';
      officeCell.appendChild(office);
      officeCell.appendChild(bidder);
      row.appendChild(officeCell);
      appendCell(row, formatMoney(Number(project.appropriation), false), 'bb-project-money');
      elements.rows.appendChild(row);
    });
    elements.more.hidden = projects.length <= visibleLimit;
  }

  function updateUrl() {
    var params = new URLSearchParams();
    if (elements.year.value && Number(elements.year.value) !== snapshot.defaultYear) params.set('year', elements.year.value);
    if (elements.search.value.trim()) params.set('q', elements.search.value.trim());
    if (elements.status.value) params.set('status', elements.status.value);
    if (elements.office.value) params.set('office', elements.office.value);
    if (elements.barangay.value) params.set('location', elements.barangay.value);
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params.toString() : ''));
  }

  function render() {
    var projects = filteredProjects();
    renderMetrics(projects);
    renderBars(projects);
    renderRows(projects);
    var shown = Math.min(visibleLimit, projects.length);
    elements.summary.textContent = 'Showing ' + formatNumber(shown) + ' of ' + formatNumber(projects.length) + ' matching records.';
    updateUrl();
  }

  function populateProjectFilters() {
    replaceOptions(elements.status, unique(currentProjects.map(function (project) { return project.current_stage; })), 'All statuses');
    replaceOptions(elements.office, unique(currentProjects.map(function (project) { return project.implementing_office; })), 'All offices');
    replaceOptions(elements.barangay, unique(currentProjects.reduce(function (all, project) { return all.concat(project.barangays || []); }, [])), 'All locations');
  }

  function setYear(year, preserveQuery) {
    var selected = snapshot.years[String(year)] ? String(year) : String(snapshot.defaultYear);
    elements.year.value = selected;
    currentProjects = snapshot.years[selected].projects;
    populateProjectFilters();
    if (!preserveQuery) {
      elements.search.value = '';
      elements.status.value = '';
      elements.office.value = '';
      elements.barangay.value = '';
    }
    visibleLimit = PAGE_SIZE;
  }

  function applyInitialQuery() {
    var params = new URLSearchParams(location.search);
    var requestedYear = params.get('year');
    setYear(requestedYear || snapshot.defaultYear, true);
    elements.search.value = params.get('q') || '';
    elements.status.value = params.get('status') || '';
    elements.office.value = params.get('office') || '';
    elements.barangay.value = params.get('location') || '';
  }

  function renderError() {
    elements.retrieved.textContent = 'The PRISM snapshot could not be loaded.';
    elements.rows.textContent = '';
    var row = document.createElement('tr');
    appendCell(row, 'Project data is temporarily unavailable. Use the official PRISM link above.', 'bb-project-empty').colSpan = 5;
    elements.rows.appendChild(row);
    elements.summary.textContent = 'Data unavailable.';
  }

  root.addEventListener('submit', function (event) { event.preventDefault(); });
  root.addEventListener('input', function (event) {
    if (event.target === elements.year) return;
    visibleLimit = PAGE_SIZE;
    render();
  });
  root.addEventListener('change', function (event) {
    if (event.target === elements.year) setYear(elements.year.value, false);
    visibleLimit = PAGE_SIZE;
    render();
  });
  elements.clear.addEventListener('click', function () {
    elements.search.value = '';
    elements.status.value = '';
    elements.office.value = '';
    elements.barangay.value = '';
    visibleLimit = PAGE_SIZE;
    render();
    elements.search.focus();
  });
  elements.more.addEventListener('click', function () {
    visibleLimit += PAGE_SIZE;
    render();
  });

  function loadSnapshot(index) {
    var source = SNAPSHOT_URLS[index];
    if (!source) return Promise.reject(new Error('No snapshot source available'));
    return fetch(source.url).then(function (response) {
      if (!response.ok) throw new Error('Snapshot request failed');
      return response.json();
    }).then(function (data) {
      if (!data || !data.years || !Array.isArray(data.availableYears)) throw new Error('Invalid snapshot');
      return { data: data, label: source.label };
    }).catch(function () {
      return loadSnapshot(index + 1);
    });
  }

  loadSnapshot(0).then(function (result) {
    var data = result.data;
    snapshot = data;
    replaceOptions(elements.year, snapshot.availableYears, '');
    applyInitialQuery();
    elements.retrieved.textContent = formatRetrieved(snapshot.retrievedAt) + ' · ' + formatNumber(Object.keys(snapshot.years).reduce(function (total, year) { return total + snapshot.years[year].projects.length; }, 0)) + ' records archived · ' + result.label;
    render();
  }).catch(renderError);
})();
