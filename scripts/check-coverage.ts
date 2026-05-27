import { readFileSync } from "node:fs";

type Metric = {
  readonly name: string;
  covered: number;
  total: number;
};

const lcov = readFileSync("coverage/lcov.info", "utf8");
const statements: Metric = {
  name: "statements",
  covered: 0,
  total: 0,
};
const branches: Metric = {
  name: "branches",
  covered: 0,
  total: 0,
};
const functions: Metric = {
  name: "functions",
  covered: 0,
  total: 0,
};
const lines: Metric = {
  name: "lines",
  covered: 0,
  total: 0,
};
const metrics = [statements, branches, functions, lines] as const;

let currentFile: string | undefined;
let sourceFileCount = 0;

for (const rawLine of lcov.split("\n")) {
  const line = rawLine.trim();

  if (line.startsWith("SF:")) {
    currentFile = line.slice(3);

    if (currentFile.startsWith("src/")) {
      sourceFileCount += 1;
    }

    continue;
  }

  if (!currentFile?.startsWith("src/")) {
    continue;
  }

  if (line.startsWith("DA:")) {
    statements.total += 1;

    const [, hitCount = "0"] = line.slice(3).split(",");

    if (Number(hitCount) > 0) {
      statements.covered += 1;
    }
  }

  if (line.startsWith("BRDA:")) {
    branches.total += 1;

    const hitCount = line.split(",").at(-1);

    if (hitCount !== undefined && hitCount !== "-" && Number(hitCount) > 0) {
      branches.covered += 1;
    }
  }

  addMetric(line, "FNF:", functions, "total");
  addMetric(line, "FNH:", functions, "covered");
  addMetric(line, "LF:", lines, "total");
  addMetric(line, "LH:", lines, "covered");
}

if (sourceFileCount === 0) {
  throw new Error("No src/ files found in coverage/lcov.info.");
}

const failures = metrics.filter((metric) => metric.total > 0 && metric.covered !== metric.total);

for (const metric of metrics) {
  const percent =
    metric.total === 0 ? "100.00" : ((metric.covered / metric.total) * 100).toFixed(2);

  console.log(`${metric.name}: ${percent}% (${metric.covered}/${metric.total})`);
}

if (failures.length > 0) {
  const names = failures.map((metric) => metric.name).join(", ");
  throw new Error(`Coverage below 100% for: ${names}.`);
}

function addMetric(line: string, prefix: string, metric: Metric, field: "covered" | "total"): void {
  if (line.startsWith(prefix)) {
    metric[field] += Number(line.slice(prefix.length));
  }
}
