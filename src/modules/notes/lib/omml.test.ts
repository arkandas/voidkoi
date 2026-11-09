import { describe, expect, it } from 'vitest';
import { repairOmml } from './omml';

const NS = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
const run = (text: string) => `<m:r><m:t xml:space="preserve">${text}</m:t></m:r>`;

const nary = (...after: string[]) =>
  `<m:oMath ${NS}><m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr>` +
  `<m:sub>${run('k=1')}</m:sub><m:sup>${run('n')}</m:sup><m:e/></m:nary>` +
  after.join('') +
  `</m:oMath>`;

function operandOf(omml: string) {
  const nary = omml.slice(omml.indexOf('<m:nary>'), omml.indexOf('</m:nary>'));
  const open = nary.indexOf('<m:e>');
  return open === -1 ? '' : nary.slice(open, nary.indexOf('</m:e>', open));
}

describe('the empty operand slot', () => {
  it('moves the operand into the operator', () => {
    const out = repairOmml(nary(run('k²')));
    const inner = out.slice(out.indexOf('<m:nary>'), out.indexOf('</m:nary>'));
    expect(inner).toContain('<m:e>');
    expect(inner).toContain('k²');
    expect(inner).not.toContain('<m:e/>');
  });

  it('stops at a relation, so the right-hand side stays outside', () => {
    const out = repairOmml(nary(run('OPERAND'), run('='), run('RHS')));
    expect(operandOf(out)).toContain('OPERAND');
    expect(operandOf(out)).not.toContain('RHS');
    expect(out.slice(out.indexOf('</m:nary>'))).toContain('RHS');
  });

  it('leaves an operator with nothing after it alone', () => {
    expect(repairOmml(nary())).toContain('<m:e/>');
  });

  it('leaves a slot that is already filled alone', () => {
    const filled = `<m:oMath ${NS}><m:nary><m:e>${run('ALREADY')}</m:e></m:nary>${run('TAIL')}</m:oMath>`;
    const out = repairOmml(filled);
    expect(operandOf(out)).toContain('ALREADY');
    expect(operandOf(out)).not.toContain('TAIL');
  });
});

describe('text that has to survive being markup', () => {
  it('re-escapes a bare < in a text node', () => {
    const out = repairOmml(`<m:oMath ${NS}>${run('x<0')}</m:oMath>`);
    expect(out).toContain('x&lt;0');
    expect(out).not.toContain('<m:t xml:space="preserve">x<0');
  });

  it('escapes a bare ampersand', () => {
    expect(repairOmml(`<m:oMath ${NS}>${run('a&b')}</m:oMath>`)).toContain('a&amp;b');
  });

  it('leaves an entity that is already escaped alone', () => {
    expect(repairOmml(`<m:oMath ${NS}>${run('x&lt;0')}</m:oMath>`)).toContain('x&lt;0');
  });

  it('does not mistake <m:type/> for a text node', () => {
    const withType = `<m:oMath ${NS}><m:f><m:fPr><m:type m:val="bar"/></m:fPr><m:num>${run('a')}</m:num></m:f></m:oMath>`;
    expect(repairOmml(withType)).toContain('<m:type m:val="bar"/>');
  });
});

describe('elements Word rejects', () => {
  it('drops a duplicate m:argPr', () => {
    const dup = `<m:oMath ${NS}><m:e><m:argPr><m:scrLvl m:val="0"/></m:argPr><m:argPr><m:scrLvl m:val="0"/></m:argPr>${run('x')}</m:e></m:oMath>`;
    expect(repairOmml(dup).match(/<m:argPr>/g)).toHaveLength(1);
  });

  it('drops a property whose only attribute was undefined', () => {
    const bad = `<m:oMath ${NS}><m:r><m:rPr><m:sty m:val="undefined"/></m:rPr><m:t>x</m:t></m:r></m:oMath>`;
    const out = repairOmml(bad);
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('<m:sty');
  });
});

describe('a relation with nothing on its left', () => {
  it('gets a zero-width space in front', () => {
    const cell = `<m:oMath ${NS}><m:e>${run('=')}<m:f/></m:e></m:oMath>`;
    expect(repairOmml(cell)).toContain('​=');
  });

  it('leaves a relation that already has a left side alone', () => {
    const cell = `<m:oMath ${NS}><m:e>${run('x')}${run('=')}${run('y')}</m:e></m:oMath>`;
    expect(repairOmml(cell)).not.toContain('​');
  });
});

it('hands back anything it cannot parse rather than throwing', () => {
  const broken = '<m:oMath><m:r>unclosed';
  expect(() => repairOmml(broken)).not.toThrow();
});
