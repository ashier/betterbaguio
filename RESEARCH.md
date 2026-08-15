# Better Baguio research baseline

Last verified: **2026-08-15**

This file records what was carried over conceptually from BetterSolano.org, what was replaced with a Baguio equivalent, and what still requires document-level research.

## Reference portal inventory

BetterSolano.org supplied the overall information architecture:

- Emergency hotline strip
- Service search and categories
- Government officials and office directory
- Population, barangays, land area, and classification
- Weather, map, history, and city updates
- Ordinances and resolutions
- Budget and infrastructure transparency
- City Hall contact information
- Accessibility, multilingual, and mobile patterns

The Better Baguio launch keeps the high-value categories but does not reuse Solano-specific facts.

## Verified Baguio baseline

| Topic | Baguio value | Source |
|---|---|---|
| Population | 368,426 as of 1 July 2024 | [PSA Cordillera](https://rssocar.psa.gov.ph/content/city-baguio-population-reaches-366358-persons-2024) |
| Barangays | 129 | [PSA PSGC](https://psa.gov.ph/classification/psgc/barangays/1430300000) |
| Land area | 57.51 km² | [2025 Philippine Statistical Yearbook](https://psa.gov.ph/system/files/psy/2025%20PSY%20Final_signed.pdf) |
| Classification | 1st income class, highly urbanized city | [PSA PSGC](https://psa.gov.ph/classification/psgc/barangays/1430300000) |
| 2020–2024 annual growth | 0.14% | [PSA Cordillera](https://rssocar.psa.gov.ph/content/city-baguio-population-reaches-366358-persons-2024) |
| Largest barangay | Irisan, 36,932 | [PSA Cordillera](https://rssocar.psa.gov.ph/content/city-baguio-population-reaches-366358-persons-2024) |
| Mayor | Benjamin B. Magalong | [City Government news](https://main.baguio.gov.ph/media/news/abP9jPER/enhanced-baguio-in-my-pocket-digital-platform-launched) |
| Vice mayor | Faustino A. Olowan | [2025 election results](https://ph.rappler.com/elections/2025/local-race/embed/car-baguio-city) |
| City charter | Act No. 1963; revised by RA 11689 | [Supreme Court E-Library, 1909](https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/28/10815), [2022](https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/95223) |
| Emergency | 911 | [CDRRMO Baguio](https://www.cdrrmo.baguio.gov.ph/contact-us) |
| CDRRMO operations | (074) 661-1455; 0927 628 0498; 0999 678 4335 | [CDRRMO Baguio](https://www.cdrrmo.baguio.gov.ph/contact-us) |
| City EMS | 0905 555 1911 | [Philippine Information Agency](https://pia.gov.ph/news/take-mental-health-seriously-chso-reminds/) |
| Online business/tax portal | Baguio eBPLS | [eBPLS](https://ebpls.baguio.gov.ph/) |
| Legislation | Live City Council database | [Baguio City Council](https://citycouncil.baguio.gov.ph/) |

## Current elected council

The 2025–2028 elected councilors are Edison Bilog, Joel Alangsab, Jose Molintas, Leandro Yangot Jr., Vladimir Cayabas, Peter Fianza, Van Oliver Dicang, Fred Bagbagen, Paolo Raynor Salvosa, Betty Lourdes Tabanda, Yuri Weygan, and Elmer Datuin. The roster should be checked quarterly against the official City Government or City Council portal for vacancies, succession, or spelling corrections.

## Content intentionally removed

The following Better Solano data was not considered transferable:

- Service fees and turnaround times
- Department contact numbers and email addresses
- 22-barangay lists and barangay officials
- Schools, health stations, and agricultural programs
- DPWH project IDs, contractors, costs, and completion dates
- Fiscal totals, income composition, and CMCI rankings
- Ordinance and resolution JSON archives
- Mayor appointment system and Solano quiz links

The original template remains available from its upstream Git repository. The production build excludes unresolved legacy pages.

## Next research sprint

1. Download the latest Baguio Citizen’s Charter and build a service-by-service dataset with requirements, fees, processing time, responsible office, and revision date.
2. Index annual and supplemental budgets from the City Budget Office and appropriation ordinances.
3. Reconcile infrastructure projects across City Government open data, DPWH, and PhilGEPS using stable project IDs.
4. Add COA annual audit findings and management responses with direct report citations.
5. Import all 129 barangays and 2024 population figures from PSA into a machine-readable dataset.
6. Confirm the full council roster, including ABC, SK, and IPMR ex-officio members, from an official roster page.
7. Establish a quarterly verification workflow and visible “last checked” dates.
