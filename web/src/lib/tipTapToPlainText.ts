/**
 * Convert TipTap JSON content to plain text.
 *
 * Recursively walks the TipTap document tree and joins text nodes, inserting
 * appropriate separators (newlines after paragraphs/headings, bullets before
 * list items, etc.). Used to feed diff-match-patch and any other consumer that
 * needs a flat text representation.
 *
 * Lives in lib/ (not in DiffViewer.tsx) so that callers can import it without
 * pulling diff-match-patch into the main bundle.
 */
export function tipTapToPlainText(content: Record<string, unknown> | null | undefined): string {
  if (!content) return '';

  const extractText = (node: Record<string, unknown>): string => {
    // Handle text nodes
    if (node.type === 'text' && typeof node.text === 'string') {
      return node.text;
    }

    // Handle paragraph nodes - add newline after
    if (node.type === 'paragraph') {
      const childContent = Array.isArray(node.content)
        ? node.content.map((child) => extractText(child as Record<string, unknown>)).join('')
        : '';
      return childContent + '\n';
    }

    // Handle heading nodes - add newline after
    if (node.type === 'heading') {
      const childContent = Array.isArray(node.content)
        ? node.content.map((child) => extractText(child as Record<string, unknown>)).join('')
        : '';
      return childContent + '\n';
    }

    // Handle bulletList and orderedList
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      const items = Array.isArray(node.content)
        ? node.content.map((child) => extractText(child as Record<string, unknown>)).join('')
        : '';
      return items;
    }

    // Handle listItem
    if (node.type === 'listItem') {
      const childContent = Array.isArray(node.content)
        ? node.content.map((child) => extractText(child as Record<string, unknown>)).join('')
        : '';
      return '• ' + childContent;
    }

    // Handle blockquote
    if (node.type === 'blockquote') {
      const childContent = Array.isArray(node.content)
        ? node.content.map((child) => extractText(child as Record<string, unknown>)).join('')
        : '';
      return '> ' + childContent;
    }

    // Handle codeBlock
    if (node.type === 'codeBlock') {
      const childContent = Array.isArray(node.content)
        ? node.content.map((child) => extractText(child as Record<string, unknown>)).join('')
        : '';
      return '```\n' + childContent + '```\n';
    }

    // Handle hardBreak
    if (node.type === 'hardBreak') {
      return '\n';
    }

    // Handle doc node (root)
    if (node.type === 'doc' && Array.isArray(node.content)) {
      return node.content.map((child) => extractText(child as Record<string, unknown>)).join('');
    }

    // Handle any other node with content
    if (Array.isArray(node.content)) {
      return node.content.map((child) => extractText(child as Record<string, unknown>)).join('');
    }

    return '';
  };

  return extractText(content).trim();
}
