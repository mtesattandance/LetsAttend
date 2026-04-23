const fs = require("fs");
const file = "app/dashboard/admin/reports/page.tsx";
let content = fs.readFileSync(file, "utf8");

// 1. Add createPortal to imports if missing
if (!content.includes("createPortal")) {
  content = content.replace('import * as React from "react";', 'import * as React from "react";\nimport { createPortal } from "react-dom";');
}

// 2. Change total count calculation in employee download
content = content.replace(
  'setDownloadTotalCount(targets.length);',
  'setDownloadTotalCount(targets.length * months.length);'
);

// 3. Update done count in employee download (individual)
content = content.replace(
  /const monthRows: HoursPayload\[\] = \[\];\s*for \(const m of months\) \{/g,
  `const monthRows: HoursPayload[] = [];
        let doneForTarget = 0;
        for (const m of months) {`
);

content = content.replace(
  /monthRows\.push\(json\);\s*\}/g,
  `monthRows.push(json);
          setDownloadDoneCount(prev => prev + 1);
        }`
);

// 4. Update the done count at the end of individual download to not override it
content = content.replace(
  'toast.success(`PDF downloaded for ${emp.name}`);\n        setDownloadDoneCount(1);',
  'toast.success(`PDF downloaded for ${emp.name}`);'
);

// 5. Update done count in employee download (all)
content = content.replace(
  /folder\.file\(`working-hours-\$\{suffix\}\.pdf`, pdf\);\s*setDownloadDoneCount\(idx \+ 1\);/g,
  'folder.file(`working-hours-${suffix}.pdf`, pdf);'
);

// 6. Update fetchSiteData to use abort controller
content = content.replace(
  /const q = new URLSearchParams\(\{ siteId: selectedSiteId, period: sitePeriodMode, value \}\);\s*const res = await fetch\(`\/api\/admin\/site-attendance\?\$\{q\.toString\(\)\}`, \{\s*headers: \{ Authorization: `Bearer \$\{token\}` \},\s*\}\);/g,
  `const q = new URLSearchParams({ siteId: selectedSiteId, period: sitePeriodMode, value });
      const controller = new AbortController();
      activeFetchControllerRef.current = controller;
      cancelDownloadRef.current = false;
      const res = await fetch(\`/api/admin/site-attendance?\${q.toString()}\`, {
        headers: { Authorization: \`Bearer \${token}\` },
        signal: controller.signal,
      });
      activeFetchControllerRef.current = null;`
);

// 7. Remove inline downloading UI for employee tab
const inlineUiStart = content.indexOf('          ) : (\n            <div className="p-6">');
const inlineUiEnd = content.indexOf('          )}\n        </div>\n\n        {/* Employee monthly preview table */}');
if (inlineUiStart !== -1 && inlineUiEnd !== -1) {
  content = content.substring(0, inlineUiStart) + '\n          )}\n        </div>\n\n        {/* Employee monthly preview table */}' + content.substring(inlineUiEnd + 70);
}

// 8. Add global portal modal at the end of the return statement
const portalModal = `
      {/* Global Progress Modal */}
      {(downloading || siteLoading || siteDownloading) && mounted && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200/20 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900">
            <div className="p-6">
              <div className="mb-4 flex items-center gap-4">
                <div className="relative flex size-12 shrink-0 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-t-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.5)] animate-spin" />
                  <Loader2 className="size-5 text-cyan-500 animate-spin" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                    {downloadStatus || (siteLoading ? "Fetching site data..." : siteDownloading ? "Generating PDF..." : "Processing...")}
                  </h3>
                  {downloadCurrentDetail && (
                    <p className="text-sm font-medium text-cyan-600 dark:text-cyan-400">
                      {downloadCurrentDetail}
                    </p>
                  )}
                </div>
              </div>

              {downloading && downloadTotalCount > 0 && (
                <div className="space-y-2 mt-6">
                  <div className="flex justify-between text-xs font-mono text-zinc-500 font-semibold">
                    <span>Progress</span>
                    <span>{downloadDoneCount} / {downloadTotalCount}</span>
                  </div>
                  <div className="relative h-4 w-full overflow-hidden rounded-full bg-zinc-100 shadow-inner dark:bg-zinc-800">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-400 to-blue-600 shadow-[0_0_10px_rgba(6,182,212,0.8)] transition-all duration-300 ease-out"
                      style={{
                        width: downloadTotalCount > 0
                          ? \`\${Math.min(100, (downloadDoneCount / downloadTotalCount) * 100)}%\`
                          : "0%"
                      }}
                    >
                      <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem] animate-[spin_2s_linear_infinite]" />
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-8 flex justify-end">
                <Button 
                  variant="outline" 
                  onClick={cancelDownload}
                  className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 font-semibold"
                >
                  Cancel Process
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
`;

content = content.replace(/    <\/div>\n  \);\n\}\n/g, portalModal + '    </div>\n  );\n}\n');

fs.writeFileSync(file, content, "utf8");
console.log("Successfully patched reports page!");
