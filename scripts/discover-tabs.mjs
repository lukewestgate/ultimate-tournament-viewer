// Usage: npm run discover-tabs -- <publishId>
// Prints the tab name -> gid map for a "published to the web" Google Sheet,
// ready to paste into src/config.ts. (pubhtml has no CORS, so the browser can't do this.)
const id = process.argv[2];
if (!id) {
  console.error('Usage: npm run discover-tabs -- <publishId>');
  process.exit(1);
}
const res = await fetch(`https://docs.google.com/spreadsheets/d/e/${id}/pubhtml`);
const html = await res.text();
const re = /items\.push\(\{name: "([^"]*)"[^}]*?gid: "(\d+)"/g;
const tabs = {};
for (const m of html.matchAll(re)) tabs[m[1]] = m[2];
console.log(JSON.stringify(tabs, null, 2));
