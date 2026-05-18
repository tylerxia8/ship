import { useMemo } from 'react';
import DiffMatchPatch from 'diff-match-patch';

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  className?: string;
}

/**
 * DiffViewer - inline text diff with visual highlighting.
 *
 * Deletions: strikethrough + red. Additions: green. Unchanged: plain.
 *
 * Pulls in diff-match-patch (~82 KB rendered / ~19 KB gzipped). Callers should
 * `React.lazy(() => import('@/components/DiffViewer'))` this so the dependency
 * is excluded from the initial bundle. The shared text helper lives at
 * `@/lib/tipTapToPlainText` so callers can use it without paying the diff cost.
 */
export function DiffViewer({ oldContent, newContent, className = '' }: DiffViewerProps) {
  const diffs = useMemo(() => {
    const dmp = new DiffMatchPatch();
    const diff = dmp.diff_main(oldContent, newContent);
    dmp.diff_cleanupSemantic(diff);
    return diff;
  }, [oldContent, newContent]);

  return (
    <div className={`font-mono text-sm whitespace-pre-wrap ${className}`}>
      {diffs.map((part, index) => {
        const [operation, text] = part;

        if (operation === -1) {
          // Deletion - strikethrough with red background
          return (
            <span
              key={index}
              className="line-through bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
            >
              {text}
            </span>
          );
        }

        if (operation === 1) {
          // Addition - green background
          return (
            <span
              key={index}
              className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
            >
              {text}
            </span>
          );
        }

        // Unchanged text - operation === 0
        return <span key={index}>{text}</span>;
      })}
    </div>
  );
}

export default DiffViewer;
