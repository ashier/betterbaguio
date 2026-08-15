(function () {
  const pages = [
    ['Home', '/'],
    ['Services', '/services/'],
    ['Government', '/government/'],
    ['Statistics', '/statistics/'],
    ['Legislative', '/legislative/'],
    ['Transparency', '/budget/'],
    ['Contact', '/contact/']
  ];

  const currentPath = window.location.pathname.replace(/index\.html$/, '');
  const nav = pages.map(([label, href]) => {
    const active = href === '/' ? currentPath === '/' : currentPath.startsWith(href);
    return `<li><a href="${href}"${active ? ' aria-current="page"' : ''}>${label}</a></li>`;
  }).join('');

  const shellHeader = document.querySelector('[data-site-header]');
  if (shellHeader) {
    shellHeader.innerHTML = `
      <a class="bb-skip" href="#main-content">Skip to main content</a>
      <div class="bb-emergency"><div class="bb-container">
        <strong>Emergency:</strong><a href="tel:911">911</a>
        <span>CDRRMO</span><a href="tel:0746611455">(074) 661-1455</a>
        <span>EMS</span><a href="tel:09055551911">0905 555 1911</a>
      </div></div>
      <header class="bb-header"><nav class="bb-nav bb-container" aria-label="Primary navigation">
        <a class="bb-logo" href="/"><img src="/assets/images/logo/better-baguio-logo.svg" alt="Better Baguio"></a>
        <button class="bb-menu-button" type="button" aria-expanded="false" aria-controls="bb-menu">Menu</button>
        <ul class="bb-menu" id="bb-menu">${nav}</ul>
      </nav></header>`;
  }

  const shellFooter = document.querySelector('[data-site-footer]');
  if (shellFooter) {
    shellFooter.innerHTML = `
      <footer class="bb-footer"><div class="bb-container">
        <div class="bb-footer-grid">
          <div><img src="/assets/images/logo/better-baguio-logo-white.svg" alt="Better Baguio"><p>An independent, volunteer-built civic information portal. BetterBaguio.org is not an official City Government website.</p></div>
          <div><h2>Explore</h2><ul>${pages.slice(1).map(([label, href]) => `<li><a href="${href}">${label}</a></li>`).join('')}</ul></div>
          <div><h2>Official sources</h2><ul><li><a href="https://main.baguio.gov.ph/" target="_blank" rel="noopener">City Government</a></li><li><a href="https://citycouncil.baguio.gov.ph/" target="_blank" rel="noopener">City Council</a></li><li><a href="https://psa.gov.ph/classification/psgc/barangays/1430300000" target="_blank" rel="noopener">PSA city profile</a></li><li><a href="https://github.com/ashier/betterbaguio" target="_blank" rel="noopener">Source code</a></li></ul></div>
        </div>
        <div class="bb-footer-bottom">Cost to the people of Baguio: ₱0 · Public information is linked to its source · MIT licensed code</div>
      </div></footer>`;
  }

  const button = document.querySelector('.bb-menu-button');
  const menu = document.querySelector('.bb-menu');
  if (button && menu) button.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(open));
  });
})();
