/**
 * Word equations (OMML) as mathml2omml writes them, mended where Word would
 * refuse them or draw an empty box: bare markup characters in text, duplicate
 * or undefined properties, a sum with its operand left outside, a relation
 * with nothing on its left.
 */

type Element = {
  kind: 'element';
  tag: string;
  attrs: string;
  children: Node[];
  selfClosing: boolean;
};
type Text = { kind: 'text'; value: string };
type Node = Element | Text;

function parse(xml: string): Node[] {
  const roots: Node[] = [];
  const stack: Element[] = [];
  let at = 0;

  const push = (node: Node) => {
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);
  };

  while (at < xml.length) {
    const open = xml.indexOf('<', at);
    if (open === -1) {
      if (at < xml.length) push({ kind: 'text', value: xml.slice(at) });
      break;
    }
    if (open > at) push({ kind: 'text', value: xml.slice(at, open) });

    const close = xml.indexOf('>', open);
    if (close === -1) throw new Error('unterminated tag');
    const raw = xml.slice(open + 1, close);
    at = close + 1;

    if (raw.startsWith('/')) {
      stack.pop();
      continue;
    }

    const selfClosing = raw.endsWith('/');
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const space = body.search(/\s/);
    const tag = space === -1 ? body : body.slice(0, space);
    const attrs = space === -1 ? '' : body.slice(space);

    const element: Element = { kind: 'element', tag, attrs, children: [], selfClosing };
    push(element);
    if (!selfClosing) stack.push(element);
  }

  return roots;
}

function serialize(nodes: Node[]): string {
  return nodes
    .map(node => {
      if (node.kind === 'text') return node.value;
      if (node.selfClosing && node.children.length === 0) return `<${node.tag}${node.attrs}/>`;
      return `<${node.tag}${node.attrs}>${serialize(node.children)}</${node.tag}>`;
    })
    .join('');
}

function textOf(node: Node): string {
  if (node.kind === 'text') return node.value;
  return node.children.map(textOf).join('');
}

const PROPERTY_TAGS = new Set([
  'm:sty', 'm:chr', 'm:limLoc', 'm:grow', 'm:subHide', 'm:supHide', 'm:scrLvl',
  'm:type', 'm:baseJc', 'm:plcHide', 'm:count', 'm:mcJc', 'm:nor',
]);

function pruneInvalid(nodes: Node[]): Node[] {
  const kept: Node[] = [];
  let seenArgPr = false;

  for (const node of nodes) {
    if (node.kind === 'text') {
      kept.push(node);
      continue;
    }

    if (node.tag === 'm:argPr') {
      if (seenArgPr) continue;
      seenArgPr = true;
    }

    if (node.attrs.includes('m:val="undefined"')) {
      node.attrs = node.attrs.replace(/\s*m:val="undefined"/g, '');
      if (!node.attrs.trim() && node.children.length === 0 && PROPERTY_TAGS.has(node.tag)) continue;
    }

    node.children = pruneInvalid(node.children);
    kept.push(node);
  }

  return kept;
}

const RELATION = /^[=≠≈≡<>≤≥→←↔⇒⇐⇔∼≅∝∈∉⊂⊆⊃⊇:]/;

function isRelation(node: Node): boolean {
  if (node.kind !== 'element' || node.tag !== 'm:r') return false;
  return RELATION.test(textOf(node).trim());
}

function isEmpty(node: Node): boolean {
  return node.kind === 'element' && node.children.length === 0;
}

function fillNaryOperands(nodes: Node[]): void {
  for (const node of nodes) {
    if (node.kind === 'element') fillNaryOperands(node.children);
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.kind !== 'element' || node.tag !== 'm:nary') continue;

    const slot = node.children.find(child => child.kind === 'element' && child.tag === 'm:e');
    if (!slot || slot.kind !== 'element' || !isEmpty(slot)) continue;

    let end = i + 1;
    while (end < nodes.length && !isRelation(nodes[end])) end++;
    if (end === i + 1) continue;

    slot.children = nodes.splice(i + 1, end - i - 1);
    slot.selfClosing = false;
  }
}

const CONTENT_TAGS = new Set(['m:oMath', 'm:e', 'm:num', 'm:den', 'm:sub', 'm:sup']);

function padLeadingRelations(nodes: Node[]): void {
  for (const node of nodes) {
    if (node.kind !== 'element') continue;
    padLeadingRelations(node.children);
    if (!CONTENT_TAGS.has(node.tag)) continue;

    const first = node.children.find(
      child => child.kind === 'element' && !child.tag.endsWith('Pr'),
    );
    if (!first || first.kind !== 'element' || first.tag !== 'm:r') continue;
    if (!RELATION.test(textOf(first).trim())) continue;

    const text = first.children.find(child => child.kind === 'element' && child.tag === 'm:t');
    if (text && text.kind === 'element' && text.children[0]?.kind === 'text') {
      text.children[0].value = `\u200B${text.children[0].value}`;
    }
  }
}

function escapeTextNodes(omml: string): string {
  return omml.replace(
    /(<m:t(?=[\s>])[^>]*>)([\s\S]*?)(<\/m:t>)/g,
    (_full, open: string, text: string, close: string) =>
      open +
      text
        .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;') +
      close,
  );
}

export function repairOmml(omml: string): string {
  const escaped = escapeTextNodes(omml);
  try {
    const tree = pruneInvalid(parse(escaped));
    fillNaryOperands(tree);
    padLeadingRelations(tree);
    return serialize(tree);
  } catch {
    return escaped;
  }
}
