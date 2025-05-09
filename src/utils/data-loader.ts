import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

export const fetchTradesFromQuery = (query: string): Array<Record<string, string | number>> => {
  const tempFile = join(process.cwd(), 'temp_query.sql');
  try {
    writeFileSync(tempFile, query, 'utf-8');
    const result = execSync(`duckdb -csv -header < ${tempFile}`, {
      encoding: 'utf-8',
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer
    });

    const [headerLine, ...lines] = result.trim().split('\n');
    if (!headerLine && lines.length === 0) {
      // Handle case where result is empty or only a newline character
      return [];
    }
    if (!headerLine && lines.length > 0 && lines.every(l => l.trim() === '')) {
      // Handle case where result is only newlines
      return [];
    }
    if (!headerLine) {
      // If there's no header but there are lines, it's unexpected data or an error state.
      // For robustness, we could throw an error or log a warning.
      // For now, returning empty array to prevent crash, assuming malformed/empty CSV.
      console.warn('[data-loader] Query returned data without a header line.');
      return [];
    }

    const columns = headerLine.split(',');

    return lines
      .filter(line => line.trim() !== '') // Ensure empty lines are skipped
      .map(line => {
        const values = line.split(',');
        return columns.reduce(
          (obj, col, i) => {
            const value = values[i];
            // Attempt to convert to number if possible, otherwise keep as string
            // Ensure that empty strings or strings that are not numbers are kept as strings
            obj[col.trim()] =
              value && value.trim() !== '' && !isNaN(Number(value)) ? Number(value) : value;
            return obj;
          },
          {} as Record<string, string | number>
        );
      });
  } finally {
    if (existsSync(tempFile)) {
      unlinkSync(tempFile);
    }
  }
};
