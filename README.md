# Screener Playwright Crawler v2.0

🦞 **AI-powered crawler & automatic E2E test generator** built on Playwright.

## Architecture

```
src/
├── crawler/          # Web crawling engine
│   ├── url-frontier.ts      # Priority-based URL queue
│   ├── crawler.ts           # Playwright crawler orchestrator
│   ├── url-normalizer.ts    # URL canonicalization
│   ├── deduplicator.ts      # URL + content dedup
│   ├── robots.ts            # robots.txt compliance
│   └── sitemap.ts           # Sitemap parsing
│
├── analyzer/         # Page inspection & discovery
│   ├── page-analyzer.ts      # Full DOM/structure analysis
│   ├── action-discovery.ts   # Interactive element mapping
│   ├── form-analyzer.ts      # Form field & validation analysis
│   ├── api-discovery.ts      # Network/XHR monitoring
│   └── workflow-discovery.ts # Multi-step flow detection
│
├── generator/        # Test script generation
│   ├── functional-generator.ts     # Happy-path tests
│   ├── negative-generator.ts       # Invalid input tests
│   ├── boundary-generator.ts       # Edge case tests
│   ├── accessibility-generator.ts  # WCAG a11y tests
│   ├── visual-generator.ts         # Responsive & visual tests
│   └── security-generator.ts       # Security audit tests
│
├── index.ts          # Main pipeline entry
├── config.ts         # Configuration
├── types.ts          # TypeScript types
├── test-writer.ts    # Playwright spec generator
└── report-generator.ts  # Coverage & QA reports
```

## Quick Start

```bash
npm install
npx playwright install chromium
```

### Crawl a site

```bash
npm run crawl -- --url https://example.com --max-pages 50
```

### Full pipeline (crawl → analyze → generate)

```bash
npm run full -- --url https://example.com --max-pages 50
```

### Generate tests only (from existing crawl/analysis)

```bash
npm run generate
```

## Output

- **generated-tests/** — Playwright test specs organized by category
- **reports/** — Crawl report, coverage report, QA dashboard
- **analyses/** — Per-page analysis JSON files

## Configuration

Edit `src/config.ts` or use environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `SEED_URLS` | Comma-separated starting URLs | — |
| `MAX_PAGES` | Maximum pages to crawl | 100 |

## Test Categories

| Category | Description | Output Dir |
|----------|-------------|------------|
| **Functional** | Happy-path user flows | `generated-tests/functional/` |
| **Negative** | Error states & invalid input | `generated-tests/negative/` |
| **Boundary** | Edge cases & limits | `generated-tests/boundary/` |
| **Accessibility** | WCAG compliance | `generated-tests/accessibility/` |
| **Visual** | Responsive & layout | `generated-tests/visual/` |
| **Security** | OWASP checks | `generated-tests/security/` |

## Reports

- **crawl-report.json** — Crawl statistics, discovered URLs, timing
- **coverage-report.json** — Test coverage by type/interaction
- **qa-report.html** — Visual QA dashboard with charts & recommendations
